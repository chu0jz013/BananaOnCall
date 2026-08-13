package exercise

func Priority(s string) string {
	if s == "critical" {
		return "P1"
	}
	if s == "warning" {
		return "P2"
	}
	return "P3"
}
