# W4 (Student Flow) — Dependencies to Add

This worktree (`feat/student-flow`) ships the student entry flow without
introducing any new runtime or dev dependencies.

## Frontend
- **No new packages.** Existing `axios`, `next` (16.2.1), `react` (19.2.4),
  and the shared test stack (`vitest`, `@testing-library/react`) cover
  everything in this branch.

## Backend
- **No new packages.** The student flow consumes only existing endpoints
  (`GET /api/lectures/{slug}/public`, the existing Google OAuth chain). See
  `BACKEND_ASKS.W4.md` for nice-to-have additions that are *not* required
  to land this branch.

## Verified versions used
- node + npm: bundled with the worktree (no engines bump).
- TypeScript strict mode: passes with `next 16.2.1` and `react-hooks` rules
  including the new `react-hooks/set-state-in-effect`.

If a future iteration needs a school-domain validator (e.g. `psl` for
public-suffix matching of `.ac.kr` / `.edu`), open a follow-up PR — it is
explicitly out of scope here so the W4 diff stays small.
