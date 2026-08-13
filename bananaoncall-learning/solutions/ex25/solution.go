package solution

import "sync"

func Fanout(fns []func() error) []error {
	errs := make([]error, len(fns))
	var wg sync.WaitGroup
	for i, f := range fns {
		wg.Add(1)
		go func(i int, f func() error) { defer wg.Done(); errs[i] = f() }(i, f)
	}
	wg.Wait()
	return errs
}
