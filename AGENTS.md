# Erebuz monorepo — workflow rules for agents

pnpm workspace. Apps live in `apps/*`, shared code in `packages/*`, contracts in `contracts/`.

| App | Package | Purpose | Local dev (from repo root) |
| --- | --- | --- | --- |
| `apps/landing` | `@erebuz/landing` | Marketing site (erebuz.com) | `pnpm landing` |
| `apps/docs` | `@erebuz/docs` | Fumadocs documentation | `pnpm docs` (port 3001) |
| `apps/app` | `@erebuz/app` | wall8 app (private transfers) | `pnpm app` |
| `apps/deck` | `@erebuz/deck` | Investor deck (email-gated slides) | `pnpm deck` (port 3002) |
| `packages/tee` | `@erebuz/tee` | TEE service (private-route API) | `pnpm tee` |

`pnpm dev` runs every workspace dev script in parallel. Do NOT pass an app name to it (`pnpm dev app` breaks — the extra arg is forwarded to every child `next dev`); use the per-app shortcuts above.

## Git: two remotes, keep both in sync

This repo pushes to **two** remotes, and both must always end up on the same commit:

- `origin` → `erebuz-privacy/monorepo` (org repo)
- `codeytechie` → `codeytechie/erebuz-monorepo` (personal mirror)

**Pushing** — after every commit to `main`, push to both, in this order:

```bash
git push origin main && git push codeytechie main
```

**Pulling** — either remote may be ahead (work happens on both). Fetch both, fast-forward from whichever is ahead, then push the other one back level:

```bash
git fetch origin && git fetch codeytechie
git pull --ff-only origin main || git pull --ff-only codeytechie main
git push origin main && git push codeytechie main
```

Never leave the two remotes on different commits at the end of a session.

**Commits** — conventional-commit style with an app scope, e.g. `feat(landing): …`, `style(docs): …`, `refactor(app): …`.

## Vercel deploys

CLI is logged in as `codeytechie`, team `codeytechies-projects`. Git pushes auto-deploy via the Vercel GitHub integration, but for an immediate/verified deploy use the CLI. Each project is linked from a different directory — run `vercel deploy --prod` from the right one:

| Project | Linked directory (`.vercel/`) | Production domain |
| --- | --- | --- |
| `erebuz-landing` | repo root | www.erebuz.com |
| `erebuz-docs` | `apps/docs` | (vercel.app URL until docs domain is set) |

```bash
# landing
cd <repo-root> && vercel deploy --prod

# docs
cd apps/docs && vercel deploy --prod
```

`apps/app` is not linked to a Vercel project yet — ask before creating one.

## Before pushing

Run the affected app's checks and make sure they pass:

```bash
pnpm --filter @erebuz/landing check      # lint + typecheck + build
pnpm --filter @erebuz/docs build
pnpm --filter @erebuz/app build
```

## App-specific notes

- `apps/landing` — the "Get access" buttons open a waitlist dialog ([Waitlist.tsx](apps/landing/src/components/Waitlist.tsx)) that POSTs emails into a Google Form (ids at the top of that file). Docs CTAs are intentionally "Coming soon" until docs ship publicly.
- `apps/docs` — Fumadocs with the better-auth-style design (black preset + Geist, custom sidebar in `components/docs-sidebar.tsx`, nav data in `components/sidebar-content.tsx`). When docs pages are added/removed, update `sidebar-content.tsx` and `content/docs/meta.json` together.
- `apps/deck` — Next.js port of the bolt-slides engine, landing-site theme. The email gate ([EmailGate.tsx](apps/deck/src/EmailGate.tsx)) must use its OWN Google Form (`DECK_FORM_ID`), never the landing waitlist's — deck leads and waitlist signups stay in separate sheets.
- `apps/app` — wallet connection is RainbowKit + wagmi v2 (`src/lib/wagmi.ts`, `src/components/web3-provider.tsx`). RainbowKit's `getDefaultConfig` is client-only: never import `lib/wagmi.ts` from a server component. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` must be set for the WalletConnect QR flow. Next.js here is v16 — read `node_modules/next/dist/docs/` before assuming App Router APIs.
