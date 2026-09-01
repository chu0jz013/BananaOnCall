package domain_test

import (
	"testing"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

var testPolicy = domain.Policy{
	ID: domain.DefaultPolicyID,
	Steps: []domain.Step{
		{Order: 1, Kind: domain.TargetOnCall, WaitSeconds: 20},
		{Order: 2, Kind: domain.TargetUser, Ref: "linh", WaitSeconds: 20},
		{Order: 3, Kind: domain.TargetGroupChat, Ref: "-100999", WaitSeconds: 30},
	},
}

func TestPolicyWalksItsSteps(t *testing.T) {
	for level, want := range map[int]domain.TargetKind{
		1: domain.TargetOnCall,
		2: domain.TargetUser,
		3: domain.TargetGroupChat,
	} {
		step, ok := testPolicy.Resolve(level)
		if !ok {
			t.Fatalf("level %d: exhausted too early", level)
		}
		if step.Kind != want {
			t.Errorf("level %d: want %s, got %s", level, want, step.Kind)
		}
	}
}

func TestPolicyRepeatsTheLastStepThenStops(t *testing.T) {
	// FR-3.6: keep shouting at the war room, but not forever.
	last := len(testPolicy.Steps)

	step, ok := testPolicy.Resolve(last + 7)
	if !ok || step.Kind != domain.TargetGroupChat {
		t.Errorf("a level past the end should repeat the last step, got %+v ok=%v", step, ok)
	}
	if _, ok := testPolicy.Resolve(last + domain.MaxRepeats); !ok {
		t.Error("the last allowed repeat was refused")
	}
	if _, ok := testPolicy.Resolve(last + domain.MaxRepeats + 1); ok {
		t.Error("escalation ran past MaxRepeats")
	}
}

func TestEmptyPolicyResolvesToNothing(t *testing.T) {
	if _, ok := (domain.Policy{}).Resolve(1); ok {
		t.Error("an empty policy must not produce a step")
	}
	if _, ok := testPolicy.Resolve(0); ok {
		t.Error("levels are 1-based; 0 must not resolve")
	}
}
