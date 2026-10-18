<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# hoodii-studio-site

## What this repo is

**Silvio's personal hub.** A front door at `/` that indexes the small apps he builds for himself,
plus the apps themselves as routes.

This is [home-cooked software](https://maggieappleton.com/home-cooked-software): built for an
audience of one, not meant to scale or generalise. That framing is the design brief. The site's job
is to name the things, show which are open, and get out of the way.

## Read this file before touching X

This file is the core. Each topic below was moved verbatim into its own file on 2026-10-18; read the
one that matches the change before making it.

| Before touching | Read |
|---|---|
| Any text a page renders (captions, JSON fields that render, component defaults) | `docs/agents/page-text.md` |
| The front page, or anything that brings back a section about him or the 3D room | `docs/agents/removed.md` |
| Layout above 720px, charts, `Readout.tsx`, `Ago.tsx`, the `.two` idiom, screenshots | `docs/agents/layout.md` |
| `/gym`, `content/gym/`, `program.json`, `/gym/api`, `/swim/api`, `/bike/api`, the gym probe | `docs/agents/gym.md` |
| The Samsung sync, `health_*` tables, swim dates, `gym_set` columns | `docs/agents/health-data.md` |
| `content/swim/` quotes, or any claim from an outside source | `docs/agents/sources.md` |
| `/kitchen` | `docs/agents/kitchen.md` |
| `/music`, the Spotify sync, `src/lib/fetchers.ts` | `docs/agents/music.md` |
| `/reading` | `docs/agents/reading.md` |
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
  at runtime). Per-surface CSS (`hub.css`,
  `kitchen/kitchen.css`) is scoped under a root class and **must consume the tokens, never hardcode
  a colour.** Fonts are IBM Plex Sans and Mono. Two files are shared rather than per-surface:
  `src/app/training.css` (root class `.training`, used by ALL FIVE training routes since
  2026-08-27, and named `gym.css` with a `.gym` root until 2026-08-26) and `src/app/charts.css`
  (`/health` and `/swim`). Both were renamed or extracted the day a second route needed them,
  rather than copied. `/health` carries `.training` AND `.health`, and loads health.css LAST so it
  wins the four selectors both files define.

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

**THE HEADER IS THE NAVIGATION since 2026-09-27** (`src/components/SiteHeader.tsx`): Training, Curio, Music, Reading, the current one marked. Training lands on /gym and the training chips take it from there; listing Gym, Health and Swim separately stacked three rows of navigation on a phone.

**The proxy runs on API prefixes only, since 2026-09-27.** Its matcher named `/kitchen/:path*`,
`/gym/:path*` and `/health/:path*`, so every page view of three apps ran it to consult
`GATED_PAGES`, a list empty since 2026-08-11. Re-gating a page is two lines: the prefix in
`GATED_PAGES` and the prefix in `config.matcher`.

Every PAGE is public. Only WRITES need the cookie, per the reasoning in `src/proxy.ts`. This table
said `/kitchen` was gated and listed none of the five routes added after it, which is the same drift
that let a hub row describe the wrong app for months: a hand-maintained list of what exists will
always lose to the thing that exists.

| Route | What | Writes gated |
|---|---|---|
| `/` | The hub index, ISR six hours **and regenerated on demand**: the gym write routes and the music cron call `revalidatePath('/')` (which marks the page; the next request rebuilds it), and the two laptop pipelines call `/api/revalidate` through `scripts/revalidate.mjs`, which then fetches the page so the rebuild runs inside their wake. Rows show real state, never a link label, and **since 2026-09-27 each carries a word-sized picture** (`src/components/Spark.tsx`: gym day strip, weight line, swim bars, album covers, book cover) and a signed-in device gets today's Curio card above the rows (`HubQuiz.tsx`). Six rows: Gym, Health, Swim, Curio, Music, Reading | n/a |
| `/kitchen` | A cookbook: dishes he chose, each with the publisher's recipe link, a shopping list and his notes. **Off the front page and out of the header since 2026-09-27**: he asks for dishes in chat ("it's usually an agent that helps me out"), the ask box had 0 rows ever and was deleted with `/kitchen/api/inbox`. Dish pages stay because sessions send him their links. Read `KitchenOS/README.md`. Neon: `dish`, `inbox` (still read by the SessionStart hook), `cook_log` | yes (`/kitchen/api/note`) |
| `/gym` | Lifting log and a note box, two full-body sessions (A and B) alternating since 2026-10-11. The full row, his binding rules and the history: `docs/agents/gym.md` | yes |
| `/bike` | Cycling. Same three sub-tabs. **The watch records a heart rate and nothing else on a bike**, so the page says so and the resistance levels get typed instead. Source: `conditioning.json` | no writes |
| `/health` | **THE TRAINING INDEX since 2026-08-27**, and the Overview tab of the dead conditioning page lives here. **FOUR sub-tabs, and Weight is the first and the default since 2026-08-28**, on his complaint: "as soon as I go in, it starts talking about 2 days in a row and the length of the sessions. It doesn't make sense." The hub row for this route shows his weight, so the number he tapped and the first thing he saw were about different subjects. Weight (the YEAR HEADLINE first, peak reading to lowest with the span and the rate, linking to /health/deep; then the last weigh-in, seven of the eight body-composition columns, the fat/lean split, watch-only muscle and water), Now (days in a row, the recovery caveat, last lift, the last ten lifts trended, what actually happened over a fortnight, attendance behind a tap), Plan (the planned week, how the four disciplines fit, the rest rule, when things happen), Volume (weekly fractional sets per muscle with a column per day, per lift behind a tap, and the pairings that cost the lift in front of them). The default is read off `TABS[0]`, not a literal, so reordering the chips cannot leave the landing tab behind. Volume answers a question he asked three times and got a document for three times, so /gym carries a one-line link to it under the finish buttons | n/a |
| `/health/deep` | **THE YEAR SO FAR, since 2026-08-28.** The whole of the current calendar year in one page: the weight range as a headline number, the weight and fat lines, where the kilos came off, all seven other body-composition columns (**including `bmi`, populated on every row of `health_body_comp`, mirrored on every sync run and read by nothing in this repo until now**, 09-health P2-8), attendance by discipline and by month, the longest break, last year for scale, every lift logged on two or more days with its change, and all four swim personal bests against what stood before them. Then a limits section. A ROUTE and not a fifth sub-tab, the same call /swim/deep made: the chip row has no wrap and no scroll, and this is read on the sofa rather than at the rack. Source: `src/lib/health/year.ts`, two round trips, **every figure derived and none typed**, the year itself off `today()`. It shares `getYearBody()` with the Weight tab so the two cannot print different headlines | no writes |
| `/curio` | **A DAILY QUIZ SINCE 2026-09-27**, on his word: the morning email had stopped being opened ("I don't want to read from an email ... maybe a shorter text and more interactive"). Top: `Today.tsx`, fetched in the browser and shown only to a signed-in device: up to two new questions plus due reviews, recall then reveal then *knew it* / *didn't*, spaced on a Leitner ladder (`src/lib/curio/spacing.ts`, tests in `verify.mjs`); then ONE saved ReadLater link at a time with keep / drop; then the morning-reminder switch. Below: `content/curio/games.json` (learning games, every URL fetched when added), and one line linking to the archive. Page stays ISR 3600 because the private part is client-fetched. The quiz alone is `Quiz.tsx`, which the index card mounts. Grades in `curio_review`, pile in `curio_save`, pushed and pulled by `content/curio/sync-saves.mjs` (verdicts go back into the vault notes as `verdict:`), both run nightly from `ReadLaterOS/run-readlater.ps1` along with `sync.mjs` | yes, `/curio/api/*`, **reads gated too** |
| `/curio/archive` | **The mornings and the one-line ledger, off /curio since 2026-09-27.** Folded under the quiz they printed every answer the quiz asks him to recall, and cost every visit two round trips and the whole ledger twice over (HTML plus hydration data). ISR 3600, indexable, one link from /curio | no writes |
| `/api/revalidate` | POST, bearer `CRON_SECRET`, body `{paths: [...]}` from an allow-list. Regenerates cached pages on demand; `scripts/revalidate.mjs` calls it from `HealthOS/sync/run-health-sync.ps1` and `ReadLaterOS/run-readlater.ps1` after they write to Neon. See "What costs money" | bearer |
| `/curio/api/*` | today (GET), grade, save, push, push/test. **The only prefix where GETs need the cookie**: `curio_save` is his unfiltered reading pile, which `schema.sql` has kept off public surfaces since /curio was built | **cookie, all methods** |
| `/api/curio/remind` | Cron, 15:00 UTC daily. Sends the first due question as a phone notification to every `curio_push` row; sends nothing on a day with nothing due. `CRON_SECRET` like `/api/music/sync`. Private key `VAPID_PRIVATE_KEY` (Vercel production, sensitive, so it reads back blank: test with the page's *Send a test* button, never with `env pull`); public key in `src/lib/curio/push-key.ts` | bearer |
| `/sw.js` | The service worker for those notifications, served from a route because there is no `public/`. Shows and opens; caches nothing | n/a |
| `/me/api/open` | One open of an app by HIM: `Track.tsx` in `SiteHeader` and the index beacons it, the proxy 401s everyone without the cookie, so every `app_open` row (day, app, opens) is him. Built because the 2026-09-27 audit could not separate his visits from crawlers in Vercel's log. **Read this table before the next usage audit.** Counts only on the hoodii.studio hostname: a local `pnpm start` shares the database and its screenshot runs were being counted as his opens. `GET /me/api/opens` feeds the Opened strip on the index (`UseStrip.tsx`) | **cookie, all methods** |
| `/music` | **Pictures first since 2026-09-27** ("just lists of songs ... something more graphic"): a weekday-by-hour listening grid, track minutes per day, an album wall sized by plays, most-played artists as bars (grouped on the primary artist, the name before the first comma), all from `getListening()` in one transaction, two to a line above 1024. Spotify's charts and recent plays are folded below. **ISR 3600 since 2026-09-27, regenerated by the sync route**: it was force-dynamic with 17 database round trips and a Spotify token mint on every request, listed in the sitemap. Now-playing is the client component `NowPlaying.tsx` off `/api/spotify`, as on the index. "Minutes" are track lengths per play (a skip counts the whole track), so the labels say track minutes | no writes |
| `/swim` | **His own swimming, since 2026-08-26.** Five sub-tabs on the same `?s=` idiom: Now (last session drawn, tier ladder, personal bests, 90-day history, and a link to `/swim/deep`), Plan (the ten-week continuity ladder), How, Coach me, Coach them. **Five and not six: the chips end at 317px of a 390px screen and `.subtabs` has neither wrap nor scroll, so the deep dive is a route.** The Calgary pool schedule that used to be here is DELETED, along with six scrapers, the `HOODII-SwimOS-Daily` task and the four `swim_*` tables; backup at `_archive/SwimOS-2026-08-26/`. Sources: `content/swim/*.json` and `health_swim_pb` / `health_swim_session` / `health_session_detail` in Neon | `/swim/api/baseline` only |
| `/swim/deep` | **The whole record, since 2026-08-27.** The only thing that reads `health_swim_length`, 19,327 lengths back to 2018. Stroke efficiency over time, PB progression out of `standingFor()`'s `history` array, weight against pace, swimming after lifting, work to rest, stroke mix, the last session split at the walls he stopped at, season gaps, and a limits section. `noindex`. Read `src/lib/swim/deep.ts` before adding a figure: its header records the three data traps that produced wrong answers here | no writes |
| `/swim/api/baseline` | The one number the swim ladder is measured from. Every rung reads "your number plus 100 m" and for a month there was nowhere to put it. Writes `gym_swim_baseline` (the table keeps its `gym_` prefix on purpose), a history not a value, and records whether the pull buoy was out. Was `/gym/api/swim-baseline` | **cookie** |
| `/reading` | **GOODREADS SINCE 2026-09-27**, on his word: "I might as well just use Goodreads". Covers from his public shelf RSS feeds (`src/lib/reading/goodreads.ts`, user 204368762; Goodreads issues no API keys since 2020): reading now, read by year with his stars, want to read. ISR 6 hours, **no database**. The ReadingOS queue mirror it replaced had not synced since 2026-08-22 | no writes |
| `/reading/finished` | Recall decks (titled Recall since 2026-09-27) + a debrief for books already finished. Static data, `content/reading/packs/*.json` | no writes |
| `/reading/[slug]` | One book's recall deck, off `/reading/finished` | no writes |
| `/callback` | Shows a Spotify auth code so re-auth needs no local server. Never exchanges it | n/a |
| `/login` | **ONE login route since 2026-09-04**, replacing `/kitchen/login`, `/gym/login`, `/health/login` and `/french/login`, which were four near-identical forms for one cookie and one password. Each guarded its redirect with its own app's prefix, so a correct password entered from `/reading/shelf` landed in the kitchen (A3). The guard is `safeReturnTo` in `src/lib/return-to.ts`: same-origin, no app names in it, never `/login` itself, 45 cases in `return-to.test.ts`. The eyebrow is derived from `?to=`. All four old paths 307 here | public |
| Retired routes | Every deleted route and where it 307s now: `docs/agents/retired-routes.md` | n/a |

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
`lint-probe-routes` (a POST route under `/gym/api`, `/swim/api` or `/bike/api` must be in `WRITE_ROUTES`).

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
