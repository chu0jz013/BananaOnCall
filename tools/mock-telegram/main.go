// Command mock-telegram is a stand-in for the Telegram Bot API.
//
// It exists so the whole alert -> notify -> ack loop can be exercised offline
// and in CI. It speaks just enough of the real API for the notifier adapter to
// be unaware it is talking to a fake, and it can push a genuine callback_query
// update back at our webhook — which is what makes "someone pressed Ack"
// testable without a human and a phone.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Message is one stored outbound message, in roughly the shape Telegram returns.
type Message struct {
	MessageID int             `json:"message_id"`
	ChatID    string          `json:"chat_id"`
	Text      string          `json:"text"`
	Buttons   []Button        `json:"buttons"`
	SentAt    time.Time       `json:"sent_at"`
	EditedAt  *time.Time      `json:"edited_at,omitempty"`
	Raw       json.RawMessage `json:"-"`
}

// Button is one inline keyboard button flattened out of the nested Telegram shape.
type Button struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data,omitempty"`
	URL          string `json:"url,omitempty"`
}

type store struct {
	mu         sync.Mutex
	messages   []*Message
	nextID     int
	webhookURL string
	secret     string
}

func main() {
	addr := ":" + envOr("PORT", "8081")
	s := &store{nextID: 1}

	mux := http.NewServeMux()
	// Bot API surface. Telegram addresses methods as /bot<TOKEN>/<method>, so the
	// whole first segment is one wildcard — ServeMux cannot match inside a
	// segment, and the token is ignored here anyway.
	mux.HandleFunc("POST /{bot}/sendMessage", s.sendMessage)
	mux.HandleFunc("POST /{bot}/editMessageText", s.editMessageText)
	mux.HandleFunc("POST /{bot}/answerCallbackQuery", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "result": true})
	})
	mux.HandleFunc("POST /{bot}/setWebhook", s.setWebhook)
	mux.HandleFunc("GET /{bot}/getMe", s.getMe)

	// Test-harness surface, namespaced so it can never collide with the real API.
	mux.HandleFunc("GET /__messages", s.listMessages)
	mux.HandleFunc("POST /__press", s.press)
	mux.HandleFunc("POST /__reset", s.reset)
	mux.HandleFunc("GET /__health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /", s.index)

	log.Printf("mock-telegram listening on %s", addr)
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(srv.ListenAndServe())
}

func (s *store) sendMessage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ChatID      json.RawMessage `json:"chat_id"`
		Text        string          `json:"text"`
		ReplyMarkup struct {
			InlineKeyboard [][]Button `json:"inline_keyboard"`
		} `json:"reply_markup"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, err)
		return
	}

	s.mu.Lock()
	msg := &Message{
		MessageID: s.nextID,
		ChatID:    unquote(string(req.ChatID)),
		Text:      req.Text,
		Buttons:   flatten(req.ReplyMarkup.InlineKeyboard),
		SentAt:    time.Now().UTC(),
	}
	s.nextID++
	s.messages = append(s.messages, msg)
	s.mu.Unlock()

	log.Printf("sendMessage -> chat=%s id=%d %q", msg.ChatID, msg.MessageID, firstLine(msg.Text))
	writeJSON(w, map[string]any{"ok": true, "result": msg})
}

func (s *store) editMessageText(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ChatID      json.RawMessage `json:"chat_id"`
		MessageID   int             `json:"message_id"`
		Text        string          `json:"text"`
		ReplyMarkup struct {
			InlineKeyboard [][]Button `json:"inline_keyboard"`
		} `json:"reply_markup"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, err)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	for _, m := range s.messages {
		if m.MessageID == req.MessageID {
			now := time.Now().UTC()
			m.Text = req.Text
			m.Buttons = flatten(req.ReplyMarkup.InlineKeyboard)
			m.EditedAt = &now
			log.Printf("editMessageText id=%d %q", m.MessageID, firstLine(m.Text))
			writeJSON(w, map[string]any{"ok": true, "result": m})
			return
		}
	}
	// Telegram's own error shape, so adapter error handling gets exercised too.
	w.WriteHeader(http.StatusBadRequest)
	writeJSON(w, map[string]any{
		"ok": false, "error_code": 400, "description": "Bad Request: message to edit not found",
	})
}

func (s *store) setWebhook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL         string `json:"url"`
		SecretToken string `json:"secret_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, err)
		return
	}
	s.mu.Lock()
	s.webhookURL, s.secret = req.URL, req.SecretToken
	s.mu.Unlock()

	log.Printf("setWebhook -> %s", req.URL)
	writeJSON(w, map[string]any{"ok": true, "result": true})
}

func (s *store) getMe(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{"ok": true, "result": map[string]any{
		"id": 1, "is_bot": true, "username": "bananaoncall_mock_bot",
	}})
}

func (s *store) listMessages(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	out := make([]*Message, len(s.messages))
	copy(out, s.messages)
	webhook := s.webhookURL
	s.mu.Unlock()
	writeJSON(w, map[string]any{"webhook": webhook, "messages": out})
}

func (s *store) reset(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	s.messages, s.nextID = nil, 1
	s.mu.Unlock()
	writeJSON(w, map[string]any{"ok": true})
}

// press delivers a real callback_query update to the registered webhook, which
// is exactly what Telegram does when a responder taps an inline button.
func (s *store) press(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MessageID    int    `json:"message_id"`
		CallbackData string `json:"callback_data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, err)
		return
	}

	s.mu.Lock()
	webhook, secret := s.webhookURL, s.secret
	var target *Message
	for _, m := range s.messages {
		if m.MessageID == req.MessageID {
			target = m
			break
		}
	}
	s.mu.Unlock()

	if target == nil {
		http.Error(w, "no such message", http.StatusNotFound)
		return
	}
	if webhook == "" {
		http.Error(w, "no webhook registered; call setWebhook first", http.StatusConflict)
		return
	}

	update := map[string]any{
		"update_id": time.Now().UnixNano() % 1e9,
		"callback_query": map[string]any{
			"id":   strconv.Itoa(target.MessageID),
			"from": map[string]any{"id": asInt(target.ChatID), "is_bot": false, "username": "responder"},
			"message": map[string]any{
				"message_id": target.MessageID,
				"chat":       map[string]any{"id": asInt(target.ChatID), "type": "private"},
				"text":       target.Text,
			},
			"data": req.CallbackData,
		},
	}

	body, _ := json.Marshal(update)
	hookReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost, webhook, bytes.NewReader(body))
	if err != nil {
		httpError(w, err)
		return
	}
	hookReq.Header.Set("content-type", "application/json")
	if secret != "" {
		hookReq.Header.Set("X-Telegram-Bot-Api-Secret-Token", secret)
	}

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(hookReq)
	if err != nil {
		log.Printf("press: webhook call failed: %v", err)
		httpError(w, err)
		return
	}
	defer resp.Body.Close()

	log.Printf("press data=%q -> webhook %d", req.CallbackData, resp.StatusCode)
	w.WriteHeader(resp.StatusCode)
	writeJSON(w, map[string]any{"ok": resp.StatusCode < 300, "webhook_status": resp.StatusCode})
}

func (s *store) index(w http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	data := struct {
		Messages []*Message
		Webhook  string
	}{append([]*Message(nil), s.messages...), s.webhookURL}
	s.mu.Unlock()

	w.Header().Set("content-type", "text/html; charset=utf-8")
	if err := indexTmpl.Execute(w, data); err != nil {
		log.Printf("render: %v", err)
	}
}

var indexTmpl = template.Must(template.New("i").Parse(`<!doctype html>
<meta charset="utf-8"><title>mock-telegram</title>
<style>
 body{font:14px ui-monospace,monospace;background:#14161A;color:#FAFAF7;margin:0;padding:2rem}
 h1{font-size:1.1rem;color:#F2C230;margin:0 0 .25rem}
 .hook{color:#5A6472;margin-bottom:1.5rem;word-break:break-all}
 .m{border:1px solid #2A2E35;padding:1rem;margin-bottom:1rem}
 .meta{color:#5A6472;font-size:.75rem;margin-bottom:.5rem}
 pre{white-space:pre-wrap;margin:0 0 .75rem}
 button{font:inherit;background:#F2C230;color:#14161A;border:0;padding:.4rem .9rem;margin-right:.4rem;cursor:pointer}
 button:hover{background:#fff}
 .edited{color:#1F7A5C}
 .empty{color:#5A6472}
</style>
<h1>mock-telegram</h1>
<div class="hook">webhook: {{if .Webhook}}{{.Webhook}}{{else}}<em>not registered</em>{{end}}</div>
{{if not .Messages}}<p class="empty">No messages yet.</p>{{end}}
{{range $m := .Messages}}
<div class="m">
  <div class="meta">#{{$m.MessageID}} &rarr; chat {{$m.ChatID}} &middot; {{$m.SentAt.Format "15:04:05"}}
    {{if $m.EditedAt}}<span class="edited">&middot; edited {{$m.EditedAt.Format "15:04:05"}}</span>{{end}}</div>
  <pre>{{$m.Text}}</pre>
  {{range $m.Buttons}}{{if .CallbackData}}
  <button onclick="press({{$m.MessageID}}, {{.CallbackData}})">{{.Text}}</button>
  {{end}}{{end}}
</div>
{{end}}
<script>
async function press(id, data){
  await fetch('/__press',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({message_id:id,callback_data:data})});
  location.reload();
}
setTimeout(()=>location.reload(), 5000);
</script>
`))

func flatten(rows [][]Button) []Button {
	var out []Button
	for _, row := range rows {
		out = append(out, row...)
	}
	return out
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

func unquote(s string) string { return strings.Trim(s, `"`) }

func asInt(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode: %v", err)
	}
}

func httpError(w http.ResponseWriter, err error) {
	http.Error(w, fmt.Sprintf("mock-telegram: %v", err), http.StatusBadRequest)
}
