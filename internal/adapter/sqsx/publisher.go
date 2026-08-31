// Package sqsx adapts SQS FIFO to the ports.AlertSink interface.
package sqsx

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// Publisher writes envelopes to a FIFO queue.
type Publisher struct {
	client   *sqs.Client
	queueURL string
}

func NewPublisher(client *sqs.Client, queueURL string) *Publisher {
	return &Publisher{client: client, queueURL: queueURL}
}

// Publish sends one envelope. MessageGroupId keeps a single subject strictly
// ordered (firing before resolved, D4); MessageDeduplicationId absorbs a
// retried identical delivery within the queue's 5-minute window (FR-1.6).
func (p *Publisher) Publish(ctx context.Context, env domain.Envelope) error {
	body, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal envelope: %w", err)
	}

	_, err = p.client.SendMessage(ctx, &sqs.SendMessageInput{
		QueueUrl:               aws.String(p.queueURL),
		MessageBody:            aws.String(string(body)),
		MessageGroupId:         aws.String(env.RoutingKey),
		MessageDeduplicationId: aws.String(env.DedupeKey),
	})
	if err != nil {
		return fmt.Errorf("sqs send: %w", err)
	}
	return nil
}
