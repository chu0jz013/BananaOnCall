package solution

import (
	"errors"
	"strings"
)

func NormalizeService(s string) (string, error) {
	v := strings.ToLower(strings.TrimSpace(s))
	if v == "" {
		return "", errors.New("service is required")
	}
	return v, nil
}
