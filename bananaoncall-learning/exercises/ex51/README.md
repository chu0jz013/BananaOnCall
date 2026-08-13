# ex51: Temporal signals

## Goal

Signal ACK/resolve into the workflow.

## Work area

This is a **project exercise**. Implement it in `backend/`, `frontend/`, `deploy/`, or `integrations/` rather than in an isolated toy package.

## Acceptance criteria

- [ ] Workflow stops escalation immediately on ACK/resolve signal; time-skipping test passes.
- [ ] Add or update automated tests where behavior is deterministic.
- [ ] Write one short note explaining the trade-off you chose.
- [ ] Keep the main branch runnable after the exercise.

## Rule

Do not add a new infrastructure dependency unless you can state which failure mode or requirement it solves.
