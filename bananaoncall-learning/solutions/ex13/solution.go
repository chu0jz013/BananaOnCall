package solution

import (
	"fmt"
	"time"
)

func ParseInterval(s string) (time.Duration, error) {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 0, err
	}
	if d < time.Second {
		return 0, fmt.Errorf("interval too small")
	}
	return d, nil
}
