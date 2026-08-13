package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/banana/bananaoncall/internal/domain"
	"github.com/banana/bananaoncall/internal/service"
	"github.com/banana/bananaoncall/internal/store"
)

type Server struct {
	Incidents *service.IncidentService
	Rotation  domain.Rotation
	ingested  atomic.Uint64
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /metrics", s.metrics)
	mux.HandleFunc("POST /api/v1/alerts", s.ingest)
	mux.HandleFunc("GET /api/v1/incidents", s.list)
	mux.HandleFunc("GET /api/v1/incidents/{id}", s.get)
	mux.HandleFunc("POST /api/v1/incidents/{id}/ack", s.ack)
	mux.HandleFunc("POST /api/v1/incidents/{id}/resolve", s.resolve)
	mux.HandleFunc("GET /api/v1/oncall/current", s.currentOnCall)
	mux.HandleFunc("POST /api/v1/integrations/grafana", s.grafana)
	mux.HandleFunc("POST /api/v1/integrations/alertmanager", s.alertmanager)
	return cors(mux)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "content-type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			return
		}
		next.ServeHTTP(w, r)
	})
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func decode(r *http.Request, v any) error {
	d := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	d.DisallowUnknownFields()
	return d.Decode(v)
}

func (s *Server) ingest(w http.ResponseWriter, r *http.Request) {
	var a domain.Alert
	if err := decode(r, &a); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	a.CreatedAt = time.Now()
	i, created, err := s.Incidents.Ingest(r.Context(), a)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	s.ingested.Add(1)
	code := http.StatusOK
	if created {
		code = http.StatusCreated
	}
	writeJSON(w, code, i)
}
func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, s.Incidents.Store.List())
}
func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	i, err := s.Incidents.Store.Get(r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, 404, map[string]string{"error": "incident not found"})
		return
	}
	writeJSON(w, 200, i)
}
func (s *Server) ack(w http.ResponseWriter, r *http.Request) {
	var p struct {
		By string `json:"by"`
	}
	_ = decode(r, &p)
	i, err := s.Incidents.Ack(r.PathValue("id"), p.By)
	if err != nil {
		writeJSON(w, 409, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, i)
}
func (s *Server) resolve(w http.ResponseWriter, r *http.Request) {
	i, err := s.Incidents.Resolve(r.PathValue("id"))
	if err != nil {
		writeJSON(w, 409, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, i)
}
func (s *Server) currentOnCall(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"team": s.Rotation.Team, "user": s.Rotation.Current(time.Now())})
}
func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("content-type", "text/plain; version=0.0.4")
	_, _ = w.Write([]byte("# HELP bananaoncall_alerts_ingested_total Alerts accepted by the API.\n# TYPE bananaoncall_alerts_ingested_total counter\nbananaoncall_alerts_ingested_total " + itoa(s.ingested.Load()) + "\n"))
}
func itoa(v uint64) string {
	if v == 0 {
		return "0"
	}
	b := make([]byte, 0, 20)
	for v > 0 {
		b = append(b, byte('0'+v%10))
		v /= 10
	}
	for i, j := 0, len(b)-1; i < j; i, j = i+1, j-1 {
		b[i], b[j] = b[j], b[i]
	}
	return string(b)
}

func (s *Server) grafana(w http.ResponseWriter, r *http.Request) {
	var p struct {
		Title   string `json:"title"`
		State   string `json:"state"`
		Message string `json:"message"`
		RuleURL string `json:"ruleUrl"`
	}
	if err := decode(r, &p); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	fp := strings.ToLower(strings.ReplaceAll(p.Title, " ", "-"))
	a := domain.Alert{Source: "grafana", Fingerprint: "grafana:" + fp, Service: "grafana", Severity: domain.SeverityCritical, Summary: p.Title + ": " + p.Message}
	i, _, err := s.Incidents.Ingest(r.Context(), a)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 202, i)
}

func (s *Server) alertmanager(w http.ResponseWriter, r *http.Request) {
	var p struct {
		Alerts []struct {
			Status      string            `json:"status"`
			Labels      map[string]string `json:"labels"`
			Annotations map[string]string `json:"annotations"`
			Fingerprint string            `json:"fingerprint"`
		} `json:"alerts"`
	}
	if err := decode(r, &p); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	out := make([]domain.Incident, 0, len(p.Alerts))
	for _, x := range p.Alerts {
		serviceName := x.Labels["service"]
		if serviceName == "" {
			serviceName = x.Labels["job"]
		}
		summary := x.Annotations["summary"]
		if summary == "" {
			summary = x.Labels["alertname"]
		}
		sev := domain.Severity(x.Labels["severity"])
		if sev == "" {
			sev = domain.SeverityWarning
		}
		i, _, err := s.Incidents.Ingest(r.Context(), domain.Alert{Source: "alertmanager", Fingerprint: "am:" + x.Fingerprint, Service: serviceName, Severity: sev, Summary: summary, Labels: x.Labels})
		if err == nil {
			out = append(out, i)
		}
	}
	writeJSON(w, 202, out)
}
