// Command schedule materializes the on-call rota.
//
// D7 reads Google Calendar through its secret iCal URL — read-only, no OAuth
// flow, which is also how Grafana OnCall did it. The point of running this on a
// timer rather than at page time is FR-4.4: answering "who is on call" has to be
// a key lookup, not an ICS parse, because it happens while somebody is waiting.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/chu0jz013/BananaOnCall/internal/adapter/dynamox"
	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// The window that gets materialized on every sync. Back far enough to keep the
// shift that is running now, forward far enough that a sync outage does not
// leave the rota empty.
const (
	lookback  = 30 * 24 * time.Hour
	lookahead = 60 * 24 * time.Hour
)

type handler struct {
	store      *dynamox.Store
	http       *http.Client
	icalURL    string
	scheduleID string
	now        func() time.Time
	log        *slog.Logger
}

// Result is what the invoke returns, so `make sync-schedule` prints something
// worth reading.
type Result struct {
	Shifts   int    `json:"shifts"`
	OnCall   string `json:"onCallNow"`
	Schedule string `json:"schedule"`
}

func main() {
	ctx := context.Background()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic(err)
	}

	h := &handler{
		store:      dynamox.NewStore(dynamodb.NewFromConfig(cfg), mustEnv("TABLE_NAME")),
		http:       &http.Client{Timeout: 10 * time.Second},
		icalURL:    mustEnv("ICAL_URL"),
		scheduleID: envOr("SCHEDULE_ID", "primary"),
		now:        time.Now,
		log:        slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}

	lambda.Start(h.handle)
}

func (h *handler) handle(ctx context.Context, _ json.RawMessage) (Result, error) {
	now := h.now().UTC()

	body, err := h.fetch(ctx)
	if err != nil {
		return Result{}, err
	}

	shifts, err := domain.ParseICS(h.scheduleID, body, now.Add(-lookback), now.Add(lookahead))
	if err != nil {
		return Result{}, fmt.Errorf("parse calendar: %w", err)
	}
	if len(shifts) == 0 {
		// Not an error — an empty calendar is a valid answer, and a loud one.
		// FR-4.6's fallback exists precisely for the window this opens.
		h.log.WarnContext(ctx, "calendar has no on-call events", "url", h.icalURL)
	}
	if err := h.store.PutShifts(ctx, shifts); err != nil {
		return Result{}, err
	}

	out := Result{Shifts: len(shifts), Schedule: h.scheduleID, OnCall: domain.FallbackUserID}
	if s, ok := domain.WhoIsOnCall(shifts, now); ok {
		out.OnCall = s.UserID
	}

	h.log.InfoContext(ctx, "schedule synced",
		"schedule", h.scheduleID, "shifts", out.Shifts, "onCall", out.OnCall)
	return out, nil
}

func (h *handler) fetch(ctx context.Context) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.icalURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build calendar request: %w", err)
	}

	resp, err := h.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch calendar: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch calendar: %s returned %d", h.icalURL, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read calendar: %w", err)
	}
	return body, nil
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		panic(k + " is required")
	}
	return v
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
