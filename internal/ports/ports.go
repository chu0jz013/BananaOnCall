// Package ports declares the interfaces the domain depends on. Every port has a
// real adapter and an in-memory one, so the core can be exercised without AWS.
package ports

import (
	"context"
	"time"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// AlertSink accepts a normalized batch and guarantees it will not be lost.
// ingest returns 202 only after this succeeds (FR-1.5).
type AlertSink interface {
	Publish(ctx context.Context, env domain.Envelope) error
}

// GroupStore is the alert-group side of the single table. Every method is
// expected to be safe under at-least-once delivery: SQS will redeliver, and a
// redelivery must not open a second incident or send a second page.
type GroupStore interface {
	// OpenOrJoin claims the fingerprint for a new group, or returns the group
	// that already owns it with its alert count incremented (FR-2.3, FR-2.4).
	// created reports which of the two happened.
	OpenOrJoin(ctx context.Context, g domain.Group) (out domain.Group, created bool, err error)
	Get(ctx context.Context, groupID string) (domain.Group, error)
	// SetExecution records the escalation execution so an ack can stop it.
	SetExecution(ctx context.Context, groupID, executionArn string) error
	// RecordNotification stores where the last page went, so it can be edited
	// in place once somebody acks (FR-5.5).
	RecordNotification(ctx context.Context, groupID, chatID string, messageID, level int) error
	// Ack moves firing -> acked, failing with domain.ErrInvalidTransition or
	// domain.ErrAlreadyInState rather than overwriting (FR-6.3).
	Ack(ctx context.Context, groupID, by string, at time.Time) (domain.Group, error)
	Resolve(ctx context.Context, groupID, by string, at time.Time) (domain.Group, error)
	// Timeline appends "who did what, when, from where" (FR-6.5).
	Timeline(ctx context.Context, groupID, actor, action, detail string, at time.Time) error
}

// PolicyStore reads escalation chains. Policies live in the table so the
// processor and the notifier cannot disagree about a chain mid-incident.
type PolicyStore interface {
	Policy(ctx context.Context, id string) (domain.Policy, error)
}

// ScheduleStore materializes and reads the rota. Reads must be a Query on a
// key, never an ICS parse at page time (FR-4.4).
type ScheduleStore interface {
	Shifts(ctx context.Context, scheduleID string, from, to time.Time) ([]domain.Shift, error)
	PutShifts(ctx context.Context, shifts []domain.Shift) error
	Contact(ctx context.Context, userID, channel string) (domain.Contact, error)
}

// Notifier is a chat transport. The domain renders a domain.Message; only the
// adapter knows it is talking to Telegram.
type Notifier interface {
	Send(ctx context.Context, chatID string, m domain.Message) (messageID int, err error)
	Edit(ctx context.Context, chatID string, messageID int, m domain.Message) error
	Answer(ctx context.Context, callbackID, text string) error
}

// Escalator drives the wait-and-retry ladder. Backed by Step Functions (D1),
// so the timer survives a Lambda restart instead of living in memory (FR-3.7).
type Escalator interface {
	Start(ctx context.Context, groupID string) (executionArn string, err error)
	Stop(ctx context.Context, executionArn, reason string) error
}
