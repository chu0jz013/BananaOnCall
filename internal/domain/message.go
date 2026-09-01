package domain

import (
	"fmt"
	"strings"
	"time"
)

// Button is one inline-keyboard button. Either CallbackData or URL is set,
// never both — that is Telegram's own rule, not ours.
type Button struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data,omitempty"`
	URL          string `json:"url,omitempty"`
}

// Message is a rendered notification, ready for any chat transport.
type Message struct {
	Text    string     `json:"text"`
	Buttons [][]Button `json:"buttons"`
}

// Callback data prefixes. Telegram caps callback_data at 64 bytes, so these
// stay terse and carry only the group id.
const (
	ActionAck     = "ack"
	ActionResolve = "res"
	ActionSilence = "sil"
)

// ParseCallback splits "ack:<groupID>" into its parts.
func ParseCallback(data string) (action, groupID string, ok bool) {
	action, rest, found := strings.Cut(data, ":")
	if !found || rest == "" {
		return "", "", false
	}
	// Silence carries a duration after the id; nothing else does.
	groupID, _, _ = strings.Cut(rest, ":")
	switch action {
	case ActionAck, ActionResolve, ActionSilence:
		return action, groupID, groupID != ""
	default:
		return "", "", false
	}
}

// RenderAlert builds the notification for one escalation level.
//
// FR-5.6 is the bar: severity, summary, labels, when it started, and the links —
// someone reading this on a phone at 3am must know what to do without opening a
// laptop.
func RenderAlert(g Group, a Alert, level int, now time.Time) Message {
	var b strings.Builder

	fmt.Fprintf(&b, "%s %s\n", severityBadge(g.Severity), g.Title)
	if level > 1 {
		fmt.Fprintf(&b, "escalation step %d — nobody acked yet\n", level)
	}
	b.WriteString("\n")

	if s := a.Annotations["summary"]; s != "" {
		fmt.Fprintf(&b, "%s\n\n", s)
	}
	if d := a.Annotations["description"]; d != "" && d != a.Annotations["summary"] {
		fmt.Fprintf(&b, "%s\n\n", d)
	}

	fmt.Fprintf(&b, "service   %s\n", g.Service)
	fmt.Fprintf(&b, "severity  %s\n", g.Severity)
	fmt.Fprintf(&b, "started   %s (%s ago)\n",
		g.StartedAt.In(DisplayZone).Format("15:04:05 02 Jan"),
		roundDuration(now.Sub(g.StartedAt)))
	if g.AlertCount > 1 {
		fmt.Fprintf(&b, "alerts    %d in this group\n", g.AlertCount)
	}
	if labels := LabelLine(a.Labels, "alertname", "severity"); labels != "" {
		fmt.Fprintf(&b, "labels    %s\n", labels)
	}
	fmt.Fprintf(&b, "\nincident  %s", g.ID)

	row := []Button{
		{Text: "✅ Ack", CallbackData: ActionAck + ":" + g.ID},
		{Text: "✔️ Resolve", CallbackData: ActionResolve + ":" + g.ID},
		{Text: "🔕 Silence 1h", CallbackData: ActionSilence + ":" + g.ID + ":3600"},
	}
	links := linkRow(a)

	buttons := [][]Button{row}
	if len(links) > 0 {
		buttons = append(buttons, links)
	}
	return Message{Text: b.String(), Buttons: buttons}
}

// RenderAcked is what the original message is edited into once somebody takes
// it (FR-5.5). The buttons go with it: an acked incident has nothing left to
// ack, and a stale button is a way to double-page a team.
func RenderAcked(g Group, original string, by string, at time.Time) Message {
	head := fmt.Sprintf("✅ Acked by @%s at %s\n\n",
		by, at.In(DisplayZone).Format("15:04:05 02 Jan"))
	return Message{
		Text: head + strings.TrimSpace(stripStatusLine(original)),
		Buttons: [][]Button{{
			{Text: "✔️ Resolve", CallbackData: ActionResolve + ":" + g.ID},
		}},
	}
}

// RenderResolved closes the message out. No buttons at all: the incident is over.
func RenderResolved(g Group, original string, by string, at time.Time) Message {
	head := fmt.Sprintf("✔️ Resolved by %s at %s\n\n",
		by, at.In(DisplayZone).Format("15:04:05 02 Jan"))
	return Message{Text: head + strings.TrimSpace(stripStatusLine(original))}
}

// DedupeKey is what stops a retry from paging the same person twice for the
// same rung of the ladder (FR-5.4).
func DedupeKey(groupID string, level int, channel, user string) string {
	return digest(groupID, fmt.Sprint(level), channel, user)
}

// stripStatusLine drops a previously prepended status header so repeated edits
// do not stack up.
func stripStatusLine(text string) string {
	for _, prefix := range []string{"✅ Acked by", "✔️ Resolved by"} {
		if strings.HasPrefix(text, prefix) {
			if _, rest, ok := strings.Cut(text, "\n\n"); ok {
				return rest
			}
		}
	}
	return text
}

func severityBadge(sev string) string {
	switch strings.ToLower(sev) {
	case "critical":
		return "🔴 CRITICAL"
	case "warning":
		return "🟡 WARNING"
	case "info":
		return "🔵 INFO"
	default:
		return "⚪ " + strings.ToUpper(sev)
	}
}

// linkRow surfaces whichever of the two links the alert actually carries.
func linkRow(a Alert) []Button {
	var row []Button
	if u := firstOf(a.Annotations, "runbook_url", "runbook"); u != "" {
		row = append(row, Button{Text: "📖 Runbook", URL: u})
	}
	if u := firstOf(a.Annotations, "dashboard_url", "grafana_url", "dashboard"); u != "" {
		row = append(row, Button{Text: "📈 Grafana", URL: u})
	} else if a.GeneratorURL != "" {
		row = append(row, Button{Text: "📈 Source", URL: a.GeneratorURL})
	}
	return row
}

func firstOf(m map[string]string, keys ...string) string {
	for _, k := range keys {
		if v := m[k]; v != "" {
			return v
		}
	}
	return ""
}

// roundDuration prints a duration the way a person reads one under stress.
func roundDuration(d time.Duration) string {
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	default:
		return fmt.Sprintf("%dh%02dm", int(d.Hours()), int(d.Minutes())%60)
	}
}
