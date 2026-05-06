# R2W4 (Marketing Pages) — Merge Notes

Branch: `feat/marketing-pages`
Worktree: `../classauto-r2-marketing`
Owner: 영업·신뢰 페이지 5종 (use-cases, trust, security, beta-apply, contact)

## What ships in this branch

| Path | Purpose |
|---|---|
| `frontend/src/app/use-cases/page.tsx` | `/use-cases` — anchor case (어흥 교수님) + 5 discipline cards + detail modal + CTA. Per `docs/planning/07-additional-pages.md` §1. |
| `frontend/src/app/trust/page.tsx` | `/trust` — 4 promises matching CLAUDE.md "정체성과 차별점" (RAG 범위 제한 / 비용 투명성 / 부정행위 방지 / 학생 데이터 보호) + 4 data-handling sections + student rights. §2. |
| `frontend/src/app/security/page.tsx` | `/security` — 6 numbered sections + infrastructure table (Vercel/Railway/Supabase/AI vendors/TTS) + downloads + vuln-disclosure contact. §3. |
| `frontend/src/app/beta-apply/page.tsx` | `/beta-apply` — 10-field beta application with mock submit (500 ms → success screen). Soft hint when email is non-school. §4. |
| `frontend/src/app/contact/page.tsx` | `/contact` — 11-field institutional inquiry with mock submit. Numeric validators on professor / student counts. §5. |
| `frontend/src/components/marketing/MarketingShell.tsx` | Dark base + aurora background + locale toggle + footer cross-links. Used by all 5 pages instead of the shared `Header.tsx`. |
| `frontend/src/components/marketing/SectionHeader.tsx` | Eyebrow + title + subtitle + optional badge. |
| `frontend/src/components/marketing/CaseStudyCard.tsx` | Before/After Korean academic case-study card driven entirely by the i18n patch dict. |
| `frontend/src/components/marketing/PrincipleCard.tsx` | 4-up promise card with 4 gradient accents (violet / gold / cyan / pink) — matches `docs/design-system/colors.md` §4.1. |
| `frontend/src/components/marketing/InfoBlock.tsx` | Titled list (✓ bullets) or table-style label/value rows. Used on /trust and /security. |
| `frontend/src/components/marketing/FormField.tsx` | Dark-base input/textarea/select with required marker, `role="alert"` errors, soft hint line. Single shared field for both forms. |
| `frontend/src/components/marketing/validation.ts` | Pure predicates: `isFilled`, `isEmail`, `looksLikeSchoolEmail`, `isNumericOrEmpty`, `isNumericRequired`. |
| `frontend/src/components/marketing/useMarketingI18n.ts` | Local i18n hook reading `_patches/marketing.{ko,en}.json` — same pattern W3 used for demo. |
| `frontend/messages/_patches/marketing.{ko,en}.json` | All new strings (use cases, trust, security, beta-apply, contact). Canonical `messages/ko.json` / `messages/en.json` are untouched. |
| `frontend/__tests__/marketing/*.test.{ts,tsx}` | 17 tests across 6 files: validation predicates + 1–3 page tests per surface (page render + form validation + mock-submit success). Full suite remains 36 files / 155 tests pass. |

## Files NOT modified (intentionally) — patch records

- `frontend/src/components/Header.tsx` — owned by R2W1. No changes.
  Recommended additions documented in `Header.R2W4.patch.md`.
- `frontend/src/contexts/I18nContext.tsx` — owned by R2W1. No changes.
  R2W4 uses the local `useMarketingI18n` hook (same pattern as W3 demo)
  so the marketing pages render today without requiring R2W1 to extend
  `I18nContext`'s deep-merge list.
- `frontend/messages/ko.json`, `frontend/messages/en.json` — untouched.
  All new strings live in `frontend/messages/_patches/marketing.{ko,en}.json`.
- `frontend/middleware.ts` — untouched. The marketing routes are
  fully public and statically prerendered, so the existing middleware
  config (auth-gating /dashboard etc.) handles them correctly.
- `frontend/package.json` — untouched (no new deps; see
  `DEPS_TO_ADD.R2W4.md`).
- `backend/**` — untouched. Form submissions are mocked client-side;
  see `BACKEND_ASKS.R2W4.md` for the two POST endpoints to add later.
- `frontend/src/app/{demo, v, auth, professor, admin}/**` — explicitly
  out of scope.

## Local verification

Run from `frontend/`:

```
npm ci
npx tsc --noEmit          # only pre-existing __tests__/lib/auth.test.ts:82 warning remains (unchanged from main)
npx eslint src/app/use-cases src/app/trust src/app/security \
           src/app/beta-apply src/app/contact \
           src/components/marketing __tests__/marketing
                          # clean
npx vitest run            # 36 files / 155 tests pass (17 are new)
npx next build            # /use-cases /trust /security /beta-apply /contact
                          # all appear in the static route table (○)
```

## Design-system conformance

- **Dark base + gold accent** — every page uses `bg-[#0A0A0A]` with the
  aurora radial-gradient overlay from `colors.md` §4.2 and `#FBBF24`
  (Tailwind `amber-400`) for the gold CTA, matching `colors.md` §3
  (`--gold: #FFB627`). The student-page dark-mode-forced `#0A0A0A` is a
  separate, narrower constraint (학습자 화면 강제 다크) — these are the
  *main site* pages explicitly asked to be dark per the task brief.
- **`prefers-reduced-motion`** — the only animation is the fixed
  aurora background. It's a static gradient with no transform / keyframe,
  so it respects reduced-motion automatically. CTAs use simple
  `transition` (color / opacity), no infinite loops.
- **No localStorage in the new code** — locale toggle uses the existing
  shared `I18nContext` which already manages the preference. The two
  forms persist nothing client-side; in-flight state is React state
  only.
- **Pretendard / Paperlogy** — inherited from the shared layout. We do
  not introduce Geist/other fonts.

## Form behaviour notes

- Both forms surface required-field errors *only after* submit or after
  the field has been blurred. Submit force-marks every required field
  as touched so users always see what's missing on a blocked submit.
- The submit button is **not** disabled when invalid — pressing it is
  the user's primary way to discover what's wrong. It is only disabled
  while the (mock) submit is in flight.
- The mock submit uses `setTimeout(500ms)` so the success screen is not
  jarring. When real endpoints are wired (`BACKEND_ASKS.R2W4.md`),
  swap the `await new Promise(resolve => setTimeout(...))` line with
  the axios call — the surrounding state machine is already correct.
- A clearly-marked "mock notice" banner appears above each form so a
  reviewer knows the submission isn't persisted yet.

## SEO / metadata

Each page exports a Next 16 `Metadata` object with title + description +
opengraph fields. These are statically rendered (the page components
are server components that delegate to a `"use client"` content
component), so crawlers see the metadata even before client hydration.
Title strings are in Korean to match the primary audience (Korean
academia); description strings cover both ko/en search terms.

## Suggested merge order

1. R2W1 (Header / I18nContext / shared dictionary) — independent.
2. R2W2 / R2W3 (in flight in their own branches).
3. **R2W4 (this branch)** — only soft dependencies are:
   - `Header.R2W4.patch.md` notes that the shared Header *could* link
     to the marketing pages once R2W1 adds the public-nav links, but it
     is not blocking.
   - `messages/_patches/marketing.{ko,en}.json` could be deep-merged in
     `I18nContext.tsx` after R2W1 merges; the local
     `useMarketingI18n` hook would then be redundant and removable in a
     follow-up.
4. Future iterations: real backend endpoints (asks #1 / #2 in
   `BACKEND_ASKS.R2W4.md`), captcha for spam control, transactional
   email.
