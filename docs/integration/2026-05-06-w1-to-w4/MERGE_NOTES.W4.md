# W4 (Student Flow) — Merge Notes

Branch: `feat/student-flow`
Worktree: `../classauto-w4-student`
Owner: 学生 진입 흐름 (student entry, signup, onboarding)

## What ships in this branch

| Path | Purpose |
|---|---|
| `frontend/src/app/v/[slug]/page.tsx` + `StudentEntryContent.tsx` | New student entry route (per `docs/planning/06-student-pages.md` §3). Fetches `/api/lectures/{slug}/public`, redirects expired lectures to `/expired`, renders entry CTA for guests and the lecture body for logged-in students. Mock-data fallback when API is unreachable in development. |
| `frontend/src/app/auth/signup/page.tsx` + `SignupContent.tsx` | New student-only sign-up surface. Validates name + optional student-number format client-side, applies the picked locale, stashes a sign-up hint in `sessionStorage`, then hands off to the existing Google OAuth flow with `role=student`. |
| `frontend/src/components/student/LectureMeta.tsx` | Hero meta block (title, description, professor trust line, duration). |
| `frontend/src/components/student/EntryCTA.tsx` | Primary "Google sign-in" + secondary "Sign up as student" buttons. |
| `frontend/src/components/student/LectureBody.tsx` | Logged-in student view: video preview + deep link to the existing `/lecture/[slug]` player (we did **not** duplicate the heavy QA / attention stack). |
| `frontend/src/components/student/OnboardingModal.tsx` | First-visit name + language modal. Persists `ifl_student_onboarded=true` in `localStorage`; skip is allowed. SSR-safe (mounted gate). |
| `frontend/messages/_patches/student.{ko,en}.json` | All new strings. The canonical `messages/ko.json` / `messages/en.json` are untouched. |
| `frontend/__tests__/student/*.test.tsx` | 13 unit tests across 4 files (EntryCTA, LectureMeta, OnboardingModal, SignupContent). Full suite: 26 files / 120 tests pass. |

## Files modified outside the W4 sandbox

- `frontend/src/contexts/I18nContext.tsx`
  - Added module-level deep-merge of the new `_patches/*.{ko,en}.json`
    files into the canonical `messages/*.json` namespaces. This is
    additive: the patch only adds new top-level keys (`student.*`); it
    cannot overwrite existing keys, and the merge is order-independent
    so multiple worktrees can land their own patch namespaces without
    conflict.
  - **Why this file:** the user-task constraint forbids editing
    `messages/ko.json` / `messages/en.json` directly and routes new
    strings through `_patches/`. Loading the patches has to happen
    somewhere; `I18nContext` is the natural single owner. If W3 also
    modifies this file, resolve by keeping both `mergePatch` calls /
    both patch imports.

## Files NOT modified (intentionally) — patch records

- `frontend/middleware.ts` — no changes were needed. `/v/[slug]` is a
  client-rendered page that handles its own auth-gating; `/auth/signup`
  is a public route on the same level as `/auth/login`. If a future
  iteration wants `/v/[slug]` to redirect unauthenticated users at the
  edge, that change should live in a separate `middleware.W4.patch.md`
  (not authored — no patch needed today).
- `frontend/components/Header.tsx` — no changes. The student entry page
  is a dark-mode standalone surface and doesn't render the shared
  Header. The Header continues to differentiate professor vs student
  via `user?.role`, which is unchanged. No `Header.W4.patch.md` needed.
- `frontend/messages/ko.json`, `frontend/messages/en.json` — untouched
  per the task constraint. All new strings live in
  `frontend/messages/_patches/student.{ko,en}.json`.
- `frontend/package.json` — untouched (no new deps; see
  `DEPS_TO_ADD.W4.md`).
- `backend/**` — untouched. Any backend gaps are recorded in
  `BACKEND_ASKS.W4.md` (none of them block this branch).
- `frontend/app/lecture/[slug]/**` — untouched. The student-side route
  is `/v/[slug]`; `/lecture/[slug]` remains the existing professor /
  legacy viewer.
- `frontend/app/demo/**`, `frontend/components/demo/**` — explicitly
  not touched (W3 territory).
- `frontend/app/professor/**`, `frontend/app/admin/**` — out of scope.

## Local verification

Run from `frontend/`:

```
npm ci
npx tsc --noEmit          # only pre-existing __tests__/lib/auth.test.ts:82 warning remains
npx eslint src/app/v src/app/auth/signup src/components/student \
           src/contexts/I18nContext.tsx __tests__/student   # clean
npx vitest run            # 26 files / 120 tests pass
npx next build            # /v/[slug] and /auth/signup show up in the route table
```

## Known caveats / follow-ups

1. **localStorage usage.** `OnboardingModal` writes
   `ifl_student_onboarded=true`. The user task explicitly required
   localStorage; the global "no-localStorage" rule in `CLAUDE.md`
   targets artifact preview environments. The implementation is
   guarded with try/catch and a mount gate so non-storage environments
   degrade gracefully (modal simply does not appear).
2. **Mock fallback.** `/v/[slug]` falls back to a deterministic mock
   lecture only in `process.env.NODE_ENV !== "production"`. Production
   builds always render the not-found screen on API failure to avoid
   masking outages.
3. **Reused viewer.** `LectureBody` deep-links into the existing
   `/lecture/[slug]` for the full Q&A / attention experience instead
   of duplicating that surface. When the planning doc's full
   "side-panel + interstitial quiz" experience is implemented, it
   should be wired into the existing `/lecture/[slug]` viewer or a
   dedicated `/v/[slug]/play` sub-route — not into this entry page.
4. **No professor display name on the API yet.** `LectureMeta` falls
   back to the anonymous trust line. See ask #1 in
   `BACKEND_ASKS.W4.md`.

## Suggested merge order

1. Land W3 (demo) first — it does not touch `I18nContext` or `_patches/`.
2. Land W4 (this branch) — only conflict surface is `I18nContext.tsx`
   (additive merge import + `mergePatch` call).
3. Future student-flow iterations (full player, profile page, learning
   code redeem) build on top of the components in
   `frontend/src/components/student/`.
