package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/banana/bananaoncall/internal/service"
	"github.com/banana/bananaoncall/internal/store"
)

func TestHealth(t *testing.T) {
	s := &Server{Incidents: service.NewIncidentService(store.NewIncidentStore())}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	s.Handler().ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("got %d", rr.Code)
	}
}
