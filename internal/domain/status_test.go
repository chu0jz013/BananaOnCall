package domain_test

import (
	"testing"
	"time"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

var ingest = domain.SLIDefinition{
	Key: "ingest_availability", Label: "Ingest availability", Target: 99.9,
}

func TestPerfectWindowLeavesTheWholeBudget(t *testing.T) {
	s := domain.BuildSLIStatus(ingest, []domain.DailyCount{{Date: "2026-08-01", Good: 1000, Total: 1000}})

	if s.Actual != 100 {
		t.Errorf("actual: want 100, got %v", s.Actual)
	}
	if !s.Meeting {
		t.Error("a perfect window must meet the target")
	}
	if s.ErrorBudget.ConsumedSeconds != 0 {
		t.Errorf("consumed budget: want 0, got %d", s.ErrorBudget.ConsumedSeconds)
	}
	// 0.1% of 28 days is 2419 seconds, a bit over 40 minutes.
	if got := s.ErrorBudget.TotalSeconds; got != 2419 {
		t.Errorf("budget for 99.9%% over 28 days: want 2419s, got %d", got)
	}
}

func TestEmptyWindowReportsHealthyNotZero(t *testing.T) {
	s := domain.BuildSLIStatus(ingest, nil)

	// A freshly deployed SLI has not failed. Reporting 0% would put the board
	// permanently in the red on day one.
	if s.Actual != 100 {
		t.Errorf("empty window: want 100, got %v", s.Actual)
	}
	if !s.Meeting {
		t.Error("empty window must not read as a breach")
	}
}

func TestBudgetConsumptionTracksFailureRate(t *testing.T) {
	// 99.95% observed against a 99.9% target: half the allowance spent.
	s := domain.BuildSLIStatus(ingest, []domain.DailyCount{{Good: 19990, Total: 20000}})

	if s.Actual != 99.95 {
		t.Fatalf("actual: want 99.95, got %v", s.Actual)
	}
	if !s.Meeting {
		t.Error("99.95 must meet a 99.9 target")
	}
	if pct := s.ErrorBudget.ConsumedPercent; pct < 49 || pct > 51 {
		t.Errorf("consumed percent: want ~50, got %v", pct)
	}
}

func TestBreachedBudgetClampsAtZeroRemaining(t *testing.T) {
	// 90% observed is a catastrophic breach; remaining must floor at zero
	// rather than going negative.
	s := domain.BuildSLIStatus(ingest, []domain.DailyCount{{Good: 900, Total: 1000}})

	if s.Meeting {
		t.Error("90% must not meet a 99.9% target")
	}
	if s.ErrorBudget.RemainingSeconds != 0 {
		t.Errorf("remaining: want 0, got %d", s.ErrorBudget.RemainingSeconds)
	}
	if s.ErrorBudget.ConsumedSeconds > s.ErrorBudget.TotalSeconds {
		t.Error("consumed must never exceed the total budget")
	}
}

func TestHealthIsDrivenByNowNotByAverages(t *testing.T) {
	healthy := []domain.SLIStatus{{Meeting: true}}

	cases := []struct {
		name   string
		active []domain.Incident
		slis   []domain.SLIStatus
		want   string
	}{
		{"nothing wrong", nil, healthy, domain.HealthOperational},
		{"a warning is open", []domain.Incident{{Severity: "warning"}}, healthy, domain.HealthDegraded},
		// The headline must not read "operational" while a critical alert is
		// open — that is exactly the blind spot this system exists to close.
		{"a critical is open", []domain.Incident{{Severity: "critical"}}, healthy, domain.HealthDown},
		{"quiet but an SLI is breached", nil, []domain.SLIStatus{{Meeting: false}}, domain.HealthDegraded},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := domain.OverallHealth(c.active, c.slis); got != c.want {
				t.Errorf("want %q, got %q", c.want, got)
			}
		})
	}
}

func TestMeansIgnoreIncidentsThatNeverReachedTheStage(t *testing.T) {
	base := time.Date(2026, 8, 23, 10, 0, 0, 0, time.UTC)
	ack := base.Add(2 * time.Minute)
	res := base.Add(20 * time.Minute)

	incidents := []domain.Incident{
		{StartedAt: base, AckedAt: &ack, ResolvedAt: &res},
		{StartedAt: base, AckedAt: &ack}, // acked, still open
		{StartedAt: base},                // never acked
	}

	mtta := domain.MeanTimeToAck(incidents)
	if mtta.SampleSize != 2 || mtta.Seconds != 120 {
		t.Errorf("mtta: want 120s over 2 samples, got %ds over %d", mtta.Seconds, mtta.SampleSize)
	}

	mttr := domain.MeanTimeToResolve(incidents)
	if mttr.SampleSize != 1 || mttr.Seconds != 1200 {
		t.Errorf("mttr: want 1200s over 1 sample, got %ds over %d", mttr.Seconds, mttr.SampleSize)
	}
}

func TestMeansOverNothingAreEmptyNotZeroed(t *testing.T) {
	// Sample size zero is the signal the board needs to print "no data"
	// instead of a confident-looking 0s.
	if got := domain.MeanTimeToAck(nil); got.SampleSize != 0 || got.Seconds != 0 {
		t.Errorf("want an empty aggregate, got %+v", got)
	}
}
