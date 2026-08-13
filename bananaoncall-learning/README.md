# bananaoncall 🍌📟

A learn-by-building curriculum for Go, centered on a deployable mini PagerDuty / Grafana OnCall-style system.

**Primary goal:** learn idiomatic Go from syntax → concurrency → backend design → durable workflows → Kubernetes/observability integrations.

**Secondary goal:** finish with a portfolio-grade product that can ingest alerts, deduplicate incidents, calculate on-call rotations, escalate, notify responders, expose a React status/operations UI, and run in containers/Kubernetes.

## Final product scope

```text
Prometheus / Alertmanager / Grafana / Generic Webhooks
                         │
                         ▼
                  Alert Ingestion
                         │
                Normalize + Dedup
                         │
                         ▼
                     Incident
                         │
         ┌───────────────┼─────────────────┐
         ▼               ▼                 ▼
      Routing        Escalation        Audit/Event Log
         │               │
         ▼               ▼
      Team/Service   On-call Schedule
                         │
             ┌───────────┼──────────────┐
             ▼           ▼              ▼
          Telegram      Email      Future adapters
                         │
                         ▼
                 ACK / Resolve

Source of truth: PostgreSQL (later phase)
Projection/integration: Google Calendar
Durable workflows: Temporal (later phase)
Observability: Prometheus + Grafana + OpenTelemetry
Runtime: Docker → Kubernetes → Helm
Frontend: React + Vite + TypeScript + TailwindCSS
```

## Repository map

- `CHECKLIST.md` — the learning path. Work top-to-bottom.
- `exercises/` — 60 exercises: ex01–26 isolated Go drills, ex27–60 project exercises.
- `solutions/` — reference answers for isolated exercises.
- `backend/` — a runnable stdlib-first bananaoncall backend skeleton.
- `frontend/` — React/Vite/Tailwind/TypeScript operations UI.
- `deploy/` — Docker Compose, Prometheus, Alertmanager, Grafana notes, Kubernetes, Helm.
- `integrations/` — design notes and tasks for Grafana, Alertmanager, Telegram, Google Calendar, Temporal, OTel, Loki, Kubernetes, etc.
- `docs/` — architecture, API contract, milestones, and product decisions.

## Recommended workflow

1. Do Phase 0–3 exercises without opening `solutions/`.
2. Start the backend and frontend.
3. Complete Phase 4–6 by replacing TODOs / in-memory components.
4. Add durable infrastructure in Phase 7–9.
5. Deploy to Kubernetes and instrument it.

## Run the backend

```bash
cd backend
go test ./...
go run ./cmd/api
```

Then:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/v1/incidents
```

Create an alert:

```bash
curl -X POST http://localhost:8080/api/v1/alerts \
  -H 'content-type: application/json' \
  -d '{
    "source":"demo",
    "fingerprint":"payment-api-high-error-rate",
    "service":"payment-api",
    "severity":"critical",
    "summary":"HTTP 5xx > 10%"
  }'
```

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

By default the frontend expects the backend at `http://localhost:8080`.

## Guardrails

- Start simple: standard library + in-memory storage.
- Do not add Kafka, Redis, Temporal, or Kubernetes before the core state machine is correct.
- Every background operation must accept `context.Context`.
- Every external notification must be retryable and idempotent.
- Treat channels as in-process coordination, **not** durable queues.
- Google Calendar is a projection/integration, not the source of truth for schedules.
- Prefer explicit interfaces at domain boundaries; do not interface-ify every struct.

## Definition of done

A strong final version should support:

- Alertmanager/Grafana/generic webhook ingestion
- Alert normalization and fingerprint-based deduplication
- Incident state machine: triggered → acknowledged → resolved
- Team/service routing rules
- Primary/secondary on-call rotation + overrides
- Escalation policies
- Telegram notifications and actions
- Google Calendar sync
- Durable Temporal workflows
- PostgreSQL persistence
- Prometheus metrics + Grafana dashboard
- OpenTelemetry traces
- React operations UI
- Docker Compose local environment
- Kubernetes/Helm deployment
- CI tests/builds

The repository intentionally does **not** pretend all external integrations are production-complete on day one. They are staged exercises so you learn why each component exists.
