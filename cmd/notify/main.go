// Command notify is one rung of the escalation ladder.
//
// Step Functions calls it, reads `stop` out of the answer to decide whether to
// keep going, and waits `waitSeconds` before the next rung. Keeping the stop
// decision here rather than in the state machine means the ladder needs no
// database access of its own, and that "should this page still go out?" is
// answered against the group's current state at the moment of sending — not
// at the moment the wait started.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"github.com/chu0jz013/BananaOnCall/internal/adapter/dynamox"
	"github.com/chu0jz013/BananaOnCall/internal/adapter/telegramx"
	"github.com/chu0jz013/BananaOnCall/internal/domain"
	"github.com/chu0jz013/BananaOnCall/internal/ports"
)

// scheduleLookback is how far back the shift query reaches. A shift is keyed by
// its start, so finding the one in force now means looking back at least one
// full rotation (FR-4.4).
const scheduleLookback = 30 * 24 * time.Hour

// Step is the state machine's payload, in both directions.
type Step struct {
	GroupID string `json:"groupId"`
	Level   int    `json:"level"`
	// Stop ends the execution. Set when the incident is no longer firing
	// (FR-3.5) or when the policy is exhausted (FR-3.6).
	Stop        bool   `json:"stop"`
	Reason      string `json:"reason,omitempty"`
	WaitSeconds int    `json:"waitSeconds"`
	NotifiedTo  string `json:"notifiedTo,omitempty"`
}

type handler struct {
	store      *dynamox.Store
	notifier   ports.Notifier
	policyID   string
	scheduleID string
	now        func() time.Time
	log        *slog.Logger
}

func main() {
	ctx := context.Background()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic(err)
	}

	h := &handler{
		store:      dynamox.NewStore(dynamodb.NewFromConfig(cfg), mustEnv("TABLE_NAME")),
		notifier:   telegramx.New(mustEnv("TELEGRAM_API_BASE"), mustEnv("TELEGRAM_BOT_TOKEN")),
		policyID:   envOr("POLICY_ID", domain.DefaultPolicyID),
		scheduleID: envOr("SCHEDULE_ID", "primary"),
		now:        time.Now,
		log:        slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}

	lambda.Start(h.handle)
}

func (h *handler) handle(ctx context.Context, in Step) (Step, error) {
	now := h.now().UTC()
	level := max(in.Level, 1)

	group, err := h.store.Get(ctx, in.GroupID)
	if err != nil {
		return Step{}, err
	}

	// FR-3.5. Checked here, at send time, so an ack that lands one second
	// before the wait expires still stops the page.
	if group.State != domain.StateFiring {
		h.log.InfoContext(ctx, "escalation stops", "group", group.ID, "state", group.State)
		return Step{GroupID: group.ID, Level: level, Stop: true, Reason: group.State}, nil
	}

	policy, err := h.store.Policy(ctx, h.policyID)
	if err != nil {
		return Step{}, err
	}
	step, ok := policy.Resolve(level)
	if !ok {
		h.log.WarnContext(ctx, "escalation exhausted", "group", group.ID, "level", level)
		return Step{GroupID: group.ID, Level: level, Stop: true, Reason: "policy exhausted"}, nil
	}

	target, err := h.target(ctx, step, now)
	if err != nil {
		return Step{}, err
	}

	alert, err := h.store.RepresentativeAlert(ctx, group.ID)
	if err != nil {
		return Step{}, err
	}
	message := domain.RenderAlert(group, alert, level, now)

	out := Step{
		GroupID:     group.ID,
		Level:       level + 1,
		WaitSeconds: step.WaitSeconds,
		NotifiedTo:  target.UserID,
	}

	messageID, err := h.notifier.Send(ctx, target.ChatID, message)
	if err != nil {
		// FR-5.3: three attempts already failed inside the adapter. Do not sit
		// out the whole wait with nobody paged — go to the next rung now.
		h.log.ErrorContext(ctx, "notify failed", "group", group.ID, "level", level, "err", err)
		if tlErr := h.store.Timeline(ctx, group.ID, "system", "notify_failed",
			fmt.Sprintf("step %d to %s: %v", level, target.UserID, err), now); tlErr != nil {
			return Step{}, tlErr
		}
		out.WaitSeconds = 0
		return out, nil
	}

	if err := h.store.RecordNotification(ctx, group.ID, target.ChatID, messageID, level); err != nil {
		return Step{}, err
	}
	if err := h.store.Timeline(ctx, group.ID, "system", "notified",
		fmt.Sprintf("step %d to %s (%s)", level, target.UserID, step.Describe()), now); err != nil {
		return Step{}, err
	}

	h.log.InfoContext(ctx, "notified",
		"group", group.ID, "level", level, "user", target.UserID,
		"chat", target.ChatID, "messageId", messageID, "waitSeconds", out.WaitSeconds)
	return out, nil
}

// target resolves a policy step to a concrete chat (FR-3.3).
func (h *handler) target(ctx context.Context, step domain.Step, now time.Time) (domain.Contact, error) {
	switch step.Kind {
	case domain.TargetGroupChat:
		// The war room is a chat id, not a person: no contact lookup.
		return domain.Contact{UserID: "war-room", Channel: domain.ChannelTelegram, ChatID: step.Ref}, nil

	case domain.TargetUser:
		return h.store.Contact(ctx, step.Ref, domain.ChannelTelegram)

	default:
		userID := h.onCall(ctx, now)
		return h.store.Contact(ctx, userID, domain.ChannelTelegram)
	}
}

// onCall answers "who is on duty right now", falling back rather than failing.
//
// FR-4.6 is explicit about this: an empty rota or a broken sync must still page
// somebody. Nobody on call is the failure mode teams discover at 3am.
func (h *handler) onCall(ctx context.Context, now time.Time) string {
	shifts, err := h.store.Shifts(ctx, h.scheduleID, now.Add(-scheduleLookback), now)
	if err != nil {
		h.log.ErrorContext(ctx, "schedule unreadable, falling back", "err", err)
		return domain.FallbackUserID
	}
	if shift, ok := domain.WhoIsOnCall(shifts, now); ok {
		return shift.UserID
	}
	h.log.WarnContext(ctx, "nobody is on call, falling back",
		"schedule", h.scheduleID, "fallback", domain.FallbackUserID, "shiftsKnown", len(shifts))
	return domain.FallbackUserID
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
