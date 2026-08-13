# ex31: Grafana normalizer

## Goal

Separate Grafana payload parsing from incident creation.

## Work area

This is a **project exercise**. Implement it in `backend/`, `frontend/`, `deploy/`, or `integrations/` rather than in an isolated toy package.

## Acceptance criteria

- [ ] A pure normalizer converts fixtures to domain.Alert and is table-tested.
- [ ] Add or update automated tests where behavior is deterministic.
- [ ] Write one short note explaining the trade-off you chose.
- [ ] Keep the main branch runnable after the exercise.

## Rule

Do not add a new infrastructure dependency unless you can state which failure mode or requirement it solves.
