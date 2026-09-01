package domain_test

import (
	"os"
	"testing"
	"time"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// The real fixture the ical container serves, so a change to it breaks this
// test rather than the running system.
func fixtureICS(t *testing.T) []byte {
	t.Helper()
	b, err := os.ReadFile("../../fixtures/oncall.ics")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return b
}

func TestParseICSExpandsTheFortnightlyRotation(t *testing.T) {
	// Two events, each FREQ=WEEKLY;INTERVAL=2 and a week long, offset by a
	// week: between them they cover every day with exactly one person.
	from := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	to := from.AddDate(0, 0, 28)

	shifts, err := domain.ParseICS("primary", fixtureICS(t), from, to)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(shifts) < 4 {
		t.Fatalf("want at least 4 shifts across 4 weeks, got %d", len(shifts))
	}

	seen := map[string]int{}
	for _, s := range shifts {
		seen[s.UserID]++
		if s.EndsAt.Sub(s.StartsAt) != 7*24*time.Hour {
			t.Errorf("shift %v is %v long, want 168h", s.StartsAt, s.EndsAt.Sub(s.StartsAt))
		}
	}
	if seen["mai"] == 0 || seen["linh"] == 0 {
		t.Errorf("both rotations should appear, got %v", seen)
	}

	// Every day in the window must have exactly one person on call — that is
	// what makes the rota answerable at all (FR-4.4).
	for d := from; d.Before(to); d = d.AddDate(0, 0, 1) {
		noon := d.Add(12 * time.Hour)
		covering := 0
		for _, s := range shifts {
			if s.Covers(noon) {
				covering++
			}
		}
		if covering != 1 {
			t.Errorf("%s: %d shifts cover noon, want 1", d.Format(time.DateOnly), covering)
		}
	}
}

func TestParseICSIgnoresEventsThatAreNotShifts(t *testing.T) {
	ics := []byte("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:lunch\r\nDTSTART:20260105T000000Z\r\n" +
		"DTEND:20260105T010000Z\r\nSUMMARY:team lunch\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")

	shifts, err := domain.ParseICS("primary", ics, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(shifts) != 0 {
		t.Errorf("a non-oncall event became a shift: %+v", shifts)
	}
}

func TestParseICSUnfoldsContinuationLines(t *testing.T) {
	// RFC 5545 folds long lines; a naive line reader would title this "oncall: m".
	ics := []byte("BEGIN:VEVENT\r\nDTSTART:20260105T000000Z\r\nDTEND:20260106T000000Z\r\n" +
		"SUMMARY:oncall: m\r\n ai\r\nEND:VEVENT\r\n")

	shifts, err := domain.ParseICS("primary", ics, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(shifts) != 1 || shifts[0].UserID != "mai" {
		t.Errorf("want one shift for mai, got %+v", shifts)
	}
}

func TestWhoIsOnCallPrefersAnOverride(t *testing.T) {
	base := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC)
	shifts := []domain.Shift{
		{UserID: "mai", StartsAt: base, EndsAt: base.AddDate(0, 0, 7), Source: "ical"},
		{UserID: "linh", StartsAt: base.AddDate(0, 0, 2), EndsAt: base.AddDate(0, 0, 3), Source: "override"},
	}

	if got, ok := domain.WhoIsOnCall(shifts, base.Add(36*time.Hour)); !ok || got.UserID != "mai" {
		t.Errorf("outside the override: got %+v ok=%v", got, ok)
	}
	if got, ok := domain.WhoIsOnCall(shifts, base.AddDate(0, 0, 2).Add(time.Hour)); !ok || got.UserID != "linh" {
		t.Errorf("inside the override: got %+v ok=%v", got, ok)
	}
	if _, ok := domain.WhoIsOnCall(shifts, base.AddDate(0, 0, 30)); ok {
		t.Error("an empty rota must report nobody, not a stale shift")
	}
}
