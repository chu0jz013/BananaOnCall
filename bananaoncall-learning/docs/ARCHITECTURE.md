# Architecture

## Design principles

1. **Domain first** — Alert, Incident, Schedule, EscalationPolicy are plain Go types.
2. **Ports/adapters** — external systems implement small interfaces.
3. **Durability is explicit** — in-process channels are not queues.
4. **Time is a dependency** — schedule logic should be testable with a supplied clock/time.
5. **Incident transitions are validated** — never mutate status arbitrarily.
6. **At-least-once delivery is assumed** — ingestion and notification paths must tolerate duplicates.

## Target architecture

```text
                      ┌──────────────────────────┐
                      │ React Operations UI      │
                      └────────────┬─────────────┘
                                   │ HTTP
                                   ▼
┌───────────────┐        ┌──────────────────────────┐
│ Alertmanager  │───────►│ bananaoncall API         │
├───────────────┤        │ - auth/routing           │
│ Grafana       │───────►│ - alert normalization    │
├───────────────┤        │ - incident commands      │
│ Generic hooks │───────►│ - schedule queries       │
└───────────────┘        └────────────┬─────────────┘
                                     │
                              PostgreSQL
                                     │ outbox / state
                          ┌──────────┴───────────┐
                          ▼                      ▼
                 Temporal Worker         Notification Worker
                          │                      │
                 escalation timers       Telegram / Email / ...
                          │
                          ▼
                   Google Calendar sync

Observability:
API/Workers → OpenTelemetry Collector → Prometheus/Tempo/Loki → Grafana
```

## Why Temporal is a late-phase dependency

An escalation can live for minutes or hours and must survive process restarts. A goroutine plus `time.Sleep` is useful for learning but is not durable. Temporal supplies durable timers, retries, workflow history, and deterministic orchestration. The learning path intentionally makes you implement the naive version first so the benefit is concrete.

## Why Google Calendar is not the source of truth

Calendar events are editable/deletable external objects. The canonical schedule, members, rotations, overrides, and handoff rules belong in bananaoncall's data model. Google Calendar receives a projection of generated shifts and can be reconciled periodically.
