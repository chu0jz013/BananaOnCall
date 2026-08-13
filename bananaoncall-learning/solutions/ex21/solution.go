package solution

import (
	"context"
	"errors"
)

func Wait(ctx context.Context, jobs <-chan string) (string, error) {
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case j, ok := <-jobs:
		if !ok {
			return "", errors.New("closed")
		}
		return j, nil
	}
}
