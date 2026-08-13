package solution

import "sync"

type Store struct {
	mu    sync.RWMutex
	items map[string]string
}

func NewStore() *Store           { return &Store{items: map[string]string{}} }
func (s *Store) Put(k, v string) { s.mu.Lock(); defer s.mu.Unlock(); s.items[k] = v }
func (s *Store) Get(k string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.items[k]
	return v, ok
}
