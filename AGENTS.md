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
- **Styling.** shadcn tokens in `globals.css` are the system. Per-surface CSS (`hub.css`,
  `kitchen/kitchen.css`) is scoped under a root class and **must consume the tokens, never hardcode
  a colour.** Fonts are IBM Plex Sans and Mono.

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

Every PAGE is public. Only WRITES need the cookie, per the reasoning in `src/proxy.ts`. This table
said `/kitchen` was gated and listed none of the five routes added after it, which is the same drift
that let a hub row describe the wrong app for months: a hand-maintained list of what exists will
always lose to the thing that exists.

| Route | What | Writes gated |
|---|---|---|
| `/` | The hub index. Rows show real state, never a link label | n/a |
| `/kitchen` | KitchenOS. See `content/kitchen/` and `KitchenOS/WHERE-THINGS-LIVE.md` | yes |
| `/gym` | Lifting log. `content/gym/` + `gym_*` tables | yes |
| `/health` | Body composition, read-only from `healthos.db` | n/a |
| `/french` | LanguageOS review queue. Cards enter only from a page he worked | yes |
| `/curio` | CuriosityOS archive. One-way mirror of `CuriosityOS/log.md` | no writes |
| `/music` | Spotify charts plus a listening history that only exists because a cron writes it | no writes |
| `/callback` | Shows a Spotify auth code so re-auth needs no local server. Never exchanges it | n/a |
| `/kitchen/login`, `/gym/login`, `/health/login`, `/french/login` | The gate, one cookie for all | public |

**`/music` has a failure mode none of the others have.** Its history is unrecoverable: Spotify
returns the last 50 plays and nothing else, so anything the cron misses is gone from everywhere, not
just from here. `vercel.json` therefore runs `/api/music/sync` three times a day (Hobby permits 100
cron jobs at once-per-day each, so three entries 8 hours apart is legal and free). The route
requires `CRON_SECRET` and refuses to run without it rather than sitting on the internet as an open
endpoint that makes four Spotify calls per hit.

**The refresh token dies silently every 180 days** while the Spotify app is in Development mode, and
`fetchSpotify()` in `src/lib/fetchers.ts` returns `{ isPlaying: false }` for both a dead token and a
quiet evening. That is why `src/lib/music/spotify.ts` exists as a separate client that **throws**,
why every run writes a `music_sync` row, and why `/music` and the hub row both shout when the last
successful run is over 36 hours old. Do not add a catch that returns a default to that file.

**Recipes are data, and `pnpm build` runs `content/kitchen/validate.mjs --strict`.** A broken recipe
cannot deploy. Read `content/kitchen/schema/RECIPE-SCHEMA.md` before touching a recipe.

**You do not write cooking steps. Read `content/kitchen/schema/SOURCING.md` first.** Decided
2026-08-09 after the first dish ever cooked from this app burnt, having passed a six-source check on
its numbers, a full read of every rendered step, and a clean validator run. All four failures were
gaps *between* the numbers, and every one came from a sentence an agent wrote. None came from a
figure a source gave. A recipe now follows ONE published recipe verbatim and agents add only what a
printed page cannot: stock, definitions, equipment, timers, protein. `validate.mjs` enforces a
single primary source, `sourceText` on every step, and refuses any number in a step that is not in
that step's source text.

Two other gates worth knowing before you edit anything under `content/kitchen/`:

- `provenance.readAt` is the build at which every step was read AS RENDERED. Change one word and the
  stamp goes stale, strict validation exits 1, and the deploy dies. Use `node
  content/kitchen/render.mjs <id>` to read one in seconds, which is the reason nobody ever did.
- `provenance.cookedResult: "failed"` drops a dish from the offered list whatever else it passes.
  Piccata is currently `failed` and is being rewritten from a source.

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
- **Touching `/gym`? Run `scripts/probe-gym.js` as well.** The four gates are static: they all passed
  on a build whose swap control silently reset on every page load, whose logged sets then became
  invisible, whose write recorded one exercise's id next to another's name, and which opened on the
  wrong day the moment the first set of a session landed. Silvio found all of that by training with
  it. The probe drives the real interactions in a real browser and stubs every write, so nothing
  reaches his log. Usage is in the file's header. It is the only test on this repo that presses a
  button.
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

`hoodii.studio` serves this repo as of 2026-08-10. `hoodii-platform/apps/hoodii-site/` (the old
monorepo app, 2D portfolio) is retired and should be archived, not edited. This repo is also public
on GitHub as of 2026-08-10 (`silvio-hoodii/hoodii-studio-site`) — git history was scanned clean of
secrets first; keep it that way: dependency/API keys go in `.env.local` (gitignored) or Vercel env
vars, never inline.

## Posture rules (load-bearing)

- **No CMS.** Content lives in TS/JSON files in this repo.
- **No "Hoodii" branding.** His name plus the domain. No Hoodii logos, no Hoodii Inc framing.
- **Voice is "I" (first person).** Personal site, not a company.
- **No em dashes.** Zero tolerance, per `feedback_copy_no_ai_tells`.
- **Honest states only.** A card for an app that is not here yet renders as a dashed, unlinked
  placeholder saying so. Never a link that 404s.
