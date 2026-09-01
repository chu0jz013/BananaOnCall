package domain_test

import (
	"errors"
	"testing"
	"time"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

func TestFingerprintIgnoresLabelsOutsideGroupBy(t *testing.T) {
	// The whole point of FR-2.1: a pod restarting under the same problem must
	// not open a second incident.
	a := map[string]string{"alertname": "HighErrorRate", "namespace": "payments", "service": "checkout", "pod": "checkout-abc"}
	b := map[string]string{"alertname": "HighErrorRate", "namespace": "payments", "service": "checkout", "pod": "checkout-xyz"}

	if domain.Fingerprint("k", a, domain.DefaultGroupBy) != domain.Fingerprint("k", b, domain.DefaultGroupBy) {
		t.Error("fingerprint changed on a label outside group_by")
	}
}

func TestFingerprintSeparatesDifferentSubjects(t *testing.T) {
	a := map[string]string{"alertname": "HighErrorRate", "service": "checkout"}
	b := map[string]string{"alertname": "HighErrorRate", "service": "search"}

	if domain.Fingerprint("k", a, domain.DefaultGroupBy) == domain.Fingerprint("k", b, domain.DefaultGroupBy) {
		t.Error("two services collapsed into one fingerprint")
	}
	// A different integration must never share a group with ours either.
	if domain.Fingerprint("k1", a, domain.DefaultGroupBy) == domain.Fingerprint("k2", a, domain.DefaultGroupBy) {
		t.Error("fingerprint ignored the integration key")
	}
}

func TestTransition(t *testing.T) {
	cases := []struct {
		from, to string
		want     error
	}{
		{domain.StateFiring, domain.StateAcked, nil},
		{domain.StateFiring, domain.StateResolved, nil},
		{domain.StateAcked, domain.StateResolved, nil},
		{domain.StateAcked, domain.StateAcked, domain.ErrAlreadyInState},
		{domain.StateResolved, domain.StateAcked, domain.ErrInvalidTransition},
		{domain.StateAcked, domain.StateFiring, domain.ErrInvalidTransition},
	}
	for _, c := range cases {
		err := domain.Transition(c.from, c.to)
		if !errors.Is(err, c.want) {
			t.Errorf("%s -> %s: want %v, got %v", c.from, c.to, c.want, err)
		}
	}
}

func TestNewGroupTakesTitleAndServiceFromLabels(t *testing.T) {
	a := domain.Alert{
		Labels:   map[string]string{"alertname": "PodCrashLooping", "namespace": "payments"},
		StartsAt: time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC),
		Status:   domain.StatusFiring,
	}
	g := domain.NewGroup("g1", "fp", a, fixedNow)

	if g.Title != "PodCrashLooping" {
		t.Errorf("title: got %q", g.Title)
	}
	// No `service` label, so it falls back to namespace rather than "unknown".
	if g.Service != "payments" {
		t.Errorf("service: got %q", g.Service)
	}
	if g.Severity != "critical" {
		t.Errorf("severity should default to critical, got %q", g.Severity)
	}
	if !g.StartedAt.Equal(a.StartsAt) {
		t.Errorf("startedAt should come from the alert, got %v", g.StartedAt)
	}
	if g.State != domain.StateFiring {
		t.Errorf("state: got %q", g.State)
	}
}

func TestSplitByFingerprintSeparatesTwoProblemsInOneDelivery(t *testing.T) {
	env := domain.Envelope{
		IntegrationKey: "k",
		Alerts: []domain.Alert{
			{Status: domain.StatusFiring, Labels: map[string]string{"alertname": "A", "service": "checkout"}},
			{Status: domain.StatusFiring, Labels: map[string]string{"alertname": "A", "service": "checkout", "pod": "x"}},
			{Status: domain.StatusResolved, Labels: map[string]string{"alertname": "B", "service": "search"}},
		},
	}

	batches := domain.SplitByFingerprint(env, domain.DefaultGroupBy)
	if len(batches) != 2 {
		t.Fatalf("want 2 batches, got %d", len(batches))
	}

	byFiring := map[bool]domain.Batch{}
	for _, b := range batches {
		byFiring[b.Firing] = b
	}
	if got := len(byFiring[true].Alerts); got != 2 {
		t.Errorf("the two alerts about one problem should share a batch, got %d", got)
	}
	if byFiring[false].Alerts[0].Name() != "B" {
		t.Error("the resolved alert landed in the wrong batch")
	}
	if byFiring[true].Representative().Name() != "A" {
		t.Error("representative alert is wrong")
	}
}
