package solution

import "time"

func Current(start, now time.Time, shift time.Duration, m []string) string {
	if len(m) == 0 || shift <= 0 || now.Before(start) {
		return ""
	}
	idx := int(now.Sub(start)/shift) % len(m)
	return m[idx]
}
