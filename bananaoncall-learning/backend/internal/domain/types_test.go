package domain

import (
	"testing"
	"time"
)

func TestIncidentTransitions(t *testing.T) {
	now := time.Now()
	i := Incident{Status: IncidentTriggered}
	if err := i.Acknowledge("banana", now); err != nil {
		t.Fatal(err)
	}
	if i.Status != IncidentAcknowledged {
		t.Fatalf("got %s", i.Status)
	}
	if err := i.Resolve(now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if i.Status != IncidentResolved {
		t.Fatalf("got %s", i.Status)
	}
}

func TestRotationCurrent(t *testing.T) {
	start := time.Date(2026, 8, 10, 9, 0, 0, 0, time.UTC)
	r := Rotation{Team: "platform", Members: []string{"Nam", "Hai", "Cao", "Thuc"}, StartsAt: start, ShiftDuration: 7 * 24 * time.Hour}
	if got := r.Current(start.Add(8 * 24 * time.Hour)); got != "Hai" {
		t.Fatalf("got %q", got)
	}
}
