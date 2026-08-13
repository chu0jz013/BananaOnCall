package exercise

type Incident struct{ Status string }

func (i *Incident) Ack() error     { return nil }
func (i *Incident) Resolve() error { return nil }
