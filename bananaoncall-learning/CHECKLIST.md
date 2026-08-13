# bananaoncall Learning Checklist

## Phase 0 — Tooling & Go syntax

- [ ] Run `go version`, `go env`, `go test ./...`.
- [ ] Complete ex01: variables/constants for alert severity.
- [ ] Complete ex02: functions and multiple return values.
- [ ] Complete ex03: conditionals for severity routing.
- [ ] Complete ex04: loops over responders.
- [ ] Complete ex05: slices for rotation members.
- [ ] Complete ex06: maps for alert labels.

## Phase 1 — Structs, methods, interfaces, errors

- [ ] Complete ex07: `Alert` struct.
- [ ] Complete ex08: `Incident` state transitions.
- [ ] Complete ex09: pointer receiver mutation.
- [ ] Complete ex10: `Notifier` interface.
- [ ] Complete ex11: wrapped errors with `%w`.
- [ ] Complete ex12: JSON tags and encoding/decoding.

## Phase 2 — Time, scheduling, tests

- [ ] Complete ex13: parse durations and timeouts.
- [ ] Complete ex14: calculate current on-call member.
- [ ] Complete ex15: next handoff time.
- [ ] Complete ex16: table-driven tests.
- [ ] Complete ex17: timezone-aware schedule logic.
- [ ] Complete ex18: schedule override precedence.

## Phase 3 — Concurrency

- [ ] Complete ex19: first goroutine.
- [ ] Complete ex20: channel of notification jobs.
- [ ] Complete ex21: `select` + cancellation.
- [ ] Complete ex22: worker pool.
- [ ] Complete ex23: `sync.WaitGroup` shutdown.
- [ ] Complete ex24: `sync.RWMutex` safe store.
- [ ] Complete ex25: fan-out notifications.
- [ ] Complete ex26: bounded concurrency.

## Phase 4 — HTTP backend

- [ ] Run `backend/cmd/api`.
- [ ] Implement validation for `POST /api/v1/alerts`.
- [ ] Add incident lookup endpoint.
- [ ] Add ACK and resolve endpoints.
- [ ] Implement Grafana webhook normalization.
- [ ] Implement Alertmanager webhook normalization.
- [ ] Add request IDs and structured logs.
- [ ] Add graceful HTTP shutdown.

## Phase 5 — Product core

- [ ] Implement routing rules: service/labels/severity → team.
- [ ] Implement fingerprint-based deduplication.
- [ ] Persist incident event/audit history.
- [ ] Implement primary + secondary rotations.
- [ ] Implement overrides/swaps.
- [ ] Implement escalation policy steps.
- [ ] Stop escalation after ACK.
- [ ] Design idempotent notification attempts.

## Phase 6 — Frontend

- [ ] Run React/Vite/Tailwind UI.
- [ ] Wire incident list to backend API.
- [ ] Build incident details/event timeline.
- [ ] Build ACK/resolve actions.
- [ ] Build teams and schedules page.
- [ ] Build escalation policy editor.
- [ ] Build integration health page.

## Phase 7 — Persistence & durable jobs

- [ ] Add PostgreSQL schema/migrations.
- [ ] Replace in-memory incident store with PostgreSQL repository.
- [ ] Use transactions for incident + event writes.
- [ ] Implement DB-backed notification outbox.
- [ ] Implement retry/backoff and dead-letter state.
- [ ] Add Temporal server locally.
- [ ] Move escalation execution to Temporal workflow.
- [ ] Move long-lived schedule/reminder logic to Temporal timers.

## Phase 8 — Integrations

- [ ] Complete Telegram Bot notifier.
- [ ] Add interactive ACK/resolve callback flow.
- [ ] Google Calendar OAuth/service-account decision documented.
- [ ] Sync generated on-call shifts to Google Calendar.
- [ ] Ingest Prometheus Alertmanager webhooks.
- [ ] Ingest Grafana Alerting webhooks.
- [ ] Add generic webhook HMAC verification.
- [ ] Add optional Slack/Discord/Matrix adapter.
- [ ] Add Sentry-compatible webhook adapter (optional).

## Phase 9 — Observability & platform

- [ ] Expose Prometheus metrics.
- [ ] Create Grafana dashboard.
- [ ] Add OpenTelemetry tracing.
- [ ] Export traces to Tempo or Jaeger.
- [ ] Export logs to Loki/OTel collector.
- [ ] Create Docker images.
- [ ] Run local Compose stack.
- [ ] Deploy to Kubernetes.
- [ ] Add readiness/liveness probes.
- [ ] Add ServiceMonitor/PodMonitor when Prometheus Operator is present.
- [ ] Package with Helm.
- [ ] Add HPA/PDB/NetworkPolicy exercises.

## Phase 10 — Production-grade extensions

- [ ] Add Keycloak/OIDC authentication.
- [ ] Add RBAC: viewer/responder/admin.
- [ ] Add API keys for integrations.
- [ ] Add rate limiting.
- [ ] Add tenant/workspace boundary (optional).
- [ ] Add HA leader-election or remove singleton assumptions.
- [ ] Chaos-test worker restarts during escalation.
- [ ] Load-test ingestion and notification fan-out.
- [ ] Write SLOs for bananaoncall itself.
- [ ] Write incident runbook and disaster-recovery notes.

## Exercise index

- [ ] `ex27` — HTTP alert validation
- [ ] `ex28` — Request IDs
- [ ] `ex29` — Structured slog
- [ ] `ex30` — Graceful shutdown
- [ ] `ex31` — Grafana normalizer
- [ ] `ex32` — Alertmanager normalizer
- [ ] `ex33` — Dedup race test
- [ ] `ex34` — Routing rules
- [ ] `ex35` — Incident event timeline
- [ ] `ex36` — Primary + secondary rotation
- [ ] `ex37` — Schedule overrides
- [ ] `ex38` — Escalation policy model
- [ ] `ex39` — Naive escalation runner
- [ ] `ex40` — Cancel escalation on ACK
- [ ] `ex41` — Retry with backoff
- [ ] `ex42` — Transactional outbox design
- [ ] `ex43` — PostgreSQL repository
- [ ] `ex44` — Transactions
- [ ] `ex45` — Migrations
- [ ] `ex46` — Telegram notifier
- [ ] `ex47` — Telegram ACK callback
- [ ] `ex48` — Google Calendar projection
- [ ] `ex49` — Calendar reconciliation
- [ ] `ex50` — Temporal escalation workflow
- [ ] `ex51` — Temporal signals
- [ ] `ex52` — Prometheus client metrics
- [ ] `ex53` — Grafana dashboard
- [ ] `ex54` — OpenTelemetry
- [ ] `ex55` — React incident details
- [ ] `ex56` — React schedules
- [ ] `ex57` — Docker production image
- [ ] `ex58` — Kubernetes deployment
- [ ] `ex59` — Helm + GitOps
- [ ] `ex60` — Load, chaos and SLO
