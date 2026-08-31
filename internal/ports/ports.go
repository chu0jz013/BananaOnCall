// Package ports declares the interfaces the domain depends on. Every port has a
// real adapter and an in-memory one, so the core can be exercised without AWS.
package ports

import (
	"context"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// AlertSink accepts a normalized batch and guarantees it will not be lost.
// ingest returns 202 only after this succeeds (FR-1.5).
type AlertSink interface {
	Publish(ctx context.Context, env domain.Envelope) error
}
