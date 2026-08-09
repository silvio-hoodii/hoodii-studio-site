<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# hoodii-studio-site

## What this repo is

**Silvio's personal hub.** A front door at `/` that indexes the small apps he builds for himself,
plus the apps themselves as routes. Currently `/kitchen`. Gym and French are next.

This is [home-cooked software](https://maggieappleton.com/home-cooked-software): built for an
audience of one, not meant to scale or generalise. That framing is the design brief. The site's job
is to name the things, show which are open, and get out of the way.

## The 3D world was removed on 2026-08-09

This repo used to be an immersive WebGL room ("an agent's studio"). `src/world/`, `src/overlay/` and
`src/lib/shaders/` are gone, along with three, R3F, drei, postprocessing, gsap and zustand.

**Do not rebuild it, and do not treat the old design doc as authoritative.**
`~/Desktop/HOODII/docs/plans/2026-05-21-hoodii-studio-3d-world-design.md` is now history. Silvio's
own reason, 2026-08-09: *"That website is basically dead. It's been just me messing with some design
choices that I always keep changing."* The room was a nice idea with nothing behind it, so it got
redesigned instead of finished. Now there are real apps behind the page.

It is all recoverable from git history if it is ever wanted back (last commit containing it:
`c2b8a8a`).

**One landmine it left behind, already fixed, worth knowing about:** `globals.css` carried
`overflow: hidden` on `html, body` so the WebGL room could not be scrolled, plus `cursor: none`.
That shipped `/kitchen` on 2026-08-09 completely unscrollable on a phone. The content was there and
measurable in `scrollHeight`, and no thumb could reach it. **Measuring a page's height is not testing
that it scrolls.** Drive a real wheel or CDP touch event.

## Stack

- **Framework.** Next 16 (Turbopack) + React 19 + TS strict, `noUncheckedIndexedAccess` on.
- **Data.** Neon Postgres via `@neondatabase/serverless` (HTTP, no pooling problem on Vercel).
- **Styling.** Plain CSS per surface (`hub.css`, `kitchen/kitchen.css`), scoped under a root class.
  Tailwind 4 is still installed and used lightly in `layout.tsx`.
- **Auth.** `src/proxy.ts`, a password plus an httpOnly cookie. Next 16 renamed `middleware` to
  `proxy`; do not recreate `middleware.ts`.
- **No.** Sanity. i18n. `@hoodii/ui`. Analytics. An auth SaaS (see below).

**No auth product until there is more than one user.** Better Auth and Clerk solve accounts, OAuth
and password resets, none of which exist here. The cookie in `proxy.ts` gates per route, which is
exactly what a mixed public/private site needs. Vercel's Deployment Protection is the wrong tool: it
gates the whole deployment behind a Vercel login, which would kill the public half.

## Surfaces

| Route | What | Gated |
|---|---|---|
| `/` | The hub index | public |
| `/kitchen` | KitchenOS. See `content/kitchen/` and `KitchenOS/WHERE-THINGS-LIVE.md` | yes |
| `/kitchen/login` | The gate | public |

**Recipes are data, and `pnpm build` runs `content/kitchen/validate.mjs --strict`.** A broken recipe
cannot deploy. Read `content/kitchen/schema/RECIPE-SCHEMA.md` before touching a recipe.

## Illustrations

Drawn as inline SVG in `src/app/page.tsx`, not imported. **No human is in the asset loop** and no
image files to go stale. Single stroke weight, round caps, one accent colour, 48-unit viewBox.

Each has to read at 46px on a phone. Two drafts of a kettlebell both read as a handbag before it
became a dumbbell. **Screenshot at phone size and look at it** rather than trusting the path data.

## Live data

`src/lib/fetchers.ts` plus `/api/spotify` and `/api/psn`. Spotify now-playing renders in the hub
footer and degrades to nothing. `PSN_NPSSO` is currently expired and logs a caught error at build;
harmless, and PSN is not surfaced on the hub.

## Commits and deploy

- Production deploys from `main`.
- Verification gate: **`pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm build`.**
  All four, before any push.
- **The lockfile check is not optional and `pnpm build` cannot substitute for it.** On 2026-08-09 a
  dep was removed by editing `package.json` directly instead of running `pnpm remove`. Every local
  command passed, because `node_modules` was already correct and install never re-ran. Vercel
  installs with `--frozen-lockfile`, refused the mismatch, and the deploy died in 5 seconds without
  ever reaching the build. Change a dependency only through `pnpm add` / `pnpm remove`.
- Lint catches `react-hooks/rules-of-hooks` on plain functions named `use*`. Rename them rather than
  disabling the rule.
- Dev server: `pnpm dev` (port 3001). **Test on `localhost`, not `127.0.0.1`** — the dev server
  blocks cross-origin dev resources from the bare IP and the page silently will not hydrate.
- Renaming a root convention file leaves a stale Turbopack cache. `rm -rf .next/dev` and restart.

## Domain status

`hoodii.studio` is **still served by `hoodii-platform-hoodii-site`**, the old monorepo app. This repo
is live at `hoodii-studio-site.vercel.app`. The flip is a pending decision, not a technical blocker;
when it happens, `/kitchen` moves off the vercel.app URL for free and
`hoodii-platform/apps/hoodii-site/` gets archived.

## Posture rules (load-bearing)

- **No CMS.** Content lives in TS/JSON files in this repo.
- **No "Hoodii" branding.** His name plus the domain. No Hoodii logos, no Hoodii Inc framing.
- **Voice is "I" (first person).** Personal site, not a company.
- **No em dashes.** Zero tolerance, per `feedback_copy_no_ai_tells`.
- **Honest states only.** A card for an app that is not here yet renders as a dashed, unlinked
  placeholder saying so. Never a link that 404s.
