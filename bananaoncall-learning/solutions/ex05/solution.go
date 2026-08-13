package solution

func Rotate(m []string) []string {
	if len(m) < 2 {
		return append([]string(nil), m...)
	}
	out := append([]string(nil), m[1:]...)
	return append(out, m[0])
}
