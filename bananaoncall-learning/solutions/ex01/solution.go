package solution

import "strings"

func NormalizeSeverity(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "info", "warning", "critical":
		return strings.ToLower(strings.TrimSpace(s))
	default:
		return "warning"
	}
}
