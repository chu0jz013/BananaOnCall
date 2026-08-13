package solution

type Alert struct {
	ID          string
	Fingerprint string
	Service     string
	Severity    string
	Summary     string
	Labels      map[string]string
}
