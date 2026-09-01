// Package telegramx adapts the Telegram Bot API to the ports.Notifier
// interface. Nothing above it knows which chat product is on the other end.
package telegramx

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// attempts is FR-5.3: three tries, then give up and let the caller escalate
// immediately rather than sitting out the whole wait_after with nobody paged.
const attempts = 3

// Client talks to api.telegram.org, or to whatever stands in for it — the
// mock in tools/mock-telegram speaks the same subset.
type Client struct {
	http    *http.Client
	baseURL string
	token   string
}

func New(baseURL, token string) *Client {
	return &Client{
		// Comfortably under the notifier's Lambda timeout, so a hung provider
		// surfaces as a retry rather than as a killed invocation.
		http:    &http.Client{Timeout: 8 * time.Second},
		baseURL: baseURL,
		token:   token,
	}
}

// sendResult is the slice of Telegram's envelope we actually use.
type sendResult struct {
	OK          bool   `json:"ok"`
	Description string `json:"description"`
	Result      struct {
		MessageID int `json:"message_id"`
	} `json:"result"`
}

func (c *Client) Send(ctx context.Context, chatID string, m domain.Message) (int, error) {
	var out sendResult
	err := c.call(ctx, "sendMessage", map[string]any{
		"chat_id":      chatID,
		"text":         m.Text,
		"reply_markup": markup(m.Buttons),
	}, &out)
	if err != nil {
		return 0, err
	}
	return out.Result.MessageID, nil
}

func (c *Client) Edit(ctx context.Context, chatID string, messageID int, m domain.Message) error {
	return c.call(ctx, "editMessageText", map[string]any{
		"chat_id":      chatID,
		"message_id":   messageID,
		"text":         m.Text,
		"reply_markup": markup(m.Buttons),
	}, nil)
}

// Answer closes the spinner on the pressed button. Telegram shows the button as
// stuck until this lands, so a responder who is told nothing assumes it failed.
func (c *Client) Answer(ctx context.Context, callbackID, text string) error {
	return c.call(ctx, "answerCallbackQuery", map[string]any{
		"callback_query_id": callbackID,
		"text":              text,
	}, nil)
}

// call posts one Bot API method, retrying transport and 5xx failures only —
// a 400 means the request is wrong and will stay wrong.
func (c *Client) call(ctx context.Context, method string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("encode %s: %w", method, err)
	}
	url := fmt.Sprintf("%s/bot%s/%s", c.baseURL, c.token, method)

	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if attempt > 1 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(attempt-1) * 500 * time.Millisecond):
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
		if err != nil {
			return fmt.Errorf("build %s: %w", method, err)
		}
		req.Header.Set("content-type", "application/json")

		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("%s: %w", method, err)
			continue
		}

		raw, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("%s: read response: %w", method, readErr)
			continue
		}

		if resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("%s: provider returned %d: %s", method, resp.StatusCode, truncate(raw))
			continue
		}
		if resp.StatusCode >= 400 {
			return fmt.Errorf("%s: %d: %s", method, resp.StatusCode, truncate(raw))
		}

		var envelope sendResult
		if err := json.Unmarshal(raw, &envelope); err != nil {
			return fmt.Errorf("%s: decode response: %w", method, err)
		}
		if !envelope.OK {
			return fmt.Errorf("%s: %s", method, envelope.Description)
		}
		if out != nil {
			if err := json.Unmarshal(raw, out); err != nil {
				return fmt.Errorf("%s: decode result: %w", method, err)
			}
		}
		return nil
	}
	return fmt.Errorf("after %d attempts: %w", attempts, lastErr)
}

// markup renders the inline keyboard, or nothing at all when a message has no
// buttons left to offer.
func markup(rows [][]domain.Button) any {
	if len(rows) == 0 {
		return map[string]any{"inline_keyboard": [][]domain.Button{}}
	}
	return map[string]any{"inline_keyboard": rows}
}

func truncate(b []byte) string {
	if len(b) > 200 {
		return string(b[:200]) + "…"
	}
	return string(b)
}
