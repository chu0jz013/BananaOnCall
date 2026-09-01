package domain

import "fmt"

// TargetKind is who a step notifies (FR-3.3).
type TargetKind string

const (
	// TargetOnCall resolves against the schedule at send time, so a rotation
	// change takes effect without touching the policy.
	TargetOnCall TargetKind = "oncall"
	// TargetUser is one named person, regardless of the rota.
	TargetUser TargetKind = "user"
	// TargetGroupChat is the war room.
	TargetGroupChat TargetKind = "group_chat"
)

// MaxRepeats caps the "keep shouting until someone answers" behaviour of the
// last step (FR-3.6). Fifty is the doc's number: enough to survive a whole team
// asleep, few enough that a forgotten incident cannot page forever.
const MaxRepeats = 50

// Step is one rung of an escalation policy (FR-3.2).
type Step struct {
	Order int        `json:"order"`
	Kind  TargetKind `json:"kind"`
	// Ref is the user id for TargetUser or the chat id for TargetGroupChat,
	// and is ignored for TargetOnCall.
	Ref string `json:"ref"`
	// WaitSeconds is how long to wait for an ack before moving on (FR-3.4).
	WaitSeconds int `json:"waitSeconds"`
}

// Policy is an ordered escalation chain.
type Policy struct {
	ID    string `json:"id"`
	Steps []Step `json:"steps"`
}

// DefaultPolicyID is the one chain that exists until FR-3.1 routing lands.
const DefaultPolicyID = "ep-critical"

// Resolve returns the step to run at a 1-based level.
//
// Levels past the end repeat the last step, which is what FR-3.6 asks for, and
// stop after MaxRepeats of it so an unanswered incident cannot page forever.
// ok is false once the chain is exhausted.
func (p Policy) Resolve(level int) (step Step, ok bool) {
	n := len(p.Steps)
	switch {
	case n == 0, level < 1:
		return Step{}, false
	case level <= n:
		return p.Steps[level-1], true
	case level <= n+MaxRepeats:
		return p.Steps[n-1], true
	default:
		return Step{}, false
	}
}

// Describe names the target of a step in a way a timeline entry can carry.
func (s Step) Describe() string {
	switch s.Kind {
	case TargetOnCall:
		return "whoever is on call"
	case TargetGroupChat:
		return fmt.Sprintf("group chat %s", s.Ref)
	default:
		return fmt.Sprintf("user %s", s.Ref)
	}
}
