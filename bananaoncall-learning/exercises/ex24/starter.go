package exercise

import "sync"

type Store struct {
	mu    sync.RWMutex
	items map[string]string
}

func NewStore() *Store                       { return &Store{items: map[string]string{}} }
func (s *Store) Put(k, v string)             {}
func (s *Store) Get(k string) (string, bool) { return "", false }
