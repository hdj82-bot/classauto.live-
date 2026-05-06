# Header.R2W4.patch.md — proposed Header changes for the marketing pages

R2W4 ships five new public surfaces (`/use-cases`, `/trust`, `/security`,
`/beta-apply`, `/contact`). The shared `frontend/src/components/Header.tsx`
is owned by R2W1 in this round; we are NOT modifying it here. This
document records the changes R2W1 (or a follow-up integration PR) should
apply when the marketing pages land.

## What R2W4 actually does
- Each marketing page renders its own `MarketingShell` component
  (`frontend/src/components/marketing/MarketingShell.tsx`) — a minimal
  top bar with the logo + locale toggle + an optional "Apply / Contact"
  CTA, plus a marketing footer with cross-links between the five pages.
- The shared in-app `Header.tsx` is therefore not used on these pages,
  and we do not break or change its current behaviour.

## What would be nice in the shared Header (optional, post-merge)

If R2W1 wants the shared `Header.tsx` to also surface the public
marketing routes for logged-out visitors, here is the minimum patch:

### 1. Add nav links for unauthenticated users

Today, when `user` is null, `Header.tsx` only renders the logo + locale
selector. For unauthenticated visitors browsing the marketing surface
through the shared Header (e.g. coming from `/dashboard`'s post-logout
redirect), the following links would be useful:

```tsx
{!user && (
  <nav className="hidden md:flex items-center gap-1" aria-label={t("nav.public")}>
    <Link href="/use-cases" className="...">{t("nav.useCases")}</Link>
    <Link href="/trust" className="...">{t("nav.trust")}</Link>
    <Link href="/security" className="...">{t("nav.security")}</Link>
    <Link href="/beta-apply" className="bg-amber-400 text-black ...">
      {t("nav.betaApply")}
    </Link>
  </nav>
)}
```

### 2. New i18n keys (to be added by R2W1, not by R2W4)

The user task brief explicitly forbids putting these inside the
marketing patch — they belong in the shared `nav.*` namespace which
R2W1 owns. The keys to add:

| Key | ko | en |
|---|---|---|
| `nav.public` | "공개 메뉴" | "Public" |
| `nav.useCases` | "활용 사례" | "Use cases" |
| `nav.trust` | "학생 데이터 보호" | "Trust" |
| `nav.security` | "보안" | "Security" |
| `nav.betaApply` | "베타 신청" | "Apply for beta" |
| `nav.contact` | "기관 문의" | "Contact" |

R2W4 has NOT added these to its own marketing patch — they belong in the
shared dictionary.

### 3. Why R2W4 is not patching this directly

- `Header.tsx` is in R2W1's "do not touch" list for this round.
- Touching the shared `Header.tsx` or `messages/{ko,en}.json` from R2W4
  would force a merge conflict with R2W1 every time either side iterates.
- `MarketingShell` already provides cross-page navigation between the
  five marketing surfaces, so the marketing UX is functional without the
  shared Header changes.

### 4. Marketing-specific i18n keys are self-contained

If R2W1 prefers, the marketing nav labels can also be sourced from
`messages/_patches/marketing.{ko,en}.json` (`marketing.common.ctaApplyBeta`
already exists). But the recommendation is to put them in the shared
`nav.*` namespace so any future header — student, professor, public —
can reuse them.

## R2W1 deep-merge integration

`I18nContext.tsx` currently imports the `student.{ko,en}.json` patches
and merges them at module load. R2W4 introduced
`messages/_patches/marketing.{ko,en}.json` and uses the
`useMarketingI18n` local hook (mirroring W3's `useDemoI18n`). When R2W1
extends `I18nContext.tsx` to also deep-merge the marketing patch, R2W4
pages keep working unchanged — `useMarketingI18n` is a pure wrapper that
reads the same JSON files, so it remains safe to delete in a follow-up
PR after the merge is wired up.
