package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

// ErrEmptyBatch is returned when a webhook body parses but carries no alerts.
var ErrEmptyBatch = errors.New("payload contains no alerts")

// alertmanagerPayload is the v4 webhook contract.
// https://prometheus.io/docs/alerting/latest/configuration/#webhook_config
type alertmanagerPayload struct {
	Version           string            `json:"version"`
	GroupKey          string            `json:"groupKey"`
	Status            string            `json:"status"`
	Receiver          string            `json:"receiver"`
	ExternalURL       string            `json:"externalURL"`
	GroupLabels       map[string]string `json:"groupLabels"`
	CommonLabels      map[string]string `json:"commonLabels"`
	CommonAnnotations map[string]string `json:"commonAnnotations"`
	Alerts            []struct {
		Status       string            `json:"status"`
		Labels       map[string]string `json:"labels"`
		Annotations  map[string]string `json:"annotations"`
		StartsAt     time.Time         `json:"startsAt"`
		EndsAt       time.Time         `json:"endsAt"`
		GeneratorURL string            `json:"generatorURL"`
	} `json:"alerts"`
}

// ParseAlertmanager normalizes an Alertmanager v4 webhook body into an Envelope.
// It never touches the network or a database, so it is fully unit-testable.
func ParseAlertmanager(integrationKey string, body []byte, now time.Time) (Envelope, error) {
	var p alertmanagerPayload
	if err := json.Unmarshal(body, &p); err != nil {
		return Envelope{}, fmt.Errorf("decode alertmanager payload: %w", err)
	}
	if len(p.Alerts) == 0 {
		return Envelope{}, ErrEmptyBatch
	}

	env := Envelope{
		IntegrationKey: integrationKey,
		Source:         "alertmanager",
		ReceivedAt:     now.UTC(),
		ExternalURL:    p.ExternalURL,
		Alerts:         make([]Alert, 0, len(p.Alerts)),
	}

	for _, a := range p.Alerts {
		env.Alerts = append(env.Alerts, Alert{
			Status:       normalizeStatus(a.Status),
			Labels:       mergeLabels(p.CommonLabels, a.Labels),
			Annotations:  mergeLabels(p.CommonAnnotations, a.Annotations),
			StartsAt:     a.StartsAt.UTC(),
			EndsAt:       a.EndsAt.UTC(),
			GeneratorURL: a.GeneratorURL,
		})
	}

	// Prefer Alertmanager's own groupKey: it already reflects the sender's
	// group_by, so batches about one subject stay in one FIFO message group.
	subject := p.GroupKey
	if subject == "" {
		subject = LabelDigest(env.Alerts[0].Labels)
	}
	env.RoutingKey = digest(integrationKey, subject)
	env.DedupeKey = digest(integrationKey, string(body))

	return env, nil
}

func normalizeStatus(s string) Status {
	if Status(strings.ToLower(s)) == StatusResolved {
		return StatusResolved
	}
	return StatusFiring
}

// mergeLabels overlays per-alert labels on top of the batch-common ones.
// The per-alert value wins; neither input map is mutated.
func mergeLabels(common, own map[string]string) map[string]string {
	out := make(map[string]string, len(common)+len(own))
	for k, v := range common {
		out[k] = v
	}
	for k, v := range own {
		out[k] = v
	}
	return out
}

// LabelDigest is a stable hash over a whole label set, used when the sender
// gives us nothing better to group on.
func LabelDigest(labels map[string]string) string {
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for _, k := range keys {
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(labels[k])
		b.WriteByte('\x00')
	}
	return b.String()
}

func digest(parts ...string) string {
	h := sha256.New()
	for _, p := range parts {
		h.Write([]byte(p))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}
