package solution

import (
	"errors"
	"fmt"
)

var ErrStore = errors.New("store failed")

func CreateIncident() error { return fmt.Errorf("create incident: %w", ErrStore) }
