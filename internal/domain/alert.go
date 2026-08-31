// Package domain holds the on-call core. It must never import an AWS SDK (D10):
// everything here has to compile and run on RKE2 as well as on Lambda.
package domain

import "time"

// Status mirrors the two states Alertmanager reports for an alert.
type Status string

const (
	StatusFiring   Status = "firing"
	StatusResolved Status = "resolved"
)

// Alert is one normalized alert, independent of the webhook flavour it arrived in.
type Alert struct {
	Status       Status            `json:"status"`
	Labels       map[string]string `json:"labels"`
	Annotations  map[string]string `json:"annotations"`
	StartsAt     time.Time         `json:"startsAt"`
	EndsAt       time.Time         `json:"endsAt,omitzero"`
	GeneratorURL string            `json:"generatorURL,omitempty"`
}

// Name returns the alertname label, the closest thing an alert has to a title.
func (a Alert) Name() string { return a.Labels["alertname"] }

// Severity defaults to "critical" when the source omits it: an alert nobody
// classified is not an alert anybody should be allowed to ignore.
func (a Alert) Severity() string {
	if s := a.Labels["severity"]; s != "" {
		return s
	}
	return "critical"
}

// Envelope is what ingest hands to the queue. The processor is the only thing
// that reads it, so the shape stays private to this repo.
type Envelope struct {
	IntegrationKey string    `json:"integrationKey"`
	Source         string    `json:"source"`
	ReceivedAt     time.Time `json:"receivedAt"`
	ExternalURL    string    `json:"externalURL,omitempty"`
	Alerts         []Alert   `json:"alerts"`

	// RoutingKey serializes same-subject batches through SQS FIFO. It is a
	// provisional grouping key, not the authoritative fingerprint (*dấu vân tay*)
	// — that one depends on the configured group_by and is computed downstream.
	RoutingKey string `json:"routingKey"`

	// DedupeKey collapses an identical retried delivery inside the FIFO
	// deduplication window.
	DedupeKey string `json:"dedupeKey"`
}
