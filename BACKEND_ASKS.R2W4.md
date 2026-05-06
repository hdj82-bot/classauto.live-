# R2W4 (Marketing Pages) — Backend Asks

The five marketing pages do not require backend changes to render. Two
forms (`/beta-apply`, `/contact`) currently use a mock submit (500 ms
delay → success screen) so the UX is complete client-side. The asks
below would let those forms persist real submissions; none block this
branch from merging.

## 1. POST /api/marketing/beta-apply
- **Body:**
  ```json
  {
    "name": "string",
    "school": "string",
    "department": "string",
    "professor_title": "string",
    "email": "string (RFC 5322)",
    "subject": "string",
    "student_count": "string | null",
    "start_timing": "now | nextSemester | undecided",
    "channel": "referral | conference | search | other",
    "message": "string | null",
    "locale": "ko | en"
  }
  ```
- **Response:** `201 { id: uuid }`. Errors: `422` for validation,
  `429` for rate limiting (single email cap of e.g. 3/day).
- **Side effects:**
  - Insert a `beta_application` row.
  - Send an immediate confirmation email to `email`.
  - Notify ops (Slack webhook or `beta@classauto.live`).
- **Acceptance:** rate-limit by IP+email, optional reCAPTCHA / hCaptcha
  (see ask #4). The frontend already collects what's needed — see
  `BetaApplyContent.tsx`.

## 2. POST /api/marketing/contact
- **Body:** mirrors `/contact` form fields, including `stage`,
  `professor_count` (numeric), `student_count` (numeric), `lms`,
  `phone`, `call_time`, free-form `message`.
- **Response:** `201 { id: uuid }`. Errors: `422`, `429`.
- **Side effects:** insert row, send to `contact@classauto.live`,
  optionally CRM sync (Hubspot/Pipedrive — out of scope).
- **Note:** This form is for institutional inquiries, so we don't
  require a school-domain email; allow any RFC-5322 address.

## 3. (Optional) GET /api/marketing/use-cases
- The five use-case cards are currently driven entirely from
  `messages/_patches/marketing.{ko,en}.json`. If we later want
  marketing to edit copy without a deploy, expose a simple endpoint
  returning the same shape. Until then, the i18n patch is the single
  source of truth.

## 4. (Recommended) Anti-spam token endpoint
- Beta and contact forms are public and unauthenticated, so they need
  spam protection before going live. The simplest path is hCaptcha or
  Turnstile:
  - `GET /api/marketing/captcha-config` → `{ siteKey, provider }`
  - Tokens validated server-side on the two POST handlers above.
- If we go this route, the frontend exposes `NEXT_PUBLIC_CAPTCHA_SITE_KEY`
  and the form components add a `<Captcha />` block above the submit
  button.

## 5. Email deliverability infrastructure
- The success copy promises a confirmation email. If we don't have
  transactional email yet (Resend, Postmark, SES, …), the success
  screen is misleading. Either wire transactional email when implementing
  asks #1 / #2, or soften the success copy to "We received your
  application" without mentioning email — currently it says "we'll get
  back to you at your school email."

---

Owner: R2W4 (marketing-pages worktree)
Tracking: `feat/marketing-pages` branch
