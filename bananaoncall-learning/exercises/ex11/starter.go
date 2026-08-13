package exercise

import "errors"

var ErrStore = errors.New("store failed")

func CreateIncident() error { return ErrStore }
