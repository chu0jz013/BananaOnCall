package exercise

type Payload struct {
	Fingerprint string
	Severity    string
}

func Decode(b []byte) (Payload, error) { return Payload{}, nil }
