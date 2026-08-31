package domain_test

import (
	"errors"
	"testing"
	"time"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

const amPayload = `{
  "version": "4",
  "groupKey": "{}:{alertname=\"HighErrorRate\"}",
  "status": "firing",
  "receiver": "bananaoncall",
  "externalURL": "http://alertmanager:9093",
  "commonLabels": {"namespace": "payments", "severity": "critical"},
  "commonAnnotations": {"runbook_url": "https://wiki/runbooks/high-error-rate"},
  "alerts": [
    {
      "status": "firing",
      "labels": {"alertname": "HighErrorRate", "service": "checkout"},
      "annotations": {"summary": "5xx above 2% for 5m"},
      "startsAt": "2026-08-23T10:00:00Z",
      "generatorURL": "http://prometheus/graph"
    }
  ]
}`

var fixedNow = time.Date(2026, 8, 23, 10, 0, 5, 0, time.UTC)

func TestParseAlertmanagerMergesCommonLabels(t *testing.T) {
	env, err := domain.ParseAlertmanager("int-key-1", []byte(amPayload), fixedNow)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(env.Alerts) != 1 {
		t.Fatalf("want 1 alert, got %d", len(env.Alerts))
	}
	a := env.Alerts[0]

	// commonLabels must be visible on the alert, not stranded on the batch.
	if got := a.Labels["namespace"]; got != "payments" {
		t.Errorf("namespace label: want payments, got %q", got)
	}
	if got := a.Labels["service"]; got != "checkout" {
		t.Errorf("service label: want checkout, got %q", got)
	}
	if got := a.Annotations["runbook_url"]; got == "" {
		t.Error("common annotation runbook_url was dropped")
	}
	if a.Status != domain.StatusFiring {
		t.Errorf("status: want firing, got %q", a.Status)
	}
	if a.Severity() != "critical" {
		t.Errorf("severity: want critical, got %q", a.Severity())
	}
}

func TestPerAlertLabelBeatsCommonLabel(t *testing.T) {
	payload := `{"alerts":[{"status":"firing","labels":{"alertname":"X","severity":"warning"}}],
	             "commonLabels":{"severity":"critical"}}`

	env, err := domain.ParseAlertmanager("k", []byte(payload), fixedNow)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got := env.Alerts[0].Severity(); got != "warning" {
		t.Errorf("per-alert label must win: want warning, got %q", got)
	}
}

func TestSeverityDefaultsToCritical(t *testing.T) {
	payload := `{"alerts":[{"status":"firing","labels":{"alertname":"Unlabelled"}}]}`

	env, err := domain.ParseAlertmanager("k", []byte(payload), fixedNow)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	// An alert nobody classified must not be silently downgraded.
	if got := env.Alerts[0].Severity(); got != "critical" {
		t.Errorf("want critical, got %q", got)
	}
}

func TestRoutingKeyIsStableAcrossIdenticalBatches(t *testing.T) {
	a, err := domain.ParseAlertmanager("int-key-1", []byte(amPayload), fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	b, err := domain.ParseAlertmanager("int-key-1", []byte(amPayload), fixedNow.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}

	// Same subject, later delivery: must stay in the same FIFO message group.
	if a.RoutingKey != b.RoutingKey {
		t.Errorf("routing key drifted: %s vs %s", a.RoutingKey, b.RoutingKey)
	}
	if a.DedupeKey != b.DedupeKey {
		t.Errorf("dedupe key drifted for an identical body")
	}
}

func TestRoutingKeyIsScopedPerIntegration(t *testing.T) {
	a, _ := domain.ParseAlertmanager("int-key-1", []byte(amPayload), fixedNow)
	b, _ := domain.ParseAlertmanager("int-key-2", []byte(amPayload), fixedNow)

	// Two teams sending the same alertname must not collapse into one group.
	if a.RoutingKey == b.RoutingKey {
		t.Error("routing key must include the integration key")
	}
}

func TestRoutingKeyFallsBackToLabelsWithoutGroupKey(t *testing.T) {
	one := `{"alerts":[{"status":"firing","labels":{"alertname":"A","pod":"p1"}}]}`
	two := `{"alerts":[{"status":"firing","labels":{"alertname":"A","pod":"p2"}}]}`

	a, err := domain.ParseAlertmanager("k", []byte(one), fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	b, err := domain.ParseAlertmanager("k", []byte(two), fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	if a.RoutingKey == b.RoutingKey {
		t.Error("different label sets must not share a routing key when groupKey is absent")
	}
}

func TestResolvedStatusSurvives(t *testing.T) {
	payload := `{"alerts":[{"status":"resolved","labels":{"alertname":"A"}}]}`

	env, err := domain.ParseAlertmanager("k", []byte(payload), fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	if env.Alerts[0].Status != domain.StatusResolved {
		t.Errorf("want resolved, got %q", env.Alerts[0].Status)
	}
}

func TestEmptyBatchIsRejected(t *testing.T) {
	_, err := domain.ParseAlertmanager("k", []byte(`{"alerts":[]}`), fixedNow)
	if !errors.Is(err, domain.ErrEmptyBatch) {
		t.Errorf("want ErrEmptyBatch, got %v", err)
	}
}

func TestMalformedBodyIsRejected(t *testing.T) {
	if _, err := domain.ParseAlertmanager("k", []byte(`not json`), fixedNow); err == nil {
		t.Error("want an error for a non-JSON body")
	}
}
