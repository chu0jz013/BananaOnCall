package solution

import "time"

func NextHandoff(start, now time.Time, shift time.Duration) time.Time {
	if now.Before(start) {
		return start
	}
	n := now.Sub(start)/shift + 1
	return start.Add(n * shift)
}
