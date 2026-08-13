package solution

type NotificationJob struct{ IncidentID string }

func Drain(ch <-chan NotificationJob) []NotificationJob {
	var out []NotificationJob
	for j := range ch {
		out = append(out, j)
	}
	return out
}
