package solution

import "errors"

type Incident struct{ Status string }

func (i *Incident) Ack() error {
	if i.Status != "triggered" {
		return errors.New("cannot ack")
	}
	i.Status = "acknowledged"
	return nil
}
func (i *Incident) Resolve() error {
	if i.Status == "resolved" {
		return errors.New("already resolved")
	}
	i.Status = "resolved"
	return nil
}
