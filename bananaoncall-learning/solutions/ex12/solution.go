package solution

import "encoding/json"

type Payload struct {
	Fingerprint string `json:"fingerprint"`
	Severity    string `json:"severity"`
}

func Decode(b []byte) (Payload, error) { var p Payload; err := json.Unmarshal(b, &p); return p, err }
