# ex27: HTTP alert validation

## Goal

Add strict request validation and return a stable JSON error contract.

## Work area

This is a **project exercise**. Implement it in `backend/`, `frontend/`, `deploy/`, or `integrations/` rather than in an isolated toy package.

## Acceptance criteria

- [ ] `POST /api/v1/alerts` rejects missing fingerprint/service/summary; malformed JSON returns 400; tests cover both.
- [ ] Add or update automated tests where behavior is deterministic.
- [ ] Write one short note explaining the trade-off you chose.
- [ ] Keep the main branch runnable after the exercise.

## Rule

Do not add a new infrastructure dependency unless you can state which failure mode or requirement it solves.
