package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/banana/bananaoncall/internal/domain"
	"github.com/banana/bananaoncall/internal/store"
)

type Notifier interface {
	Notify(context.Context, domain.Incident) error
}

type IncidentService struct {
	Store     *store.IncidentStore
	Now       func() time.Time
	Notifiers []Notifier
}

func NewIncidentService(s *store.IncidentStore) *IncidentService {
	return &IncidentService{Store: s, Now: time.Now}
}

func randomID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

func (s *IncidentService) Ingest(ctx context.Context, a domain.Alert) (domain.Incident, bool, error) {
	if strings.TrimSpace(a.Fingerprint) == "" || strings.TrimSpace(a.Service) == "" || strings.TrimSpace(a.Summary) == "" {
		return domain.Incident{}, false, errors.New("fingerprint, service and summary are required")
	}
	if existing, ok := s.Store.FindOpenByFingerprint(a.Fingerprint); ok {
		existing.AlertCount++
		existing.UpdatedAt = s.Now()
		s.Store.Save(existing)
		return existing, false, nil
	}
	now := s.Now()
	i := domain.Incident{ID: randomID("inc_"), Fingerprint: a.Fingerprint, Service: a.Service, Severity: a.Severity, Summary: a.Summary, Status: domain.IncidentTriggered, AlertCount: 1, CreatedAt: now, UpdatedAt: now}
	s.Store.Save(i)
	for _, n := range s.Notifiers {
		_ = n.Notify(ctx, i)
	} // Phase 5: make durable + observable.
	return i, true, nil
}

func (s *IncidentService) Ack(id, by string) (domain.Incident, error) {
	i, err := s.Store.Get(id)
	if err != nil {
		return domain.Incident{}, err
	}
	if strings.TrimSpace(by) == "" {
		by = "anonymous"
	}
	if err := i.Acknowledge(by, s.Now()); err != nil {
		return domain.Incident{}, err
	}
	s.Store.Save(i)
	return i, nil
}

func (s *IncidentService) Resolve(id string) (domain.Incident, error) {
	i, err := s.Store.Get(id)
	if err != nil {
		return domain.Incident{}, err
	}
	if err := i.Resolve(s.Now()); err != nil {
		return domain.Incident{}, err
	}
	s.Store.Save(i)
	return i, nil
}
