package exercise

import "time"

type Override struct {
	User       string
	Start, End time.Time
}

func Effective(rotation string, now time.Time, overrides []Override) string { return rotation }
