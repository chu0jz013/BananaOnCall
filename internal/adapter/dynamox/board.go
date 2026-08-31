// Package dynamox adapts the single DynamoDB table to the read ports the
// status board needs. Every call here is a Query on a key — nothing scans.
package dynamox

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

// BoardReader reads SLA rollups and alert groups.
type BoardReader struct {
	client *dynamodb.Client
	table  string
}

func NewBoardReader(client *dynamodb.Client, table string) *BoardReader {
	return &BoardReader{client: client, table: table}
}

// rollupItem is the stored shape of `SLO#<sli> / DAY#<date>`.
type rollupItem struct {
	PK    string `dynamodbav:"pk"`
	SK    string `dynamodbav:"sk"`
	Good  int64  `dynamodbav:"good"`
	Total int64  `dynamodbav:"total"`
}

// groupItem is the stored shape of `AG#<id> / META`.
type groupItem struct {
	PK         string `dynamodbav:"pk"`
	Title      string `dynamodbav:"title"`
	Severity   string `dynamodbav:"severity"`
	Service    string `dynamodbav:"service"`
	State      string `dynamodbav:"state"`
	StartedAt  string `dynamodbav:"startedAt"`
	AckedAt    string `dynamodbav:"ackedAt"`
	ResolvedAt string `dynamodbav:"resolvedAt"`
	AlertCount int    `dynamodbav:"alertCount"`
}

// DailyCounts returns one SLI's window, inclusive of both bounds.
func (r *BoardReader) DailyCounts(ctx context.Context, sli string, from, to time.Time) ([]domain.DailyCount, error) {
	out, err := r.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(r.table),
		KeyConditionExpression: aws.String("pk = :pk AND sk BETWEEN :from AND :to"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":   &types.AttributeValueMemberS{Value: "SLO#" + sli},
			":from": &types.AttributeValueMemberS{Value: "DAY#" + from.Format(time.DateOnly)},
			":to":   &types.AttributeValueMemberS{Value: "DAY#" + to.Format(time.DateOnly)},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("query rollups for %s: %w", sli, err)
	}

	var rows []rollupItem
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &rows); err != nil {
		return nil, fmt.Errorf("decode rollups for %s: %w", sli, err)
	}

	days := make([]domain.DailyCount, 0, len(rows))
	for _, row := range rows {
		days = append(days, domain.DailyCount{
			Date:  row.SK[len("DAY#"):],
			Good:  row.Good,
			Total: row.Total,
		})
	}
	return days, nil
}

// IncidentsByState queries GSI1, newest first. GSI1 is what makes this a Query
// rather than a table scan (design doc §07).
func (r *BoardReader) IncidentsByState(ctx context.Context, state string, limit int32) ([]domain.Incident, error) {
	out, err := r.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(r.table),
		IndexName:              aws.String("GSI1"),
		KeyConditionExpression: aws.String("gsi1pk = :state"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":state": &types.AttributeValueMemberS{Value: "STATE#" + state},
		},
		ScanIndexForward: aws.Bool(false),
		Limit:            aws.Int32(limit),
	})
	if err != nil {
		return nil, fmt.Errorf("query %s incidents: %w", state, err)
	}

	var rows []groupItem
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &rows); err != nil {
		return nil, fmt.Errorf("decode %s incidents: %w", state, err)
	}

	incidents := make([]domain.Incident, 0, len(rows))
	for _, row := range rows {
		incidents = append(incidents, domain.Incident{
			ID:         row.PK[len("AG#"):],
			Title:      row.Title,
			Severity:   row.Severity,
			Service:    row.Service,
			State:      row.State,
			StartedAt:  parseTime(row.StartedAt),
			AckedAt:    parseOptionalTime(row.AckedAt),
			ResolvedAt: parseOptionalTime(row.ResolvedAt),
			AlertCount: row.AlertCount,
		})
	}
	return incidents, nil
}

func parseTime(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}

func parseOptionalTime(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil
	}
	return &t
}
