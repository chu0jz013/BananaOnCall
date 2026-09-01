package domain

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// oncallPrefix is the convention that turns a calendar event into a shift:
// an event titled "oncall: mai" puts mai on call for its duration (FR-4.2).
// Anything else on the calendar is somebody's lunch and is ignored.
const oncallPrefix = "oncall:"

// icalEvent is one VEVENT, before recurrence is expanded.
type icalEvent struct {
	uid      string
	summary  string
	start    time.Time
	end      time.Time
	rrule    map[string]string
	dateOnly bool
}

// ParseICS reads an iCalendar body and expands every on-call event into the
// concrete shifts that fall inside [from, to).
//
// Only FREQ=WEEKLY recurrence is implemented, which is what a rotation actually
// uses and what fixtures/oncall.ics exercises. An RRULE we cannot expand yields
// its single base occurrence rather than nothing, so a misread calendar
// degrades to "one shift" instead of to "nobody is on call".
func ParseICS(scheduleID string, body []byte, from, to time.Time) ([]Shift, error) {
	events, err := parseEvents(body)
	if err != nil {
		return nil, err
	}

	var shifts []Shift
	for _, ev := range events {
		user, ok := oncallUser(ev.summary)
		if !ok {
			continue
		}
		for _, occ := range expand(ev, from, to) {
			shifts = append(shifts, Shift{
				ScheduleID: scheduleID,
				UserID:     user,
				StartsAt:   occ[0],
				EndsAt:     occ[1],
				Source:     "ical",
			})
		}
	}
	SortShifts(shifts)
	return shifts, nil
}

// oncallUser pulls the user id out of an event title, or reports that this
// event is not a shift at all.
func oncallUser(summary string) (string, bool) {
	s := strings.TrimSpace(summary)
	if len(s) < len(oncallPrefix) || !strings.EqualFold(s[:len(oncallPrefix)], oncallPrefix) {
		return "", false
	}
	user := strings.ToLower(strings.TrimSpace(s[len(oncallPrefix):]))
	return user, user != ""
}

// expand returns the [start, end) pairs of an event that overlap [from, to).
func expand(ev icalEvent, from, to time.Time) [][2]time.Time {
	dur := ev.end.Sub(ev.start)
	if dur <= 0 {
		dur = 24 * time.Hour
	}

	var out [][2]time.Time
	add := func(start time.Time) {
		end := start.Add(dur)
		if end.After(from) && start.Before(to) {
			out = append(out, [2]time.Time{start, end})
		}
	}

	if ev.rrule == nil || !strings.EqualFold(ev.rrule["FREQ"], "WEEKLY") {
		add(ev.start)
		return out
	}

	interval := 1
	if n, err := strconv.Atoi(ev.rrule["INTERVAL"]); err == nil && n > 0 {
		interval = n
	}
	step := time.Duration(interval) * 7 * 24 * time.Hour

	limit := to
	if until, err := parseICSTime(ev.rrule["UNTIL"]); err == nil && until.Before(limit) {
		limit = until
	}
	count := 0
	maxCount := 0
	if n, err := strconv.Atoi(ev.rrule["COUNT"]); err == nil && n > 0 {
		maxCount = n
	}

	// Jump straight to the first occurrence that could still be in range
	// instead of walking from DTSTART, which may be years back.
	occ := ev.start
	if occ.Add(dur).Before(from) {
		skipped := int(from.Sub(occ.Add(dur)) / step)
		occ = occ.Add(time.Duration(skipped) * step)
		count = skipped
	}

	for occ.Before(limit) {
		if maxCount > 0 && count >= maxCount {
			break
		}
		add(occ)
		occ = occ.Add(step)
		count++
	}
	return out
}

// parseEvents unfolds the body and reads every VEVENT out of it.
func parseEvents(body []byte) ([]icalEvent, error) {
	lines := unfold(string(body))

	var (
		events []icalEvent
		cur    *icalEvent
	)
	for _, line := range lines {
		name, params, value, ok := splitLine(line)
		if !ok {
			continue
		}

		switch strings.ToUpper(name) {
		case "BEGIN":
			if strings.EqualFold(value, "VEVENT") {
				cur = &icalEvent{}
			}
		case "END":
			if strings.EqualFold(value, "VEVENT") && cur != nil {
				if !cur.start.IsZero() {
					events = append(events, *cur)
				}
				cur = nil
			}
		}
		if cur == nil {
			continue
		}

		switch strings.ToUpper(name) {
		case "UID":
			cur.uid = value
		case "SUMMARY":
			cur.summary = value
		case "DTSTART", "DTEND":
			t, err := parseICSTime(value)
			if err != nil {
				return nil, fmt.Errorf("%s in %q: %w", name, cur.uid, err)
			}
			if strings.EqualFold(params["VALUE"], "DATE") {
				cur.dateOnly = true
			}
			if strings.EqualFold(name, "DTSTART") {
				cur.start = t
			} else {
				cur.end = t
			}
		case "RRULE":
			cur.rrule = parseParams(value, ";")
		}
	}
	return events, nil
}

// unfold joins RFC 5545 continuation lines, which begin with a space or tab.
func unfold(s string) []string {
	raw := strings.Split(strings.ReplaceAll(s, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(raw))
	for _, line := range raw {
		if line == "" {
			continue
		}
		if (line[0] == ' ' || line[0] == '\t') && len(out) > 0 {
			out[len(out)-1] += line[1:]
			continue
		}
		out = append(out, line)
	}
	return out
}

// splitLine breaks "NAME;PARAM=V:value" into its three parts.
func splitLine(line string) (name string, params map[string]string, value string, ok bool) {
	i := strings.IndexByte(line, ':')
	if i < 0 {
		return "", nil, "", false
	}
	head, value := line[:i], line[i+1:]

	if j := strings.IndexByte(head, ';'); j >= 0 {
		return head[:j], parseParams(head[j+1:], ";"), value, true
	}
	return head, nil, value, true
}

func parseParams(s, sep string) map[string]string {
	out := map[string]string{}
	for _, part := range strings.Split(s, sep) {
		k, v, found := strings.Cut(part, "=")
		if !found {
			continue
		}
		out[strings.ToUpper(strings.TrimSpace(k))] = strings.TrimSpace(v)
	}
	return out
}

// parseICSTime accepts the three forms a calendar actually emits: UTC, floating
// local, and date-only. Floating times are read as UTC — the fixture and Google
// Calendar's iCal export both publish UTC.
func parseICSTime(v string) (time.Time, error) {
	v = strings.TrimSpace(v)
	for _, layout := range []string{"20060102T150405Z", "20060102T150405", "20060102"} {
		if t, err := time.Parse(layout, v); err == nil {
			return t.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognized time %q", v)
}
