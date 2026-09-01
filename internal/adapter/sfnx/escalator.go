// Package sfnx adapts Step Functions to the ports.Escalator interface.
//
// D1 chose Step Functions Standard over a cron sweeper because the wait lives
// in the service rather than in a process: a deploy or a Lambda restart mid-wait
// does not lose the escalation (FR-3.7), and each incident's ladder is visible
// as an execution graph when someone asks why the second page never went out.
package sfnx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sfn"
	"github.com/aws/aws-sdk-go-v2/service/sfn/types"
)

// Escalator starts and stops one escalation per alert group.
type Escalator struct {
	client          *sfn.Client
	stateMachineArn string
}

func New(client *sfn.Client, stateMachineArn string) *Escalator {
	return &Escalator{client: client, stateMachineArn: stateMachineArn}
}

// Start begins the ladder for a group.
//
// The execution is named after the group, which makes this idempotent: SQS
// redelivering the alert that opened the incident cannot start a second
// escalation, it just finds the first one again.
func (e *Escalator) Start(ctx context.Context, groupID string) (string, error) {
	input, err := json.Marshal(map[string]any{"groupId": groupID, "level": 1})
	if err != nil {
		return "", fmt.Errorf("encode escalation input: %w", err)
	}

	out, err := e.client.StartExecution(ctx, &sfn.StartExecutionInput{
		StateMachineArn: aws.String(e.stateMachineArn),
		Name:            aws.String(groupID),
		Input:           aws.String(string(input)),
	})
	var exists *types.ExecutionAlreadyExists
	if errors.As(err, &exists) {
		return e.executionArn(groupID), nil
	}
	if err != nil {
		return "", fmt.Errorf("start escalation for %s: %w", groupID, err)
	}
	return *out.ExecutionArn, nil
}

// Stop ends an escalation early — an ack or a resolve (FR-3.5). Stopping an
// execution that already finished is not an error worth surfacing: the
// escalation is over either way, which is all the caller wanted.
func (e *Escalator) Stop(ctx context.Context, executionArn, reason string) error {
	if executionArn == "" {
		return nil
	}
	_, err := e.client.StopExecution(ctx, &sfn.StopExecutionInput{
		ExecutionArn: aws.String(executionArn),
		Cause:        aws.String(reason),
	})
	var gone *types.ExecutionDoesNotExist
	if err != nil && !errors.As(err, &gone) {
		return fmt.Errorf("stop escalation: %w", err)
	}
	return nil
}

// executionArn rebuilds the ARN of an execution we know exists by name.
// arn:aws:states:<region>:<acct>:stateMachine:<name> becomes
// arn:aws:states:<region>:<acct>:execution:<name>:<executionName>.
func (e *Escalator) executionArn(name string) string {
	return strings.Replace(e.stateMachineArn, ":stateMachine:", ":execution:", 1) + ":" + name
}
