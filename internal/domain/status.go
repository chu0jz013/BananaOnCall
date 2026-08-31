package domain

import (
	"math"
	"sort"
	"time"
)

// SLIWindowDays is the rolling window every SLI in design doc §08 is measured
// over. The doc also quotes a monthly error budget of 43m49s; that is the same
// 99.9% expressed over a calendar month, so the numbers here are smaller.
const SLIWindowDays = 28

// SLIDefinition is the contract for one indicator. Targets come from §08.
type SLIDefinition struct {
	Key    string
	Label  string
	Detail string
	// Target is a percentage, e.g. 99.9.
	Target float64
}

// SLIDefinitions is the published set, in the order the status board shows them.
var SLIDefinitions = []SLIDefinition{
	{"ingest_availability", "Ingest availability",
		"Webhook requests that did not return 5xx", 99.9},
	{"notification_latency", "Notification latency",
		"Alerts whose first message went out within 30 seconds", 99},
	{"delivery_success", "Delivery success",
		"Messages the provider confirmed it received", 99.5},
	{"escalation_correctness", "Escalation correctness",
		"Escalation steps that ran on time, within 30 seconds", 99},
}

// DailyCount is one day of good-events-out-of-total for one SLI.
type DailyCount struct {
	Date  string `json:"date"`
	Good  int64  `json:"good"`
	Total int64  `json:"total"`
}

// ErrorBudget expresses the target as time rather than a ratio, which is the
// only form anyone actually reasons about during an incident.
type ErrorBudget struct {
	TotalSeconds     int64   `json:"totalSeconds"`
	ConsumedSeconds  int64   `json:"consumedSeconds"`
	RemainingSeconds int64   `json:"remainingSeconds"`
	ConsumedPercent  float64 `json:"consumedPercent"`
}

// SLIStatus is one indicator, resolved over the window.
type SLIStatus struct {
	Key         string       `json:"key"`
	Label       string       `json:"label"`
	Detail      string       `json:"detail"`
	Target      float64      `json:"target"`
	Actual      float64      `json:"actual"`
	Meeting     bool         `json:"meeting"`
	WindowDays  int          `json:"windowDays"`
	ErrorBudget ErrorBudget  `json:"errorBudget"`
	Days        []DailyCount `json:"days"`
}

// Incident is one alert group as the public board sees it. Labels that could
// leak internal topology are deliberately not carried here.
type Incident struct {
	ID         string     `json:"id"`
	Title      string     `json:"title"`
	Severity   string     `json:"severity"`
	Service    string     `json:"service"`
	State      string     `json:"state"`
	StartedAt  time.Time  `json:"startedAt"`
	AckedAt    *time.Time `json:"ackedAt,omitempty"`
	ResolvedAt *time.Time `json:"resolvedAt,omitempty"`
	AlertCount int        `json:"alertCount"`
}

// TimeToAck returns how long the first responder took, if anyone acked.
func (i Incident) TimeToAck() (time.Duration, bool) {
	if i.AckedAt == nil {
		return 0, false
	}
	return i.AckedAt.Sub(i.StartedAt), true
}

// TimeToResolve returns the full incident duration, if it closed.
func (i Incident) TimeToResolve() (time.Duration, bool) {
	if i.ResolvedAt == nil {
		return 0, false
	}
	return i.ResolvedAt.Sub(i.StartedAt), true
}

// Aggregate is an MTTA or MTTR figure plus how many incidents produced it —
// a mean over three samples deserves to be read differently from one over three
// hundred, so the sample size travels with it.
type Aggregate struct {
	Seconds    int64 `json:"seconds"`
	SampleSize int   `json:"sampleSize"`
}

// Board is the whole public status-page payload. It is deliberately not
// called Status: that name already belongs to an alert's firing/resolved state.
type Board struct {
	GeneratedAt     time.Time   `json:"generatedAt"`
	Health          string      `json:"health"`
	SLIs            []SLIStatus `json:"slis"`
	ActiveIncidents []Incident  `json:"activeIncidents"`
	RecentIncidents []Incident  `json:"recentIncidents"`
	MTTA            Aggregate   `json:"mtta"`
	MTTR            Aggregate   `json:"mttr"`
}

// Health values, ordered by severity.
const (
	HealthOperational = "operational"
	HealthDegraded    = "degraded"
	HealthDown        = "down"
)

// BuildSLIStatus folds a window of daily counts into one indicator.
//
// A window with no data at all reports 100% rather than 0%: an SLI nobody has
// recorded an event for has not failed, and showing a fresh deployment as
// totally down would be worse than useless.
func BuildSLIStatus(def SLIDefinition, days []DailyCount) SLIStatus {
	var good, total int64
	for _, d := range days {
		good += d.Good
		total += d.Total
	}

	actual := 100.0
	if total > 0 {
		actual = float64(good) / float64(total) * 100
	}

	windowSeconds := int64(SLIWindowDays) * 24 * 60 * 60
	budgetTotal := int64(math.Round(float64(windowSeconds) * (100 - def.Target) / 100))

	// Consumed budget is the share of the allowance the observed failure rate
	// has eaten, clamped so a badly breached SLI reads "0 left" not "negative".
	consumed := int64(0)
	if budgetTotal > 0 {
		failureRate := (100 - actual) / 100
		consumed = int64(math.Round(float64(windowSeconds) * failureRate))
		if consumed > budgetTotal {
			consumed = budgetTotal
		}
	}

	pct := 0.0
	if budgetTotal > 0 {
		pct = float64(consumed) / float64(budgetTotal) * 100
	}

	sort.Slice(days, func(i, j int) bool { return days[i].Date < days[j].Date })

	return SLIStatus{
		Key:        def.Key,
		Label:      def.Label,
		Detail:     def.Detail,
		Target:     def.Target,
		Actual:     math.Round(actual*1000) / 1000,
		Meeting:    actual >= def.Target,
		WindowDays: SLIWindowDays,
		ErrorBudget: ErrorBudget{
			TotalSeconds:     budgetTotal,
			ConsumedSeconds:  consumed,
			RemainingSeconds: budgetTotal - consumed,
			ConsumedPercent:  math.Round(pct*10) / 10,
		},
		Days: days,
	}
}

// OverallHealth reads the board's headline from what is happening now, not from
// the 28-day averages: a page that says "operational" while a critical alert is
// unacknowledged is the failure mode the whole design is meant to prevent.
func OverallHealth(active []Incident, slis []SLIStatus) string {
	for _, i := range active {
		if i.Severity == "critical" {
			return HealthDown
		}
	}
	if len(active) > 0 {
		return HealthDegraded
	}
	for _, s := range slis {
		if !s.Meeting {
			return HealthDegraded
		}
	}
	return HealthOperational
}

// MeanTimeToAck averages over the incidents somebody actually acknowledged.
func MeanTimeToAck(incidents []Incident) Aggregate {
	return meanOver(incidents, Incident.TimeToAck)
}

// MeanTimeToResolve averages over the incidents that actually closed.
func MeanTimeToResolve(incidents []Incident) Aggregate {
	return meanOver(incidents, Incident.TimeToResolve)
}

func meanOver(incidents []Incident, f func(Incident) (time.Duration, bool)) Aggregate {
	var sum time.Duration
	var n int
	for _, i := range incidents {
		if d, ok := f(i); ok {
			sum += d
			n++
		}
	}
	if n == 0 {
		return Aggregate{}
	}
	return Aggregate{Seconds: int64((sum / time.Duration(n)).Seconds()), SampleSize: n}
}
