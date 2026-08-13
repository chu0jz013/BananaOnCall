package solution

import "context"

type Incident struct{ ID string }
type Notifier interface {
	Notify(context.Context, Incident) error
}
