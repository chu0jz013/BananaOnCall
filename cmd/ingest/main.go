// Command ingest is the webhook front door. It verifies the integration key,
// normalizes the payload, puts it on SQS FIFO and returns 202 — it never
// touches DynamoDB, so a slow database can never cost us an alert.
package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"

	"github.com/chu0jz013/BananaOnCall/internal/adapter/sqsx"
	"github.com/chu0jz013/BananaOnCall/internal/domain"
	"github.com/chu0jz013/BananaOnCall/internal/ports"
)

type handler struct {
	sink  ports.AlertSink
	keys  []string
	now   func() time.Time
	logfn *slog.Logger
}

func main() {
	ctx := context.Background()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic(err)
	}

	queueURL := os.Getenv("ALERT_QUEUE_URL")
	if queueURL == "" {
		panic("ALERT_QUEUE_URL is required")
	}

	h := &handler{
		sink:  sqsx.NewPublisher(sqs.NewFromConfig(cfg), queueURL),
		keys:  splitKeys(os.Getenv("INTEGRATION_KEYS")),
		now:   time.Now,
		logfn: slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}

	lambda.Start(h.handle)
}

func (h *handler) handle(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	key := req.PathParameters["key"]

	// A wrong key gets a flat 401 with no detail — probing must reveal nothing
	// about which half of the check failed (FR-1.4).
	if !h.keyAllowed(key) {
		h.logfn.WarnContext(ctx, "rejected webhook", "reason", "unknown integration key", "path", req.Path)
		return reply(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	env, err := domain.ParseAlertmanager(key, []byte(req.Body), h.now())
	switch {
	case errors.Is(err, domain.ErrEmptyBatch):
		return reply(http.StatusBadRequest, map[string]string{"error": "no alerts in payload"})
	case err != nil:
		h.logfn.ErrorContext(ctx, "parse failed", "err", err)
		return reply(http.StatusBadRequest, map[string]string{"error": "malformed payload"})
	}

	if err := h.sink.Publish(ctx, env); err != nil {
		// Returning 5xx makes Alertmanager retry, which is exactly what we want:
		// better a duplicate delivery than a dropped alert.
		h.logfn.ErrorContext(ctx, "publish failed", "err", err)
		return reply(http.StatusServiceUnavailable, map[string]string{"error": "queue unavailable"})
	}

	h.logfn.InfoContext(ctx, "accepted",
		"routingKey", env.RoutingKey,
		"alerts", len(env.Alerts),
		"integration", key[:8],
	)

	return reply(http.StatusAccepted, map[string]any{
		"accepted":   len(env.Alerts),
		"routingKey": env.RoutingKey,
	})
}

func (h *handler) keyAllowed(key string) bool {
	if key == "" {
		return false
	}
	ok := false
	// No early exit: compare against every configured key so the response time
	// does not hint at how far down the list a guess landed.
	for _, want := range h.keys {
		if subtle.ConstantTimeCompare([]byte(want), []byte(key)) == 1 {
			ok = true
		}
	}
	return ok
}

func splitKeys(raw string) []string {
	var out []string
	for _, k := range strings.Split(raw, ",") {
		if k = strings.TrimSpace(k); k != "" {
			out = append(out, k)
		}
	}
	return out
}

func reply(status int, body any) (events.APIGatewayProxyResponse, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError}, nil
	}
	return events.APIGatewayProxyResponse{
		StatusCode: status,
		Headers:    map[string]string{"content-type": "application/json"},
		Body:       string(b),
	}, nil
}
