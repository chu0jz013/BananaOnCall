package solution

import "time"

type Override struct {
	User       string
	Start, End time.Time
}

func Effective(rotation string, now time.Time, os []Override) string {
	for _, o := range os {
		if !now.Before(o.Start) && now.Before(o.End) {
			return o.User
		}
	}
	return rotation
}
