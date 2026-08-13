package exercise

type NotificationJob struct{ IncidentID string }

// TODO: implement Drain
func Drain(ch <-chan NotificationJob) []NotificationJob { return nil }
