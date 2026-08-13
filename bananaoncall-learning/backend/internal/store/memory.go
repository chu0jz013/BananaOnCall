package store

import (
	"errors"
	"sort"
	"sync"

	"github.com/banana/bananaoncall/internal/domain"
)

var ErrNotFound = errors.New("not found")

type IncidentStore struct {
	mu            sync.RWMutex
	byID          map[string]domain.Incident
	byFingerprint map[string]string
}

func NewIncidentStore() *IncidentStore {
	return &IncidentStore{byID: map[string]domain.Incident{}, byFingerprint: map[string]string{}}
}

func (s *IncidentStore) FindOpenByFingerprint(fp string) (domain.Incident, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	id, ok := s.byFingerprint[fp]
	if !ok {
		return domain.Incident{}, false
	}
	i, ok := s.byID[id]
	if !ok || i.Status == domain.IncidentResolved {
		return domain.Incident{}, false
	}
	return i, true
}

func (s *IncidentStore) Save(i domain.Incident) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.byID[i.ID] = i
	if i.Status == domain.IncidentResolved {
		delete(s.byFingerprint, i.Fingerprint)
	} else {
		s.byFingerprint[i.Fingerprint] = i.ID
	}
}

func (s *IncidentStore) Get(id string) (domain.Incident, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	i, ok := s.byID[id]
	if !ok {
		return domain.Incident{}, ErrNotFound
	}
	return i, nil
}

func (s *IncidentStore) List() []domain.Incident {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Incident, 0, len(s.byID))
	for _, i := range s.byID {
		out = append(out, i)
	}
	sort.Slice(out, func(a, b int) bool { return out[a].CreatedAt.After(out[b].CreatedAt) })
	return out
}
