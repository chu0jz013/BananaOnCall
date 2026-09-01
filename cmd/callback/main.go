// Command callback is the Telegram webhook: it is what happens when a responder
// presses a button.
//
// Everything it does is a state transition guarded by a condition expression,
// so pressing Ack twice, or two people pressing it at once, cannot produce two
// different answers (FR-6.3).
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
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/sfn"

	"github.com/chu0jz013/BananaOnCall/internal/adapter/dynamox"
	"github.com/chu0jz013/BananaOnCall/internal/adapter/sfnx"
	"github.com/chu0jz013/BananaOnCall/internal/adapter/telegramx"
	"github.com/chu0jz013/BananaOnCall/internal/domain"
	"github.com/chu0jz013/BananaOnCall/internal/ports"
)

// silenceFor is how long the Silence button quiets an incident.
const silenceFor = time.Hour

// update is the slice of Telegram's callback_query update we need.
type update struct {
	CallbackQuery *struct {
		ID   string `json:"id"`
		From struct {
			Username string `json:"username"`
			ID       int64  `json:"id"`
		} `json:"from"`
		Message struct {
			MessageID int    `json:"message_id"`
			Text      string `json:"text"`
			Chat      struct {
				ID json.Number `json:"id"`
			} `json:"chat"`
		} `json:"message"`
		Data string `json:"data"`
	} `json:"callback_query"`
}

type handler struct {
	store     *dynamox.Store
	notifier  ports.Notifier
	escalator ports.Escalator
	secret    string
	now       func() time.Time
	log       *slog.Logger
}

func main() {
	ctx := context.Background()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic(err)
	}

	h := &handler{
		store:     dynamox.NewStore(dynamodb.NewFromConfig(cfg), mustEnv("TABLE_NAME")),
		notifier:  telegramx.New(mustEnv("TELEGRAM_API_BASE"), mustEnv("TELEGRAM_BOT_TOKEN")),
		escalator: sfnx.New(sfn.NewFromConfig(cfg), mustEnv("ESCALATION_ARN")),
		secret:    mustEnv("TELEGRAM_WEBHOOK_SECRET"),
		now:       time.Now,
		log:       slog.New(slog.NewJSONHandler(os.Stdout, nil)),
	}

	lambda.Start(h.handle)
}

func (h *handler) handle(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// The secret is in the path so the URL alone is the credential, and repeated
	// in the header Telegram sends. Either one failing is a flat 401.
	if !h.authorized(req) {
		h.log.WarnContext(ctx, "rejected telegram webhook", "path", req.Path)
		return reply(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
	}

	var u update
	if err := json.Unmarshal([]byte(req.Body), &u); err != nil || u.CallbackQuery == nil {
		// Telegram sends every kind of update to one webhook; anything that is
		// not a button press is simply not ours to act on.
		return reply(http.StatusOK, map[string]string{"ignored": "not a callback query"})
	}
	q := u.CallbackQuery

	action, groupID, ok := domain.ParseCallback(q.Data)
	if !ok {
		h.log.WarnContext(ctx, "unknown callback data", "data", q.Data)
		return reply(http.StatusBadRequest, map[string]string{"error": "unknown action"})
	}

	who := q.From.Username
	if who == "" {
		who = "unknown"
	}
	now := h.now().UTC()

	group, err := h.act(ctx, action, groupID, who, now)
	switch {
	case errors.Is(err, domain.ErrAlreadyInState):
		// At-least-once: Telegram retries a callback it thinks failed, and a
		// second press is a person being impatient. Neither is an error.
		h.answer(ctx, q.ID, "Already "+group.State)
		return reply(http.StatusOK, map[string]any{"state": group.State, "repeat": true})
	case errors.Is(err, domain.ErrInvalidTransition):
		h.answer(ctx, q.ID, "Cannot do that: incident is "+group.State)
		return reply(http.StatusConflict, map[string]any{"error": "invalid transition", "state": group.State})
	case err != nil:
		h.log.ErrorContext(ctx, "callback failed", "group", groupID, "action", action, "err", err)
		return reply(http.StatusInternalServerError, map[string]string{"error": "could not apply"})
	}

	if err := h.rewrite(ctx, action, group, q.Message.Text, q.Message.MessageID,
		q.Message.Chat.ID.String(), who, now); err != nil {
		// The state change is what matters and it already happened; a failed
		// edit must not make the responder press Ack again.
		h.log.ErrorContext(ctx, "could not rewrite message", "group", group.ID, "err", err)
	}

	if err := h.escalator.Stop(ctx, group.ExecutionArn, action+" by "+who); err != nil {
		h.log.ErrorContext(ctx, "could not stop escalation", "group", group.ID, "err", err)
	}

	h.answer(ctx, q.ID, confirmation(action))
	h.log.InfoContext(ctx, "callback applied",
		"group", group.ID, "action", action, "by", who, "state", group.State)

	return reply(http.StatusOK, map[string]any{
		"group": group.ID, "state": group.State, "by": who,
	})
}

// act applies the button press to the incident's state.
func (h *handler) act(ctx context.Context, action, groupID, who string, now time.Time) (domain.Group, error) {
	switch action {
	case domain.ActionAck:
		g, err := h.store.Ack(ctx, groupID, who, now)
		if err != nil {
			return g, err
		}
		return g, h.store.Timeline(ctx, groupID, who, "ack", "telegram button", now)

	case domain.ActionResolve:
		g, err := h.store.Resolve(ctx, groupID, who, now)
		if err != nil {
			return g, err
		}
		return g, h.store.Timeline(ctx, groupID, who, "resolve", "telegram button", now)

	default:
		g, err := h.store.Silence(ctx, groupID, who, now, silenceFor)
		if err != nil {
			return g, err
		}
		return g, h.store.Timeline(ctx, groupID, who, "silence", silenceFor.String(), now)
	}
}

// rewrite edits the message the responder is looking at, so the chat shows who
// owns the incident instead of a button that would page the team again (FR-5.5).
func (h *handler) rewrite(ctx context.Context, action string, g domain.Group,
	text string, messageID int, chatID, who string, now time.Time) error {

	// Prefer the message the group was paged on; fall back to the one the press
	// came from, which is the same message unless several went out.
	if g.ChatID != "" && g.MessageID != 0 {
		chatID, messageID = g.ChatID, g.MessageID
	}
	if chatID == "" || messageID == 0 {
		return nil
	}

	var m domain.Message
	if action == domain.ActionResolve {
		m = domain.RenderResolved(g, text, "@"+who, now)
	} else {
		m = domain.RenderAcked(g, text, who, now)
	}
	return h.notifier.Edit(ctx, chatID, messageID, m)
}

func (h *handler) authorized(req events.APIGatewayProxyRequest) bool {
	if subtle.ConstantTimeCompare([]byte(req.PathParameters["secret"]), []byte(h.secret)) != 1 {
		return false
	}
	// Telegram only sends this header when setWebhook was given a secret_token.
	if got := header(req, "X-Telegram-Bot-Api-Secret-Token"); got != "" {
		return subtle.ConstantTimeCompare([]byte(got), []byte(h.secret)) == 1
	}
	return true
}

// answer closes the button's spinner. Best effort: the state change already
// happened, and failing to say so must not undo it.
func (h *handler) answer(ctx context.Context, callbackID, text string) {
	if err := h.notifier.Answer(ctx, callbackID, text); err != nil {
		h.log.WarnContext(ctx, "answerCallbackQuery failed", "err", err)
	}
}

func confirmation(action string) string {
	switch action {
	case domain.ActionAck:
		return "Acked — escalation stopped"
	case domain.ActionResolve:
		return "Resolved"
	default:
		return "Silenced for 1h"
	}
}

// header reads a header case-insensitively: API Gateway passes through
// whatever casing the caller used.
func header(req events.APIGatewayProxyRequest, name string) string {
	for k, v := range req.Headers {
		if strings.EqualFold(k, name) {
			return v
		}
	}
	return ""
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		panic(k + " is required")
	}
	return v
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
