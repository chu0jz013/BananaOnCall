package domain_test

import (
	"strings"
	"testing"
	"time"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

func sampleAlert() domain.Alert {
	return domain.Alert{
		Status: domain.StatusFiring,
		Labels: map[string]string{
			"alertname": "HighErrorRate", "service": "checkout",
			"namespace": "payments", "severity": "critical",
		},
		Annotations: map[string]string{
			"summary":     "5xx above 2% for 5m",
			"runbook_url": "https://wiki/runbooks/high-error-rate",
		},
		StartsAt:     time.Date(2026, 8, 23, 10, 0, 0, 0, time.UTC),
		GeneratorURL: "http://prometheus/graph",
	}
}

// FR-5.6 is the contract: everything needed to act, without a laptop.
func TestRenderAlertCarriesEverythingNeededToAct(t *testing.T) {
	a := sampleAlert()
	g := domain.NewGroup("g-1", "fp", a, fixedNow)
	m := domain.RenderAlert(g, a, 1, fixedNow.Add(90*time.Second))

	for _, want := range []string{"CRITICAL", "HighErrorRate", "5xx above 2%", "checkout", "namespace=payments"} {
		if !strings.Contains(m.Text, want) {
			t.Errorf("message is missing %q:\n%s", want, m.Text)
		}
	}
	// Rendered in Asia/Ho_Chi_Minh, so 10:00Z reads as 17:00 (FR-4.7).
	if !strings.Contains(m.Text, "17:00:00") {
		t.Errorf("start time is not in the display zone:\n%s", m.Text)
	}
	if !strings.Contains(m.Text, g.ID) {
		t.Error("message does not name the incident it belongs to")
	}

	var actions, links []domain.Button
	for _, row := range m.Buttons {
		for _, b := range row {
			if b.CallbackData != "" {
				actions = append(actions, b)
			} else {
				links = append(links, b)
			}
		}
	}
	if len(actions) != 3 {
		t.Errorf("want Ack, Resolve and Silence, got %d action buttons", len(actions))
	}
	if len(links) != 2 {
		t.Errorf("want a runbook and a source link, got %d", len(links))
	}
}

func TestRenderAlertSaysWhichEscalationStepItIs(t *testing.T) {
	a := sampleAlert()
	g := domain.NewGroup("g-1", "fp", a, fixedNow)

	if strings.Contains(domain.RenderAlert(g, a, 1, fixedNow).Text, "escalation step") {
		t.Error("the first page must not read as an escalation")
	}
	if !strings.Contains(domain.RenderAlert(g, a, 2, fixedNow).Text, "escalation step 2") {
		t.Error("a later page should say nobody acked yet")
	}
}

func TestCallbackDataRoundTrips(t *testing.T) {
	a := sampleAlert()
	g := domain.NewGroup("1756000000abcdef12", "fp", a, fixedNow)
	m := domain.RenderAlert(g, a, 1, fixedNow)

	for _, row := range m.Buttons {
		for _, b := range row {
			if b.CallbackData == "" {
				continue
			}
			// Telegram's own hard limit, and a silent truncation would break ack.
			if len(b.CallbackData) > 64 {
				t.Errorf("callback_data %q is over Telegram's 64-byte limit", b.CallbackData)
			}
			action, id, ok := domain.ParseCallback(b.CallbackData)
			if !ok || id != g.ID || action == "" {
				t.Errorf("callback %q parsed back as action=%q id=%q ok=%v", b.CallbackData, action, id, ok)
			}
		}
	}
	if _, _, ok := domain.ParseCallback("drop-table:1"); ok {
		t.Error("an unknown action must be refused")
	}
	if _, _, ok := domain.ParseCallback("ack:"); ok {
		t.Error("an empty group id must be refused")
	}
}

// FR-5.5: after an ack the old message says who took it, and stops offering
// a button that would page the team again.
func TestRenderAckedRewritesTheMessageOnce(t *testing.T) {
	a := sampleAlert()
	g := domain.NewGroup("g-1", "fp", a, fixedNow)
	original := domain.RenderAlert(g, a, 1, fixedNow).Text

	acked := domain.RenderAcked(g, original, "mai", fixedNow)
	if !strings.HasPrefix(acked.Text, "✅ Acked by @mai") {
		t.Errorf("acked message does not lead with who took it:\n%s", acked.Text)
	}
	if !strings.Contains(acked.Text, "HighErrorRate") {
		t.Error("acked message dropped the alert body")
	}
	if len(acked.Buttons) != 1 || len(acked.Buttons[0]) != 1 {
		t.Errorf("an acked incident should offer only Resolve, got %+v", acked.Buttons)
	}

	// Editing twice must not stack headers.
	again := domain.RenderAcked(g, acked.Text, "linh", fixedNow)
	if strings.Count(again.Text, "Acked by") != 1 {
		t.Errorf("status headers stacked up:\n%s", again.Text)
	}
}

func TestDedupeKeyIsPerGroupStepAndUser(t *testing.T) {
	base := domain.DedupeKey("g1", 1, "telegram", "mai")
	if base == domain.DedupeKey("g1", 2, "telegram", "mai") {
		t.Error("two escalation steps shared a dedupe key")
	}
	if base == domain.DedupeKey("g1", 1, "telegram", "linh") {
		t.Error("two users shared a dedupe key")
	}
	if base != domain.DedupeKey("g1", 1, "telegram", "mai") {
		t.Error("dedupe key is not stable across calls")
	}
}
