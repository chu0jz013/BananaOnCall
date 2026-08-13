package solution

import "sync"

func Bounded(items []int, limit int, fn func(int)) {
	sem := make(chan struct{}, limit)
	var wg sync.WaitGroup
	for _, x := range items {
		wg.Add(1)
		sem <- struct{}{}
		go func(v int) { defer wg.Done(); defer func() { <-sem }(); fn(v) }(x)
	}
	wg.Wait()
}
