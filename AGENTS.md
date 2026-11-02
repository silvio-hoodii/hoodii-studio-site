<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# hoodii-studio-site

**Stripped on 2026-11-02 on Silvio's ruling ("hoodii studio as a whole has not been used"). Kitchen, Reading, Curio, Music (the page), Health, Swim and Bike are gone; `/` is static; the gym is parked, not removed. The tag `before-strip-2026-11-02` (and the commit it names) recovers everything.**

## What this repo is

**Silvio's name, a static front page, a parked gym log and one collector.** Built for an audience of one.
What is left is listed under Surfaces; everything else is in git at the tag above.

## Read this file before touching X

This file is the core. Each topic below was moved verbatim into its own file on 2026-10-18; read the
one that matches the change before making it.

| Before touching | Read |
|---|---|
| Any text a page renders (captions, JSON fields that render, component defaults) | `docs/agents/page-text.md` |
| The front page, or anything that brings back a section about him or the 3D room | `docs/agents/removed.md` |
| `/gym`, `content/gym/`, `program.json`, `/gym/api`, the gym probe | `docs/agents/gym.md` |
| The Samsung sync (`content/health/sync.mjs`), `health_*` tables, `gym_set` columns | `docs/agents/health-data.md` |
| `content/swim/` quotes, or any claim from an outside source | `docs/agents/sources.md` |
| The Spotify sync (`/api/music/sync`), `/callback` | `docs/agents/music.md` |
| Layout notes from before the strip (desktop grid, charts), retired | `docs/agents/layout.md` |
| The icon, `src/lib/icon-mark.tsx`, any drawn mark | `docs/agents/drawings.md` |
| Tap sizes, overflow, `scripts/probe-taps.mjs` | `docs/agents/probes.md` |
| `vercel.json`, regions, firewall rules, a page that renders per request, Vercel usage | `docs/agents/costs.md` |
| A gate script, `verify.mjs`, the pre-push hook, `wait-deploy.mjs`, auth, tokens, dead CSS | `docs/agents/ship.md` |
| Re-adding or redirecting a deleted route | `docs/agents/retired-routes.md` |

## Stack

- **Framework.** Next 16 (Turbopack) + React 19 + TS strict, `noUncheckedIndexedAccess` on.
- **Data.** Neon Postgres via `@neondatabase/serverless` (HTTP, no pooling problem on Vercel).
- **Styling.** The tokens in `globals.css` are the system (they began as shadcn's variable names; the
  `shadcn` package, `clsx` and `tailwind-merge` were removed on 2026-09-27 because nothing used them
  at runtime). Per-surface CSS (`hub.css`) is scoped under a root class and **must consume the tokens,
  never hardcode a colour.** Fonts are IBM Plex Sans and Mono. `src/app/training.css` (root class
  `.training`) is the gym's stylesheet. `lint-dead-css` fails the build on any class nothing renders.

**The palette is a decision, not a default.** Monochrome, one chromatic colour (`--signal`) used
only for a value that is true right now, radius near zero, rules instead of cards, no shadows or
gradients. This replaced cream + terra-cotta + serif + rounded cards on 2026-08-09, which research
that day found named verbatim as the current AI-generated tell and which Silvio called AI slop on
sight. shadcn's own defaults (neutral grey, Geist, `rounded-lg`) are equally a default: **take the
plumbing, not the paint.**
- **Auth.** `src/proxy.ts`, a password plus an httpOnly cookie. Next 16 renamed `middleware` to
  `proxy`; do not recreate `middleware.ts`.
- **No.** Sanity. i18n. `@hoodii/ui`. Analytics. An auth SaaS (see below).

**No auth product until there is more than one user.** Better Auth and Clerk solve accounts, OAuth
and password resets, none of which exist here. The cookie in `proxy.ts` gates per route, which is
exactly what a mixed public/private site needs. Vercel's Deployment Protection is the wrong tool: it
gates the whole deployment behind a Vercel login, which would kill the public half.

## Surfaces

Every PAGE is public. Only WRITES need the cookie, per the reasoning in `src/proxy.ts`. The proxy runs on `/gym/api/*` and `/api/unlock` only. This table is what exists after the 2026-11-02 strip; the routes that left are in `docs/agents/retired-routes.md`.

| Route | What | Writes gated |
|---|---|---|
| `/` | **Static since 2026-11-02**: his name, a link to the gym, the person JSON-LD (no location). No database and no network at render, and it must never again regenerate from data (`docs/agents/removed.md`) | n/a |
| `/gym` | Lifting log and a note box, two full-body sessions (A and B) alternating since 2026-10-11. **Parked, unchanged**: he may come back to it. The full row, his binding rules and the history: `docs/agents/gym.md` | yes (`/gym/api/*`) |
| `/gym/log` | The whole lifting record | no writes |
| `/login` | **ONE login route since 2026-09-04.** The guard is `safeReturnTo` in `src/lib/return-to.ts`: same-origin, never `/login` itself, tested in `return-to.test.ts`. The old per-app login paths 307 here | public |
| `/api/unlock` | The inline unlock the gym's `SaveBlocked` posts to, so a locked device types the password where the write failed. **Was `/kitchen/api/unlock` until 2026-11-02**; the old path 307s here | public by necessity |
| `/api/music/sync` | **Cron, hourly (24 entries in `vercel.json`). LOAD-BEARING:** it writes `music_play`, `music_top` and `music_sync`, silvioneyra.com's Songs reads `music_play`, and Spotify returns only the last 50 plays, so a missed run is a loss nobody can recover. Bearer `CRON_SECRET`. Detail: `docs/agents/music.md` | bearer |
| `/callback` | Shows a Spotify auth code so re-auth needs no local server. Never exchanges it. **It is the redirect URI registered in the Spotify app**, so it stays | n/a |
| `robots.txt`, `sitemap.xml`, `icon`, `apple-icon`, `opengraph-image`, `manifest` | Plumbing. The sitemap lists `/` only | n/a |
| Retired routes | Every deleted route and where it 307s now: `docs/agents/retired-routes.md` | n/a |

**Scripts used from OUTSIDE this repo, which must stay at these paths** (HealthOS, ReadLaterOS, CuriosityOS, skills and silvioneyra-com call them): `scripts/read-source.mjs`, `scripts/walmart-price.mjs`, `scripts/check-ladder.mjs`, `scripts/revalidate.mjs` (a no-op that exits 0 since 2026-11-02, kept because two laptop scripts still call it), `content/curio/sync.mjs`, `content/curio/sync-saves.mjs`, `content/health/sync.mjs`, `content/gym/program.json`. The tables they fill are read by HealthOS and silvioneyra-com, so **no table is ever dropped from here**.
## How to ship

Production deploys from `main`: `git push origin main` is the deploy, and there is no staging.

1. Run `node scripts/verify.mjs` before pushing. It runs install `--frozen-lockfile`, typecheck, lint,
   build (which runs `pnpm gates`), the validator regression suites and the gym gates, and prints ONE
   green-or-red line whose exit code agrees with it.
2. If another session is working here, `git pull --rebase origin main` first: the hook checks the tree
   you push, so a red result may be a file you have not pulled.
3. Push. `.githooks/pre-push` (wired with `git config core.hooksPath .githooks`) runs
   `node scripts/guard-live-session.mjs` first, which refuses while a workout is open (`GYM_GUARD_OFF=1`
   for an abandoned session), then `node scripts/verify.mjs`. Any failure blocks the push. Never
   `--no-verify` without Silvio saying so.
4. Run `node scripts/wait-deploy.mjs --url <path> --expect "<text your change produces>"` in the
   background and carry on. Never a `curl` + `sleep` loop: the previous build serves 200 the whole time.

**Probes need a server: run them against a local `pnpm start`, never the live domain** (firewall rule 4
challenges a burst, and a signed-in load counts as one of his opens). Detail: `docs/agents/probes.md`.

**Gates in `pnpm build` that refuse by name** (each reason, incident and selftest: `docs/agents/ship.md`):
`lint-prose` (en and em dashes, invisible characters), `lint-page-text`, `lint-auth` (the auth comparison
lives once, fail-closed, in `src/lib/auth.ts`; the cookie is set once, in `src/lib/login-server.ts`),
`lint-tokens` (no colour literal outside `globals.css`), `lint-dead-css` (no class without a use),
`lint-probe-routes` (a POST route under `/gym/api` must be in `WRITE_ROUTES`).

**Traps:** change a dependency only through `pnpm add` / `pnpm remove` (Vercel installs frozen). Dev is
`pnpm dev` on port 3001; test on `localhost`, not `127.0.0.1`. Never `pnpm build` while `pnpm dev` is up
(shared `.next`). Lint catches `rules-of-hooks` on plain functions named `use*`: rename them.

**Check what is already on the port before you trust a local run.** On 2026-08-18 four `next start`
servers from earlier sessions were still listening on 3002, 3007, 3009 and 3011, all serving old
builds of this repo, and a probe printed nine confident failures about code that had already been
replaced. Pick a port nothing holds: `netstat -ano | grep LISTENING | grep :30`.

## Domain status

`hoodii.studio` serves this repo as of 2026-08-10. `hoodii-platform/apps/hoodii-site/` (the old
monorepo app, 2D portfolio) is retired and should be archived, not edited. This repo is also public
on GitHub as of 2026-08-10 (`silvio-hoodii/hoodii-studio-site`). Git history was scanned clean of
secrets first; keep it that way: dependency/API keys go in `.env.local` (gitignored) or Vercel env
vars, never inline.

## Posture rules (load-bearing)

- **No CMS.** Content lives in TS/JSON files in this repo.
- **No "Hoodii" branding.** His name plus the domain. No Hoodii logos, no Hoodii Inc framing.
- **Voice is "I" (first person).** Personal site, not a company.
- **No em dashes.** Zero tolerance, per `feedback_copy_no_ai_tells`.
- **Honest states only.** A card for an app that is not here yet renders as a dashed, unlinked
  placeholder saying so. Never a link that 404s.
