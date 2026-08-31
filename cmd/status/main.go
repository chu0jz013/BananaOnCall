// Command status serves the public status board (FR-8.3).
//
// It is read-only and unauthenticated by design: the whole point of a status
// page is that it works for someone who cannot log in — often because the thing
// they would log into is the thing that is broken.
package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/chu0jz013/BananaOnCall/internal/adapter/dynamox"
	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// recentIncidentLimit caps the history the board shows. Enough to see a
// pattern, few enough to stay one Query.
const recentIncidentLimit = 20

type handler struct {
	reader *dynamox.BoardReader
	origin string
	now    func() time.Time
	log    *slog.Logger
}

func main() {
	ctx := context.Background()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic(err)
	}

	table := os.Getenv("TABLE_NAME")
	if table == "" {
		panic("TABLE_NAME is required")
	}

	h := &handler{
		reader: dynamox.NewBoardReader(dynamodb.NewFromConfig(cfg), table),
		// The board is served from an S3 origin, so the browser needs this
		// spelled out. Public data, but still pinned rather than "*".
		origin: envOr("ALLOWED_ORIGIN", "*"),
		now:    time.Now,
		log:    slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}

	lambda.Start(h.handle)
}

func (h *handler) handle(ctx context.Context, _ events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	now := h.now().UTC()
	from := now.AddDate(0, 0, -domain.SLIWindowDays)

	board := domain.Board{
		GeneratedAt: now,
		SLIs:        make([]domain.SLIStatus, 0, len(domain.SLIDefinitions)),
	}

	for _, def := range domain.SLIDefinitions {
		days, err := h.reader.DailyCounts(ctx, def.Key, from, now)
		if err != nil {
			h.log.ErrorContext(ctx, "rollup query failed", "sli", def.Key, "err", err)
			return h.fail()
		}
		board.SLIs = append(board.SLIs, domain.BuildSLIStatus(def, days))
	}

	// Anything not yet resolved counts as open, whether or not someone acked it.
	for _, state := range []string{"firing", "acked"} {
		open, err := h.reader.IncidentsByState(ctx, state, recentIncidentLimit)
		if err != nil {
			h.log.ErrorContext(ctx, "incident query failed", "state", state, "err", err)
			return h.fail()
		}
		board.ActiveIncidents = append(board.ActiveIncidents, open...)
	}

	resolved, err := h.reader.IncidentsByState(ctx, "resolved", recentIncidentLimit)
	if err != nil {
		h.log.ErrorContext(ctx, "incident query failed", "state", "resolved", "err", err)
		return h.fail()
	}
	board.RecentIncidents = resolved

	board.Health = domain.OverallHealth(board.ActiveIncidents, board.SLIs)
	board.MTTA = domain.MeanTimeToAck(resolved)
	board.MTTR = domain.MeanTimeToResolve(resolved)

	if board.ActiveIncidents == nil {
		board.ActiveIncidents = []domain.Incident{}
	}

	h.log.InfoContext(ctx, "board served",
		"health", board.Health,
		"active", len(board.ActiveIncidents),
		"recent", len(board.RecentIncidents),
	)

	return h.reply(http.StatusOK, board)
}

func (h *handler) fail() (events.APIGatewayProxyResponse, error) {
	// A status page that 500s tells the reader nothing. Say plainly that the
	// board itself is the thing that is broken.
	return h.reply(http.StatusInternalServerError, map[string]string{
		"health": domain.HealthDegraded,
		"error":  "status board is unavailable",
	})
}

func (h *handler) reply(status int, body any) (events.APIGatewayProxyResponse, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError}, nil
	}
	return events.APIGatewayProxyResponse{
		StatusCode: status,
		Headers: map[string]string{
			"content-type":                "application/json",
			"access-control-allow-origin": h.origin,
			// Small enough that a refresh storm during an incident cannot
			// itself become the incident.
			"cache-control": "public, max-age=15",
		},
		Body: string(b),
	}, nil
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
