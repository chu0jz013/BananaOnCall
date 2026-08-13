package solution

func WithSource(labels map[string]string) map[string]string {
	out := make(map[string]string, len(labels)+1)
	for k, v := range labels {
		out[k] = v
	}
	out["source"] = "bananaoncall"
	return out
}
