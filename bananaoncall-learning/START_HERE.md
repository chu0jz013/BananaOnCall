# Start here

## Day 1

```bash
cd exercises/ex01
# edit starter.go

go test ./...
```

Work through `ex01` → `ex26`. These are intentionally small and syntax/concurrency-focused.

## Then run the product

```bash
cd backend
go test ./...
go run ./cmd/api
```

In another terminal:

```bash
curl -X POST http://localhost:8080/api/v1/alerts \
  -H 'content-type: application/json' \
  -d '{"source":"demo","fingerprint":"demo-1","service":"api","severity":"critical","summary":"demo incident"}'
```

Then start `frontend/` and continue `ex27` → `ex60`, evolving the actual system.

## Suggested pacing

- ex01–12: syntax/core Go
- ex13–18: time + tests
- ex19–26: concurrency
- ex27–40: backend/product core
- ex41–51: reliability + integrations + Temporal
- ex52–60: observability + frontend + platform/production

`CHECKLIST.md` is the master progress tracker. `solutions/` is deliberately separate: resist opening it too early. 🍌
