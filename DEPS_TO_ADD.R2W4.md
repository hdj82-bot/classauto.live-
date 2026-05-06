# R2W4 (Marketing Pages) — Dependencies to Add

This worktree (`feat/marketing-pages`) ships five marketing surfaces
(`/use-cases`, `/trust`, `/security`, `/beta-apply`, `/contact`) without
introducing any new runtime or dev dependencies.

## Frontend
- **No new packages.** All five pages are built from the existing stack:
  React 19, Next 16.2.1 metadata API, Tailwind 4, the shared `Modal`
  component, and the same vitest + `@testing-library/react` setup other
  worktrees use.

## Backend
- **No new packages.** The two forms (beta-apply, contact) currently use a
  mock submit (500 ms delay → success screen). When the backend endpoints
  arrive, no new packages are needed on the frontend either — `axios` is
  already in `dependencies`.

## Optional (post-merge consideration)
- If we later want to render the marketing pages with server components
  + draft-mode CMS content, we may want `@vercel/og` for opengraph image
  generation. Out of scope for this branch.
- An external embedded form (Tally / Google Forms) was considered per the
  task brief but skipped — keeping the form inside the app means the
  ClassAuto dark/gold visual stays consistent and there's no third-party
  iframe to vet from a privacy/CSP standpoint.
