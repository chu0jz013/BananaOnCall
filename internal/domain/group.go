package domain

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

// DefaultGroupBy mirrors the `group_by` in deploy/alertmanager.yml. FR-2.2 wants
// this configurable in YAML; until bananactl exists there is one default, and it
// is deliberately the same list the sender already groups on.
var DefaultGroupBy = []string{"alertname", "namespace", "service"}

// The states an alert group moves through. The status board reads these back
// out of GSI1 as `STATE#<state>`.
const (
	StateFiring   = "firing"
	StateAcked    = "acked"
	StateResolved = "resolved"
)

// ErrInvalidTransition is a move the state machine does not allow, e.g. acking
// something already resolved. Callers turn it into a 409 (FR-6.3).
var ErrInvalidTransition = errors.New("invalid state transition")

// ErrAlreadyInState is a repeat of a move that already happened. At-least-once
// delivery makes this ordinary, not an error condition — callers answer 200.
var ErrAlreadyInState = errors.New("already in that state")

// Fingerprint is the identity of a *problem*, not of an alert (FR-2.1). Ten
// alerts sharing it are one incident and notify once.
//
// Only the group_by labels take part, so an alert that flaps a pod name or an
// instance id still lands on the same group.
func Fingerprint(integrationKey string, labels map[string]string, groupBy []string) string {
	parts := make([]string, 0, len(groupBy)+1)
	parts = append(parts, integrationKey)
	for _, k := range groupBy {
		parts = append(parts, k+"="+labels[k])
	}
	return digest(parts...)
}

// NewGroupID is time-ordered so the newest group sorts last, and carries a
// slice of the fingerprint so two groups opened in the same second cannot
// collide.
func NewGroupID(now time.Time, fingerprint string) string {
	return fmt.Sprintf("%d%s", now.UTC().Unix(), fingerprint[:8])
}

// Group is one alert group — the `AG#<id> / META` item, and the thing the
// status board calls an incident.
type Group struct {
	ID          string
	Fingerprint string
	Title       string
	Service     string
	Severity    string
	State       string
	StartedAt   time.Time
	AckedAt     *time.Time
	AckedBy     string
	ResolvedAt  *time.Time
	AlertCount  int

	// Set once the escalation starts, so an ack can stop it (FR-3.5).
	ExecutionArn string
	// Where the first notification went, so it can be edited in place (FR-5.5).
	ChatID    string
	MessageID int
}

// NewGroup opens a group around the alert that arrived first.
func NewGroup(id, fingerprint string, a Alert, now time.Time) Group {
	started := a.StartsAt
	if started.IsZero() {
		started = now
	}
	return Group{
		ID:          id,
		Fingerprint: fingerprint,
		Title:       titleOf(a),
		Service:     serviceOf(a),
		Severity:    a.Severity(),
		State:       StateFiring,
		StartedAt:   started.UTC(),
		AlertCount:  1,
	}
}

// Transition reports whether a state change is allowed. Forward only: an
// incident never un-resolves, and acking twice is a no-op rather than a fault.
func Transition(from, to string) error {
	if from == to {
		return ErrAlreadyInState
	}
	switch {
	case from == StateFiring && to == StateAcked,
		from == StateFiring && to == StateResolved,
		from == StateAcked && to == StateResolved:
		return nil
	default:
		return fmt.Errorf("%w: %s -> %s", ErrInvalidTransition, from, to)
	}
}

// SortKey is the gsi1sk the board sorts incidents on: when it closed if it
// closed, otherwise when it began. Kept here so the processor and tools/seed
// cannot drift apart.
func (g Group) SortKey() time.Time {
	if g.ResolvedAt != nil {
		return *g.ResolvedAt
	}
	return g.StartedAt
}

func titleOf(a Alert) string {
	if n := a.Name(); n != "" {
		return n
	}
	if s := a.Annotations["summary"]; s != "" {
		return s
	}
	return "unnamed alert"
}

// serviceOf prefers the label the routing tree groups on, then the two Kubernetes
// conventions an alert usually carries instead.
func serviceOf(a Alert) string {
	for _, k := range []string{"service", "namespace", "job"} {
		if v := a.Labels[k]; v != "" {
			return v
		}
	}
	return "unknown"
}

// LabelLine renders labels as a stable, readable single line for a message body.
func LabelLine(labels map[string]string, skip ...string) string {
	drop := make(map[string]bool, len(skip))
	for _, k := range skip {
		drop[k] = true
	}
	keys := make([]string, 0, len(labels))
	for k := range labels {
		if !drop[k] {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+labels[k])
	}
	return strings.Join(parts, " ")
}

// Batch is the alerts from one delivery that describe the same problem.
type Batch struct {
	Fingerprint string
	Alerts      []Alert
	// Firing is false only when every alert in the batch is resolved, which is
	// what closes the group (FR-2.5).
	Firing bool
}

// SplitByFingerprint divides one webhook delivery into the problems it is
// actually about. Alertmanager batches by its own group_by, which need not be
// ours, so a single delivery can legitimately touch two incidents.
//
// The result is ordered by fingerprint so a redelivery processes in the same
// order — under FIFO that is what keeps firing ahead of resolved.
func SplitByFingerprint(env Envelope, groupBy []string) []Batch {
	index := map[string]*Batch{}
	for _, a := range env.Alerts {
		fp := Fingerprint(env.IntegrationKey, a.Labels, groupBy)
		b, ok := index[fp]
		if !ok {
			b = &Batch{Fingerprint: fp}
			index[fp] = b
		}
		b.Alerts = append(b.Alerts, a)
		if a.Status != StatusResolved {
			b.Firing = true
		}
	}

	fps := make([]string, 0, len(index))
	for fp := range index {
		fps = append(fps, fp)
	}
	sort.Strings(fps)

	out := make([]Batch, 0, len(fps))
	for _, fp := range fps {
		out = append(out, *index[fp])
	}
	return out
}

// Representative is the alert a notification is rendered from: the first one
// still firing, else the first in the batch.
func (b Batch) Representative() Alert {
	for _, a := range b.Alerts {
		if a.Status != StatusResolved {
			return a
		}
	}
	return b.Alerts[0]
}
