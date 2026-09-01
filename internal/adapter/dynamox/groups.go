package dynamox

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// groupTTL matches the 90-day retention the data model gives alert groups (§07).
const groupTTL = 90 * 24 * time.Hour

// timelineTTL is shorter: the timeline is for the incident review, not forever.
const timelineTTL = 30 * 24 * time.Hour

// Store is the write side of the single table — alert groups, their timelines,
// escalation policies and the rota. The status board's read side lives in
// board.go and shares the same item shapes.
type Store struct {
	client *dynamodb.Client
	table  string
}

func NewStore(client *dynamodb.Client, table string) *Store {
	return &Store{client: client, table: table}
}

// metaItem is the stored shape of `AG#<id> / META`. It is deliberately a
// superset of what tools/seed writes and what board.go reads, so seeded history
// and real incidents are indistinguishable to the status board.
type metaItem struct {
	PK           string `dynamodbav:"pk"`
	SK           string `dynamodbav:"sk"`
	GSI1PK       string `dynamodbav:"gsi1pk"`
	GSI1SK       string `dynamodbav:"gsi1sk"`
	Fingerprint  string `dynamodbav:"fingerprint,omitempty"`
	Title        string `dynamodbav:"title"`
	Service      string `dynamodbav:"service"`
	Severity     string `dynamodbav:"severity"`
	State        string `dynamodbav:"state"`
	StartedAt    string `dynamodbav:"startedAt"`
	AckedAt      string `dynamodbav:"ackedAt,omitempty"`
	AckedBy      string `dynamodbav:"ackedBy,omitempty"`
	ResolvedAt   string `dynamodbav:"resolvedAt,omitempty"`
	AlertCount   int    `dynamodbav:"alertCount"`
	ExecutionArn string `dynamodbav:"executionArn,omitempty"`
	ChatID       string `dynamodbav:"chatId,omitempty"`
	MessageID    int    `dynamodbav:"messageId,omitempty"`
	Level        int    `dynamodbav:"level,omitempty"`
	Alert        string `dynamodbav:"alert,omitempty"`
	TTL          int64  `dynamodbav:"ttl"`
}

func (m metaItem) toDomain() domain.Group {
	return domain.Group{
		ID:           trimPrefix(m.PK, "AG#"),
		Fingerprint:  m.Fingerprint,
		Title:        m.Title,
		Service:      m.Service,
		Severity:     m.Severity,
		State:        m.State,
		StartedAt:    parseTime(m.StartedAt),
		AckedAt:      parseOptionalTime(m.AckedAt),
		AckedBy:      m.AckedBy,
		ResolvedAt:   parseOptionalTime(m.ResolvedAt),
		AlertCount:   m.AlertCount,
		ExecutionArn: m.ExecutionArn,
		ChatID:       m.ChatID,
		MessageID:    m.MessageID,
	}
}

// OpenOrJoin is the whole of FR-2.3 and FR-2.4 in one call.
//
// The `FP#<fingerprint> / OPEN` pointer is the lock: a conditional put on it
// decides which of two concurrent deliveries opens the incident. The loser
// joins the group the winner made, which is what keeps ten alerts about one
// problem to one page.
func (s *Store) OpenOrJoin(ctx context.Context, g domain.Group) (domain.Group, bool, error) {
	now := time.Now().UTC()
	pointer := "FP#" + g.Fingerprint

	_, err := s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(s.table),
		Item: map[string]types.AttributeValue{
			"pk":      str(pointer),
			"sk":      str("OPEN"),
			"groupId": str(g.ID),
			"ttl":     num(now.Add(groupTTL).Unix()),
		},
		ConditionExpression: aws.String("attribute_not_exists(pk)"),
	})
	switch {
	case err == nil:
		if err := s.putMeta(ctx, g); err != nil {
			return domain.Group{}, false, err
		}
		return g, true, nil
	case !isConditionFailed(err):
		return domain.Group{}, false, fmt.Errorf("claim fingerprint: %w", err)
	}

	// Somebody already owns this fingerprint. Join their group.
	existing, err := s.pointerTarget(ctx, pointer)
	if err != nil {
		return domain.Group{}, false, err
	}

	joined, err := s.increment(ctx, existing)
	if err == nil {
		return joined, false, nil
	}
	if !errors.Is(err, errGroupClosed) {
		return domain.Group{}, false, err
	}

	// The pointer outlived its group — the incident closed and this is a fresh
	// occurrence of the same problem, so it gets a new group (FR-2.4).
	if _, err := s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(s.table),
		Item: map[string]types.AttributeValue{
			"pk":      str(pointer),
			"sk":      str("OPEN"),
			"groupId": str(g.ID),
			"ttl":     num(now.Add(groupTTL).Unix()),
		},
	}); err != nil {
		return domain.Group{}, false, fmt.Errorf("reclaim fingerprint: %w", err)
	}
	if err := s.putMeta(ctx, g); err != nil {
		return domain.Group{}, false, err
	}
	return g, true, nil
}

var errGroupClosed = errors.New("group is already resolved")

// increment adds one alert to an open group without sending anything (FR-2.3).
func (s *Store) increment(ctx context.Context, groupID string) (domain.Group, error) {
	out, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:           aws.String(s.table),
		Key:                 groupKey(groupID),
		UpdateExpression:    aws.String("ADD alertCount :one"),
		ConditionExpression: aws.String("attribute_exists(pk) AND #s <> :resolved"),
		ExpressionAttributeNames: map[string]string{
			"#s": "state",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":one":      num(1),
			":resolved": str(domain.StateResolved),
		},
		ReturnValues: types.ReturnValueAllNew,
	})
	if isConditionFailed(err) {
		return domain.Group{}, errGroupClosed
	}
	if err != nil {
		return domain.Group{}, fmt.Errorf("join group %s: %w", groupID, err)
	}
	return decodeMeta(out.Attributes)
}

func (s *Store) putMeta(ctx context.Context, g domain.Group) error {
	item := metaItem{
		PK:          "AG#" + g.ID,
		SK:          "META",
		GSI1PK:      "STATE#" + g.State,
		GSI1SK:      g.SortKey().Format(time.RFC3339),
		Fingerprint: g.Fingerprint,
		Title:       g.Title,
		Service:     g.Service,
		Severity:    g.Severity,
		State:       g.State,
		StartedAt:   g.StartedAt.Format(time.RFC3339),
		AlertCount:  g.AlertCount,
		TTL:         g.StartedAt.Add(groupTTL).Unix(),
	}

	av, err := attributevalue.MarshalMap(item)
	if err != nil {
		return fmt.Errorf("encode group: %w", err)
	}
	if _, err := s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(s.table),
		Item:      av,
	}); err != nil {
		return fmt.Errorf("put group %s: %w", g.ID, err)
	}
	return nil
}

// StoreAlert keeps the alert that opened the group, so the notifier can render
// a message without going back to the queue.
func (s *Store) StoreAlert(ctx context.Context, groupID string, a domain.Alert) error {
	body, err := json.Marshal(a)
	if err != nil {
		return fmt.Errorf("encode alert: %w", err)
	}
	return s.set(ctx, groupID, "SET alert = :a", map[string]types.AttributeValue{
		":a": str(string(body)),
	})
}

// RepresentativeAlert reads back what StoreAlert kept.
func (s *Store) RepresentativeAlert(ctx context.Context, groupID string) (domain.Alert, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(s.table),
		Key:       groupKey(groupID),
	})
	if err != nil {
		return domain.Alert{}, fmt.Errorf("get group %s: %w", groupID, err)
	}
	var m metaItem
	if err := attributevalue.UnmarshalMap(out.Item, &m); err != nil {
		return domain.Alert{}, fmt.Errorf("decode group %s: %w", groupID, err)
	}
	if m.Alert == "" {
		return domain.Alert{}, nil
	}
	var a domain.Alert
	if err := json.Unmarshal([]byte(m.Alert), &a); err != nil {
		return domain.Alert{}, fmt.Errorf("decode stored alert: %w", err)
	}
	return a, nil
}

func (s *Store) Get(ctx context.Context, groupID string) (domain.Group, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(s.table),
		Key:       groupKey(groupID),
	})
	if err != nil {
		return domain.Group{}, fmt.Errorf("get group %s: %w", groupID, err)
	}
	if len(out.Item) == 0 {
		return domain.Group{}, fmt.Errorf("group %s not found", groupID)
	}
	return decodeMeta(out.Item)
}

func (s *Store) SetExecution(ctx context.Context, groupID, executionArn string) error {
	return s.set(ctx, groupID, "SET executionArn = :arn", map[string]types.AttributeValue{
		":arn": str(executionArn),
	})
}

func (s *Store) RecordNotification(ctx context.Context, groupID, chatID string, messageID, level int) error {
	// Only the first message is remembered as the one to edit: FR-5.5 rewrites
	// the message a responder is looking at, which is the one that paged them.
	expr := "SET chatId = if_not_exists(chatId, :c), messageId = if_not_exists(messageId, :m), #l = :l"
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(s.table),
		Key:                      groupKey(groupID),
		UpdateExpression:         aws.String(expr),
		ExpressionAttributeNames: map[string]string{"#l": "level"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":c": str(chatID),
			":m": num(int64(messageID)),
			":l": num(int64(level)),
		},
	})
	if err != nil {
		return fmt.Errorf("record notification on %s: %w", groupID, err)
	}
	return nil
}

// Ack is the transition FR-3.5 hangs off: it is what stops the escalation.
func (s *Store) Ack(ctx context.Context, groupID, by string, at time.Time) (domain.Group, error) {
	return s.transition(ctx, groupID, domain.StateAcked,
		"SET #s = :next, gsi1pk = :gpk, ackedAt = :at, ackedBy = :by",
		map[string]types.AttributeValue{
			":next": str(domain.StateAcked),
			":gpk":  str("STATE#" + domain.StateAcked),
			":at":   str(at.UTC().Format(time.RFC3339)),
			":by":   str(by),
		})
}

// Resolve closes the incident and releases the fingerprint, so the next
// occurrence of the same problem opens a new group rather than joining a dead one.
func (s *Store) Resolve(ctx context.Context, groupID, by string, at time.Time) (domain.Group, error) {
	g, err := s.transition(ctx, groupID, domain.StateResolved,
		"SET #s = :next, gsi1pk = :gpk, gsi1sk = :at, resolvedAt = :at, resolvedBy = :by",
		map[string]types.AttributeValue{
			":next": str(domain.StateResolved),
			":gpk":  str("STATE#" + domain.StateResolved),
			":at":   str(at.UTC().Format(time.RFC3339)),
			":by":   str(by),
		})
	if err != nil {
		return g, err
	}

	if g.Fingerprint != "" {
		if _, err := s.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
			TableName: aws.String(s.table),
			Key: map[string]types.AttributeValue{
				"pk": str("FP#" + g.Fingerprint),
				"sk": str("OPEN"),
			},
		}); err != nil {
			return g, fmt.Errorf("release fingerprint: %w", err)
		}
	}
	return g, nil
}

// transition applies a state change only from a state the machine allows,
// and reports what actually blocked it when the condition fails (FR-6.3).
func (s *Store) transition(ctx context.Context, groupID, to, expr string,
	values map[string]types.AttributeValue) (domain.Group, error) {

	var allowed []string
	for _, from := range []string{domain.StateFiring, domain.StateAcked, domain.StateResolved} {
		if domain.Transition(from, to) == nil {
			allowed = append(allowed, from)
		}
	}

	cond := "attribute_exists(pk) AND ("
	for i, from := range allowed {
		key := fmt.Sprintf(":from%d", i)
		values[key] = str(from)
		if i > 0 {
			cond += " OR "
		}
		cond += "#s = " + key
	}
	cond += ")"

	out, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                 aws.String(s.table),
		Key:                       groupKey(groupID),
		UpdateExpression:          aws.String(expr),
		ConditionExpression:       aws.String(cond),
		ExpressionAttributeNames:  map[string]string{"#s": "state"},
		ExpressionAttributeValues: values,
		ReturnValues:              types.ReturnValueAllNew,
	})
	if isConditionFailed(err) {
		// Say which of the two it is: a repeat is normal under at-least-once
		// delivery, a backwards move is a bug in the caller.
		current, getErr := s.Get(ctx, groupID)
		if getErr != nil {
			return domain.Group{}, getErr
		}
		return current, domain.Transition(current.State, to)
	}
	if err != nil {
		return domain.Group{}, fmt.Errorf("transition %s to %s: %w", groupID, to, err)
	}
	return decodeMeta(out.Attributes)
}

// Timeline appends one entry. Every state change writes one, so an incident
// review can answer "who did what, when, from where" (FR-6.5).
func (s *Store) Timeline(ctx context.Context, groupID, actor, action, detail string, at time.Time) error {
	ts := at.UTC().Format(time.RFC3339Nano)
	_, err := s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(s.table),
		Item: map[string]types.AttributeValue{
			"pk":     str("AG#" + groupID),
			"sk":     str("LOG#" + ts),
			"actor":  str(actor),
			"action": str(action),
			"detail": str(detail),
			"at":     str(ts),
			"ttl":    num(at.Add(timelineTTL).Unix()),
		},
	})
	if err != nil {
		return fmt.Errorf("append timeline for %s: %w", groupID, err)
	}
	return nil
}

// Entries reads a group's timeline oldest-first.
func (s *Store) Entries(ctx context.Context, groupID string) ([]map[string]string, error) {
	out, err := s.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(s.table),
		KeyConditionExpression: aws.String("pk = :pk AND begins_with(sk, :log)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":  str("AG#" + groupID),
			":log": str("LOG#"),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("query timeline for %s: %w", groupID, err)
	}
	entries := make([]map[string]string, 0, len(out.Items))
	for _, item := range out.Items {
		e := map[string]string{}
		for _, k := range []string{"at", "actor", "action", "detail"} {
			if v, ok := item[k].(*types.AttributeValueMemberS); ok {
				e[k] = v.Value
			}
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *Store) set(ctx context.Context, groupID, expr string, values map[string]types.AttributeValue) error {
	_, err := s.client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                 aws.String(s.table),
		Key:                       groupKey(groupID),
		UpdateExpression:          aws.String(expr),
		ExpressionAttributeValues: values,
	})
	if err != nil {
		return fmt.Errorf("update group %s: %w", groupID, err)
	}
	return nil
}

func (s *Store) pointerTarget(ctx context.Context, pointer string) (string, error) {
	out, err := s.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(s.table),
		Key: map[string]types.AttributeValue{
			"pk": str(pointer),
			"sk": str("OPEN"),
		},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return "", fmt.Errorf("read fingerprint pointer: %w", err)
	}
	v, ok := out.Item["groupId"].(*types.AttributeValueMemberS)
	if !ok {
		return "", fmt.Errorf("fingerprint pointer %s has no group", pointer)
	}
	return v.Value, nil
}

func decodeMeta(item map[string]types.AttributeValue) (domain.Group, error) {
	var m metaItem
	if err := attributevalue.UnmarshalMap(item, &m); err != nil {
		return domain.Group{}, fmt.Errorf("decode group: %w", err)
	}
	return m.toDomain(), nil
}

func groupKey(groupID string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"pk": str("AG#" + groupID),
		"sk": str("META"),
	}
}

func isConditionFailed(err error) bool {
	var cf *types.ConditionalCheckFailedException
	return errors.As(err, &cf)
}

func trimPrefix(s, prefix string) string {
	if len(s) > len(prefix) && s[:len(prefix)] == prefix {
		return s[len(prefix):]
	}
	return s
}

func str(v string) types.AttributeValue { return &types.AttributeValueMemberS{Value: v} }
func num(v int64) types.AttributeValue  { return &types.AttributeValueMemberN{Value: fmt.Sprint(v)} }

// OpenGroupID reports which group currently owns a fingerprint, if any. It is
// how a `resolved` delivery finds the incident it closes (FR-2.5).
func (s *Store) OpenGroupID(ctx context.Context, fingerprint string) (string, bool, error) {
	id, err := s.pointerTarget(ctx, "FP#"+fingerprint)
	if err != nil {
		// No pointer means nothing is open for this problem — a resolved alert
		// for something we never paged about is normal, not an error.
		return "", false, nil
	}
	return id, id != "", nil
}

// Silence stops the escalation the same way an ack does, and records how long
// the responder wanted quiet for.
func (s *Store) Silence(ctx context.Context, groupID, by string, at time.Time, d time.Duration) (domain.Group, error) {
	return s.transition(ctx, groupID, domain.StateAcked,
		"SET #s = :next, gsi1pk = :gpk, ackedAt = :at, ackedBy = :by, silencedUntil = :until",
		map[string]types.AttributeValue{
			":next":  str(domain.StateAcked),
			":gpk":   str("STATE#" + domain.StateAcked),
			":at":    str(at.UTC().Format(time.RFC3339)),
			":by":    str(by),
			":until": str(at.Add(d).UTC().Format(time.RFC3339)),
		})
}
