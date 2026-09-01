package dynamox

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// shiftTTL keeps materialized shifts a little past the window anyone queries.
const shiftTTL = 180 * 24 * time.Hour

// Policy reads an escalation chain, ordered by step.
func (s *Store) Policy(ctx context.Context, id string) (domain.Policy, error) {
	out, err := s.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(s.table),
		KeyConditionExpression: aws.String("pk = :pk AND begins_with(sk, :step)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":   str("EP#" + id),
			":step": str("STEP#"),
		},
	})
	if err != nil {
		return domain.Policy{}, fmt.Errorf("query policy %s: %w", id, err)
	}

	var rows []struct {
		SK          string `dynamodbav:"sk"`
		Kind        string `dynamodbav:"kind"`
		Ref         string `dynamodbav:"ref"`
		WaitSeconds int    `dynamodbav:"waitSeconds"`
	}
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &rows); err != nil {
		return domain.Policy{}, fmt.Errorf("decode policy %s: %w", id, err)
	}

	p := domain.Policy{ID: id}
	for _, row := range rows {
		// sk is STEP#01, zero-padded so the Query returns them in order.
		order, _ := strconv.Atoi(trimPrefix(row.SK, "STEP#"))
		p.Steps = append(p.Steps, domain.Step{
			Order:       order,
			Kind:        domain.TargetKind(row.Kind),
			Ref:         row.Ref,
			WaitSeconds: row.WaitSeconds,
		})
	}
	return p, nil
}

// Shifts returns the materialized rota overlapping [from, to].
//
// The sort key is the shift's *start*, so the query has to reach back before
// `from` to catch a shift that began earlier and is still running — otherwise
// "who is on call right now" misses the person who came on duty yesterday.
func (s *Store) Shifts(ctx context.Context, scheduleID string, from, to time.Time) ([]domain.Shift, error) {
	out, err := s.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(s.table),
		KeyConditionExpression: aws.String("pk = :pk AND sk BETWEEN :from AND :to"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":   str("SCHED#" + scheduleID),
			":from": str("SHIFT#" + from.UTC().Format(time.RFC3339)),
			":to":   str("SHIFT#" + to.UTC().Format(time.RFC3339)),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("query shifts for %s: %w", scheduleID, err)
	}

	var rows []struct {
		UserID   string `dynamodbav:"userId"`
		StartsAt string `dynamodbav:"startsAt"`
		EndsAt   string `dynamodbav:"endsAt"`
		Source   string `dynamodbav:"source"`
	}
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &rows); err != nil {
		return nil, fmt.Errorf("decode shifts: %w", err)
	}

	shifts := make([]domain.Shift, 0, len(rows))
	for _, row := range rows {
		shifts = append(shifts, domain.Shift{
			ScheduleID: scheduleID,
			UserID:     row.UserID,
			StartsAt:   parseTime(row.StartsAt),
			EndsAt:     parseTime(row.EndsAt),
			Source:     row.Source,
		})
	}
	return shifts, nil
}

// PutShifts materializes the rota. Idempotent by key: re-running the sync
// overwrites the same items rather than duplicating them.
func (s *Store) PutShifts(ctx context.Context, shifts []domain.Shift) error {
	const batch = 25 // BatchWriteItem's hard limit

	for start := 0; start < len(shifts); start += batch {
		end := min(start+batch, len(shifts))

		writes := make([]types.WriteRequest, 0, end-start)
		for _, sh := range shifts[start:end] {
			writes = append(writes, types.WriteRequest{
				PutRequest: &types.PutRequest{Item: map[string]types.AttributeValue{
					"pk":       str("SCHED#" + sh.ScheduleID),
					"sk":       str("SHIFT#" + sh.StartsAt.UTC().Format(time.RFC3339)),
					"userId":   str(sh.UserID),
					"startsAt": str(sh.StartsAt.UTC().Format(time.RFC3339)),
					"endsAt":   str(sh.EndsAt.UTC().Format(time.RFC3339)),
					"source":   str(sh.Source),
					"ttl":      num(sh.EndsAt.Add(shiftTTL).Unix()),
				}},
			})
		}

		if _, err := s.client.BatchWriteItem(ctx, &dynamodb.BatchWriteItemInput{
			RequestItems: map[string][]types.WriteRequest{s.table: writes},
		}); err != nil {
			return fmt.Errorf("write shifts: %w", err)
		}
	}
	return nil
}

// Contact looks up how to reach one person on one channel.
func (s *Store) Contact(ctx context.Context, userID, channel string) (domain.Contact, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(s.table),
		Key: map[string]types.AttributeValue{
			"pk": str("USER#" + userID),
			"sk": str("CONTACT#" + channel),
		},
	})
	if err != nil {
		return domain.Contact{}, fmt.Errorf("get contact %s/%s: %w", userID, channel, err)
	}
	if len(out.Item) == 0 {
		return domain.Contact{}, fmt.Errorf("no %s contact for user %s", channel, userID)
	}

	var row struct {
		ChatID   string `dynamodbav:"chatId"`
		Username string `dynamodbav:"username"`
	}
	if err := attributevalue.UnmarshalMap(out.Item, &row); err != nil {
		return domain.Contact{}, fmt.Errorf("decode contact: %w", err)
	}
	return domain.Contact{
		UserID:   userID,
		Channel:  channel,
		ChatID:   row.ChatID,
		Username: row.Username,
	}, nil
}
