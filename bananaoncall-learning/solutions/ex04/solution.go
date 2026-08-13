package solution

import "strings"

func FirstResponder(names []string) string {
	for _, n := range names {
		if strings.TrimSpace(n) != "" {
			return n
		}
	}
	return ""
}
