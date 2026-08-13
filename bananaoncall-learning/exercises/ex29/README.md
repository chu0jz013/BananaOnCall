# ex29: Structured slog

## Goal

Add request/incident structured logging with `log/slog`.

## Work area

This is a **project exercise**. Implement it in `backend/`, `frontend/`, `deploy/`, or `integrations/` rather than in an isolated toy package.

## Acceptance criteria

- [ ] No printf-style operational logs; include request_id, incident_id, service, duration.
- [ ] Add or update automated tests where behavior is deterministic.
- [ ] Write one short note explaining the trade-off you chose.
- [ ] Keep the main branch runnable after the exercise.

## Rule

Do not add a new infrastructure dependency unless you can state which failure mode or requirement it solves.
