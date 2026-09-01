// Command processor turns queued alerts into incidents.
//
// It is the only thing that opens, joins and closes alert groups, which is why
// grouping (FR-2.x) can be reasoned about in one place. It never sends a
// message itself: notifying is the escalation's job, so the decision "should
// anyone be woken up" is made once, by the state machine, rather than on every
// redelivery.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/sfn"

	"github.com/chu0jz013/BananaOnCall/internal/adapter/dynamox"
	"github.com/chu0jz013/BananaOnCall/internal/adapter/sfnx"
	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

type handler struct {
	store     *dynamox.Store
	escalator *sfnx.Escalator
	now       func() time.Time
	log       *slog.Logger
}

func main() {
	ctx := context.Background()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic(err)
	}

	table := mustEnv("TABLE_NAME")
	h := &handler{
		store:     dynamox.NewStore(dynamodb.NewFromConfig(cfg), table),
		escalator: sfnx.New(sfn.NewFromConfig(cfg), mustEnv("ESCALATION_ARN")),
		now:       time.Now,
		log:       slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}

	lambda.Start(h.handle)
}

// handle processes one SQS batch. The event source is configured with a batch
// size of one, so a failure retries exactly the delivery that failed instead of
// replaying its neighbours.
func (h *handler) handle(ctx context.Context, ev events.SQSEvent) error {
	for _, record := range ev.Records {
		var env domain.Envelope
		if err := json.Unmarshal([]byte(record.Body), &env); err != nil {
			// A body we cannot parse will never parse. Returning an error would
			// retry it twice more and then park it on the DLQ; dropping it with
			// a loud log is the same outcome without the delay to real alerts.
			h.log.ErrorContext(ctx, "unparseable envelope", "messageId", record.MessageId, "err", err)
			continue
		}

		for _, batch := range domain.SplitByFingerprint(env, domain.DefaultGroupBy) {
			if err := h.apply(ctx, env, batch); err != nil {
				return fmt.Errorf("message %s: %w", record.MessageId, err)
			}
		}
	}
	return nil
}

func (h *handler) apply(ctx context.Context, env domain.Envelope, batch domain.Batch) error {
	if !batch.Firing {
		return h.close(ctx, batch)
	}

	now := h.now().UTC()
	alert := batch.Representative()
	candidate := domain.NewGroup(domain.NewGroupID(now, batch.Fingerprint), batch.Fingerprint, alert, now)
	candidate.AlertCount = len(batch.Alerts)

	group, created, err := h.store.OpenOrJoin(ctx, candidate)
	if err != nil {
		return err
	}

	if !created {
		// FR-2.3: the incident is already open and somebody is already being
		// paged about it. Count the alert, say so on the timeline, stay quiet.
		h.log.InfoContext(ctx, "joined open incident",
			"group", group.ID, "alerts", group.AlertCount, "alertname", alert.Name())
		return h.store.Timeline(ctx, group.ID, "system", "alert_joined",
			fmt.Sprintf("%s (%d in group)", alert.Name(), group.AlertCount), now)
	}

	if err := h.store.StoreAlert(ctx, group.ID, alert); err != nil {
		return err
	}
	if err := h.store.Timeline(ctx, group.ID, "system", "opened",
		fmt.Sprintf("%s from %s", alert.Name(), env.Source), now); err != nil {
		return err
	}

	arn, err := h.escalator.Start(ctx, group.ID)
	if err != nil {
		return err
	}
	if err := h.store.SetExecution(ctx, group.ID, arn); err != nil {
		return err
	}

	h.log.InfoContext(ctx, "incident opened",
		"group", group.ID, "title", group.Title, "severity", group.Severity, "execution", arn)
	return h.store.Timeline(ctx, group.ID, "system", "escalation_started", arn, now)
}

// close handles a delivery whose alerts have all resolved (FR-2.5).
func (h *handler) close(ctx context.Context, batch domain.Batch) error {
	now := h.now().UTC()

	groupID, open, err := h.store.OpenGroupID(ctx, batch.Fingerprint)
	if err != nil {
		return err
	}
	if !open {
		h.log.InfoContext(ctx, "resolved alert for nothing open",
			"alertname", batch.Representative().Name())
		return nil
	}

	group, err := h.store.Resolve(ctx, groupID, "system", now)
	switch {
	case err == nil:
	case errors.Is(err, domain.ErrAlreadyInState):
		h.log.InfoContext(ctx, "incident was already closed", "group", groupID)
		return nil
	default:
		return err
	}

	if err := h.escalator.Stop(ctx, group.ExecutionArn, "alert resolved"); err != nil {
		return err
	}

	h.log.InfoContext(ctx, "incident resolved", "group", group.ID, "title", group.Title)
	return h.store.Timeline(ctx, group.ID, "system", "resolved", "alertmanager sent resolved", now)
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		panic(k + " is required")
	}
	return v
}
