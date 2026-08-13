package solution

func Priority(severity string) string {
	switch severity {
	case "critical":
		return "P1"
	case "warning":
		return "P2"
	default:
		return "P3"
	}
}
