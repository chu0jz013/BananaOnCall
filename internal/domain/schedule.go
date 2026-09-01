package domain

import (
	"sort"
	"time"
)

// DisplayZone is Asia/Ho_Chi_Minh as a fixed offset rather than a tzdata
// lookup: Vietnam has had no DST since 1975, and a fixed zone means the
// handlers do not depend on a zoneinfo database being present in the runtime
// image (FR-4.7).
var DisplayZone = time.FixedZone("ICT", 7*60*60)

// Shift is one materialized on-call window — the `SCHED#<id> / SHIFT#<startISO>`
// item. Shifts are written by the schedule sync so that answering "who is on
// call right now" is a Query, never an ICS parse (FR-4.4).
type Shift struct {
	ScheduleID string    `json:"scheduleId"`
	UserID     string    `json:"userId"`
	StartsAt   time.Time `json:"startsAt"`
	EndsAt     time.Time `json:"endsAt"`
	// Source is "ical" for a synced shift and "override" for a manual one, so
	// an override can win without the sync having to delete anything.
	Source string `json:"source"`
}

// Covers reports whether the shift is in force at t. The window is half-open:
// the handover instant belongs to the incoming shift, never to both.
func (s Shift) Covers(t time.Time) bool {
	return !t.Before(s.StartsAt) && t.Before(s.EndsAt)
}

// WhoIsOnCall picks the shift in force at t.
//
// When several cover the same instant the latest-starting one wins, which is
// what makes a manual override work: it is written on top of the synced shift
// rather than replacing it.
func WhoIsOnCall(shifts []Shift, t time.Time) (Shift, bool) {
	var best Shift
	found := false
	for _, s := range shifts {
		if !s.Covers(t) {
			continue
		}
		if !found || s.StartsAt.After(best.StartsAt) ||
			(s.StartsAt.Equal(best.StartsAt) && s.Source == "override") {
			best, found = s, true
		}
	}
	return best, found
}

// SortShifts orders shifts by start time, oldest first.
func SortShifts(shifts []Shift) {
	sort.Slice(shifts, func(i, j int) bool {
		return shifts[i].StartsAt.Before(shifts[j].StartsAt)
	})
}
