// Command seed fills the table with plausible SLA rollups and incident history.
//
// It exists because the status board reads real DynamoDB items through real
// access patterns, but the processor that would write them is not built yet
// (session S2). Seeded rows have exactly the shape the processor will produce,
// so nothing about the read path is faked — only the source of the rows.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand/v2"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/chu0jz013/BananaOnCall/internal/domain"
)

func main() {
	table := flag.String("table", os.Getenv("TABLE_NAME"), "DynamoDB table name")
	clean := flag.Bool("clean", false, "seed with nothing currently firing")
	wait := flag.Int("wait", 20, "seconds each escalation step waits for an ack")
	seed := flag.Uint64("seed", 20260823, "PRNG seed, so runs are reproducible")
	flag.Parse()

	if *table == "" {
		log.Fatal("pass -table or set TABLE_NAME")
	}

	ctx := context.Background()
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatal(err)
	}
	db := dynamodb.NewFromConfig(cfg)

	rng := rand.New(rand.NewPCG(*seed, 0))
	now := time.Now().UTC()

	rollups := seedRollups(ctx, db, *table, now, rng)
	incidents := seedIncidents(ctx, db, *table, now, rng, *clean)
	steps := seedPolicy(ctx, db, *table, *wait)
	people := seedContacts(ctx, db, *table)

	fmt.Printf("seeded %d rollup days, %d incidents, %d escalation steps and %d contacts into %s\n",
		rollups, incidents, steps, people, *table)
}

// seedRollups writes one item per SLI per day across the published window.
func seedRollups(ctx context.Context, db *dynamodb.Client, table string, now time.Time, rng *rand.Rand) int {
	// A single bad afternoon inside the window, so the error budget shows real
	// consumption instead of a flat 100% that proves nothing.
	badDay := now.AddDate(0, 0, -9).Format(time.DateOnly)

	count := 0
	for _, def := range domain.SLIDefinitions {
		for d := domain.SLIWindowDays; d >= 0; d-- {
			day := now.AddDate(0, 0, -d)
			date := day.Format(time.DateOnly)

			total := int64(4000 + rng.IntN(2500))
			// Aim a little above target on a normal day.
			failRate := (100 - def.Target) / 100 * 0.35
			if date == badDay {
				failRate = (100 - def.Target) / 100 * 9
			}
			bad := int64(float64(total) * failRate)
			good := total - bad

			put(ctx, db, table, map[string]types.AttributeValue{
				"pk":    s("SLO#" + def.Key),
				"sk":    s("DAY#" + date),
				"good":  n(good),
				"total": n(total),
				"ttl":   n(day.AddDate(1, 0, 0).Unix()),
			})
			count++
		}
	}
	return count
}

type incidentSpec struct {
	title    string
	service  string
	severity string
	ackAfter time.Duration
	resolve  time.Duration
}

var incidentCatalogue = []incidentSpec{
	{"HighErrorRate", "checkout", "critical", 94 * time.Second, 18 * time.Minute},
	{"DiskPressure", "node-3", "warning", 6 * time.Minute, 51 * time.Minute},
	{"CertificateExpiringSoon", "ingress", "warning", 22 * time.Minute, 2 * time.Hour},
	{"KafkaConsumerLag", "events", "critical", 71 * time.Second, 26 * time.Minute},
	{"PodCrashLooping", "payments", "critical", 2 * time.Minute, 34 * time.Minute},
	{"SlowQueries", "postgres", "warning", 14 * time.Minute, 1 * time.Hour},
	{"MemoryPressure", "search", "warning", 8 * time.Minute, 43 * time.Minute},
	{"TLSHandshakeFailures", "gateway", "critical", 55 * time.Second, 12 * time.Minute},
	{"ReplicationLag", "postgres", "critical", 3 * time.Minute, 47 * time.Minute},
	{"QueueBacklog", "notifications", "warning", 11 * time.Minute, 39 * time.Minute},
}

// seedIncidents writes resolved history plus, unless -clean, one still-open
// incident so the board's active section is exercised too.
func seedIncidents(ctx context.Context, db *dynamodb.Client, table string, now time.Time, rng *rand.Rand, clean bool) int {
	count := 0

	for i, spec := range incidentCatalogue {
		started := now.Add(-time.Duration(i*19+7) * time.Hour).Add(-time.Duration(rng.IntN(90)) * time.Minute)
		acked := started.Add(spec.ackAfter)
		resolved := started.Add(spec.resolve)

		putIncident(ctx, db, table, incident{
			id:         fmt.Sprintf("%d%02d", started.Unix(), i),
			title:      spec.title,
			service:    spec.service,
			severity:   spec.severity,
			state:      "resolved",
			started:    started,
			acked:      &acked,
			resolved:   &resolved,
			alertCount: 1 + rng.IntN(12),
		})
		count++
	}

	if !clean {
		started := now.Add(-37 * time.Minute)
		acked := started.Add(3 * time.Minute)
		putIncident(ctx, db, table, incident{
			id:         fmt.Sprintf("%dopen", started.Unix()),
			title:      "ElevatedLatency",
			service:    "checkout",
			severity:   "warning",
			state:      "acked",
			started:    started,
			acked:      &acked,
			alertCount: 4,
		})
		count++
	}

	return count
}

type incident struct {
	id         string
	title      string
	service    string
	severity   string
	state      string
	started    time.Time
	acked      *time.Time
	resolved   *time.Time
	alertCount int
}

func putIncident(ctx context.Context, db *dynamodb.Client, table string, in incident) {
	// gsi1sk is the timestamp the board sorts on: when it closed if it closed,
	// otherwise when it began.
	sortAt := in.started
	if in.resolved != nil {
		sortAt = *in.resolved
	}

	item := map[string]types.AttributeValue{
		"pk":         s("AG#" + in.id),
		"sk":         s("META"),
		"gsi1pk":     s("STATE#" + in.state),
		"gsi1sk":     s(sortAt.Format(time.RFC3339)),
		"title":      s(in.title),
		"service":    s(in.service),
		"severity":   s(in.severity),
		"state":      s(in.state),
		"startedAt":  s(in.started.Format(time.RFC3339)),
		"alertCount": n(int64(in.alertCount)),
		"ttl":        n(in.started.AddDate(0, 0, 90).Unix()), // 90-day TTL, §07
	}
	if in.acked != nil {
		item["ackedAt"] = s(in.acked.Format(time.RFC3339))
	}
	if in.resolved != nil {
		item["resolvedAt"] = s(in.resolved.Format(time.RFC3339))
	}

	put(ctx, db, table, item)
}

func put(ctx context.Context, db *dynamodb.Client, table string, item map[string]types.AttributeValue) {
	if _, err := db.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(table),
		Item:      item,
	}); err != nil {
		log.Fatalf("put item: %v", err)
	}
}

func s(v string) types.AttributeValue { return &types.AttributeValueMemberS{Value: v} }
func n(v int64) types.AttributeValue {
	return &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", v)}
}

// seedPolicy writes the one escalation chain the MVP routes everything to.
//
// Locally the waits are seconds rather than the doc's five minutes, so the
// whole ladder is watchable inside one `make e2e` run. The shape is the real
// one — primary, then a named second responder, then the war room, which then
// repeats (FR-3.2, FR-3.6).
func seedPolicy(ctx context.Context, db *dynamodb.Client, table string, wait int) int {
	steps := []struct {
		order int
		kind  domain.TargetKind
		ref   string
		wait  int
	}{
		{1, domain.TargetOnCall, "", wait},
		{2, domain.TargetUser, "linh", wait},
		{3, domain.TargetGroupChat, warRoomChatID, wait + 10},
	}

	for _, st := range steps {
		put(ctx, db, table, map[string]types.AttributeValue{
			// Zero-padded so a Query returns the steps in order.
			"pk":          s("EP#" + domain.DefaultPolicyID),
			"sk":          s(fmt.Sprintf("STEP#%02d", st.order)),
			"kind":        s(string(st.kind)),
			"ref":         s(st.ref),
			"waitSeconds": n(int64(st.wait)),
		})
	}
	return len(steps)
}

// warRoomChatID stands in for a Telegram group chat; negative ids are how
// Telegram distinguishes groups from people.
const warRoomChatID = "-1002000001"

// seedContacts links the calendar's names to chat ids. FR-5.2 will replace this
// with a /link command; until then the mapping is seeded.
func seedContacts(ctx context.Context, db *dynamodb.Client, table string) int {
	people := []struct{ user, chat string }{
		{"mai", "100001"},
		{"linh", "100002"},
		// The fallback FR-4.6 pages when the rota is empty. It must exist, or
		// the failure mode it guards against just moves one step later.
		{domain.FallbackUserID, "100000"},
	}

	for _, p := range people {
		put(ctx, db, table, map[string]types.AttributeValue{
			"pk":       s("USER#" + p.user),
			"sk":       s("CONTACT#" + domain.ChannelTelegram),
			"gsi1pk":   s("CHAT#" + p.chat),
			"gsi1sk":   s("USER#" + p.user),
			"chatId":   s(p.chat),
			"username": s(p.user),
		})
	}
	return len(people)
}
