package domain

import (
	"errors"
	"time"
)

type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityWarning  Severity = "warning"
	SeverityCritical Severity = "critical"
)

type IncidentStatus string

const (
	IncidentTriggered    IncidentStatus = "triggered"
	IncidentAcknowledged IncidentStatus = "acknowledged"
	IncidentResolved     IncidentStatus = "resolved"
)

type Alert struct {
	ID          string            `json:"id"`
	Source      string            `json:"source"`
	Fingerprint string            `json:"fingerprint"`
	Service     string            `json:"service"`
	Severity    Severity          `json:"severity"`
	Summary     string            `json:"summary"`
	Labels      map[string]string `json:"labels,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
}

type Incident struct {
	ID             string         `json:"id"`
	Fingerprint    string         `json:"fingerprint"`
	Service        string         `json:"service"`
	Severity       Severity       `json:"severity"`
	Summary        string         `json:"summary"`
	Status         IncidentStatus `json:"status"`
	AlertCount     int            `json:"alert_count"`
	AcknowledgedBy string         `json:"acknowledged_by,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

func (i *Incident) Acknowledge(by string, now time.Time) error {
	if i.Status != IncidentTriggered {
		return errors.New("incident can only be acknowledged from triggered state")
	}
	i.Status = IncidentAcknowledged
	i.AcknowledgedBy = by
	i.UpdatedAt = now
	return nil
}

func (i *Incident) Resolve(now time.Time) error {
	if i.Status == IncidentResolved {
		return errors.New("incident is already resolved")
	}
	i.Status = IncidentResolved
	i.UpdatedAt = now
	return nil
}

type Rotation struct {
	Team          string        `json:"team"`
	Members       []string      `json:"members"`
	StartsAt      time.Time     `json:"starts_at"`
	ShiftDuration time.Duration `json:"-"`
}

func (r Rotation) Current(now time.Time) string {
	if len(r.Members) == 0 || r.ShiftDuration <= 0 || now.Before(r.StartsAt) {
		return ""
	}
	idx := int(now.Sub(r.StartsAt)/r.ShiftDuration) % len(r.Members)
	return r.Members[idx]
}
