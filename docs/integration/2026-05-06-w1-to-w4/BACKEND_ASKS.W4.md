# W4 (Student Flow) — Backend Asks

The student entry flow ships against existing backend APIs. The asks below
are nice-to-have follow-ups that would let `/v/[slug]` and `/auth/signup`
deliver the full UX from `docs/planning/06-student-pages.md`. None block
this branch from merging.

## 1. Expose professor display name on the public lecture endpoint
- **Endpoint:** `GET /api/lectures/{slug}/public`
- **Schema:** `LecturePublicResponse`
- **Add:** `professor_name: str | None` (and ideally `course_name: str | None`).

`docs/planning/06-student-pages.md` §3.2 calls out that the trust line on
`/v/[slug]` should read "○○○ 교수님이 보낸 강의입니다". Right now the
public endpoint returns only the lecture itself, so the W4 frontend falls
back to a generic "교수님이 공유한 강의입니다" line whenever the data is
not available. `LectureMeta` already accepts `professorName` and
`courseName` — the moment the API returns them, no frontend change is
required to start using them.

## 2. Lecture duration on the public response
- **Add:** `duration_sec: int | null` to `LecturePublicResponse`.

The hero block already renders `5:12`-style duration when given
`durationSec`. Today it stays hidden because the API does not include
this field. The `Video` model already has the data; surfacing it on the
public response would be a one-line addition to
`get_public_lecture_by_slug`.

## 3. Optional: pre-OAuth signup hints
- The signup form (`/auth/signup`) collects `name`, `locale`, and an
  optional `student_number` *before* Google OAuth. Today these are
  stashed in `sessionStorage` as `ifl_student_signup_hint` and the
  existing `/auth/complete-profile` page does not consume them.
- **Ask:** either accept these on `POST /api/auth/complete-profile`
  alongside `student_number`, or pass them through Google OAuth `state`
  so the post-OAuth redirect can prefill the complete-profile form.

This is purely a UX improvement; without it, students re-enter the same
data on `/auth/complete-profile`.

## 4. Optional: 학습 코드 (learning code) flow
- The planning doc §3.3 describes a "학습 코드" (4-4 code) shortcut for
  guests who don't have a school email. There is no backend endpoint for
  this yet. The current `EntryCTA` only exposes Google OAuth and the
  signup link.
- **Ask:** add `POST /api/v1/lectures/{slug}/redeem-code` (or similar)
  returning a short-lived guest token, then we can render a second CTA
  in `EntryCTA` for code-based entry.

## 5. Sanity: 404 vs 401 semantics on the public endpoint
- The frontend treats only HTTP 404 as "lecture not found"; any other
  error in dev falls back to a mock and in prod renders the not-found
  screen. If `is_published=false` lectures should also produce 404 (they
  already do per `get_public_lecture_by_slug`), no action is needed.

---

Owner: W4 (student-flow worktree).
Tracking: `feat/student-flow` branch.
