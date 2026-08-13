package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/banana/bananaoncall/internal/domain"
)

type Notifier struct {
	Token  string
	ChatID string
	Client *http.Client
}

func (n Notifier) Notify(ctx context.Context, i domain.Incident) error {
	if n.Token == "" || n.ChatID == "" {
		return nil
	} // disabled in local dev
	c := n.Client
	if c == nil {
		c = &http.Client{Timeout: 5 * time.Second}
	}
	body, _ := json.Marshal(map[string]string{"chat_id": n.ChatID, "text": fmt.Sprintf("🚨 %s [%s] %s", i.Service, i.Severity, i.Summary)})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.telegram.org/bot"+n.Token+"/sendMessage", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("telegram returned %s", resp.Status)
	}
	return nil
}
