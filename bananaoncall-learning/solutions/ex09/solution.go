package solution

type Team struct{ Name string }

func (t *Team) Rename(name string) { t.Name = name }
