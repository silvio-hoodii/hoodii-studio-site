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
| `/gym` | Lifting log + a note box. `content/gym/` + `gym_*` tables | yes |
| `/gym/conditioning` | **The whole week**, and since 2026-08-22 it has TWO levels of tabs. Discipline across the top (Overview, Run, Bike, Swim), then sub-tabs by WHEN YOU ASK: **Now** (what is true today, changes on its own), **Plan** (the coming weeks), **How** (technique, barely changes), plus **Teach** on swim. That split took the worst view from 7.9 phone screens to 2.2. Every view is a URL: `?p=swim&s=teach`. Sources: `conditioning.json`, `swim-standards.json`, `swim-teaching.json`, `program.json`, and `health_session_detail` / `health_swim_pb` / `health_watch_session` in Neon | `/gym/api/swim-baseline` only |
| `/gym/api/swim-baseline` | The one number the swim ladder is measured from. Every rung reads "your number plus 100 m" and for a month there was nowhere to put it. Writes `gym_swim_baseline`, a history not a value, and records whether the pull buoy was out | **cookie** |
| `/health` | Body composition, read-only from `healthos.db` | n/a |
| `/french` | LanguageOS review queue. Cards enter only from a page he worked | yes |
| `/curio` | CuriosityOS archive. One-way mirror of `CuriosityOS/log.md` | no writes |
| `/music` | Spotify charts plus a listening history that only exists because a cron writes it | no writes |
| `/swim` | Calgary lane-swim schedules. Read-only mirror of `SwimOS/wedge/app/data/schedule.json`, pushed by `content/swim/sync.mjs` from the 05:30 laptop task. The scrapers stay off Vercel | no writes |
| `/reading` | The live queue (what to read next) + acquisition status. Read-only mirror of `ReadingOS/data/{queue,acquire}.json`, pushed by `content/reading/sync.mjs` run by hand after `refill.mjs` / `acquire.mjs`. `acquire.mjs` needs Silvio's own logged-in Chrome over CDP, so it stays off Vercel too | no writes |
| `/reading/shelf` | **The browse surface, and the main one.** Every scored book, for two moments: in a shop (search a spine, or walk the alphabet by author surname) and at home (sort by best, shortest, best-rated, newest, oldest). One collapsed Filters control and one Sort control, copied in shape from the StoryGraph and the Calgary library catalogue after screenshotting both; the sort doubles as a MODE, so the 27-letter rail renders only in author order. Covers, descriptions and reader ratings from Open Library. `noindex` + robots Disallow. Mirror of `reading_shelf_entry`, pushed by `content/reading/sync-shelf.mjs` | no writes |
| `/reading/want` | Books saved for the next shop trip. NOT the queue: a want costs nothing and evicts nothing, where adding to the ten pushes something out. Reads `reading_want` | via `/reading/api/want` |
| `/reading/api/want` | The only write under `/reading`. Cookie-gated in `src/proxy.ts` like `/kitchen/api` and `/gym/api` | **cookie** |
| ~~`/reading/all`~~ | **Retired 2026-08-21**, 307s to `/reading/shelf`. Both browsed the same pool and the shelf page does everything it did plus covers, sorts, tiers, want and surprise. Its two unique features, Spanish books and pagination, moved across first. `src/lib/reading/catalog-*.ts` survive because `/reading/about` still uses them to list the sources | n/a |
| `/reading/about` | Explains the score, the five tracks, tagged-vs-not, and lists the 33 real source lists behind the scores. Static-shaped, reads `reading_source_list` | no writes |
| `/reading/finished` | Recall cards + a debrief for books already finished. Static data, `content/reading/packs/*.json` | no writes |
| `/reading/[slug]` | One book's recall deck, off `/reading/finished` | no writes |
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

**The scoring was rebuilt on 2026-08-21 and every reading surface now reads ONE pool.** It used
to be five separately-scored corpora, each with its own ceiling (nonfiction and genre topped out
near 1.5 off three or four source lists, canon reached 10.8 off thirteen), and `refill.mjs` blended
those incomparable numbers into one ten-book queue behind eight variety quotas. Seven of the ten
scored under 4 while The Grapes of Wrath sat outside it. The quotas are gone, only the two anti-slog
caps remain, and `ReadingOS/scripts/lib/score.mjs` holds the whole formula in one readable table:
per-source weights, same-prize deduplication, rank inside a ranked list, and winner detection for
the archives that list winners and nominees together. **Do not add a score constant anywhere else.**

**Refreshing reading data**, from `ReadingOS/` then here:

```
node scripts/ingest.mjs all            # THE one that ranks. After any source change.
node scripts/build-shelf-finder.mjs    # sections, per-section tiers, ownership flags
node scripts/enrich-openlibrary.mjs    # covers, descriptions, pages. Cached, so re-runs are free
node scripts/refill.mjs                # only if the queue should re-rank
cd ../hoodii-studio-site
node content/reading/sync-shelf.mjs && node content/reading/sync-catalog.mjs && node content/reading/sync.mjs
```

Neon updates immediately; no redeploy for data-only changes. `refill.mjs` re-ranks rather than
tops up: an unread book has no tenure, but anything he has STARTED or OWNS is pinned.

**Two guards in that pipeline exist because they caught something.** `sync-shelf.mjs` throws on an
unmapped section label rather than silently dropping the books (it fired the day Spanish was added,
which would otherwise have put 156 books in no section). `fetch-award-sources.mjs` refuses to write
a source whose parse dropped more rows than it kept, because a half-read award list under-credits
every book it missed while looking like full coverage.

**`/reading`'s queue is `force-dynamic` on purpose.** It reads Neon at request time, same as
`/swim`. Without that directive Next prerenders it once at build time and it never looks at the
mirror again, which was caught 2026-08-20 by checking the build's own route table (`ƒ` vs `○`)
rather than trusting that a page which fetches from a DB must be dynamic by default. It is not.
Refreshing the data: run `refill.mjs` and/or `acquire.mjs` in `ReadingOS/`, then
`node content/reading/sync.mjs` here, then redeploy nothing (Neon updates immediately, no rebuild
needed). The green `.verdict.now` badge is the one case that earns `--signal` on this page: a copy
on the shelf at Westbrook or Central today, not just "BORROW NOW" system-wide, which is a
different and much less useful fact.

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

**You do not retype her method either.** `content/kitchen/import.mjs` captures one published recipe
verbatim into `content/kitchen/imported/<id>.json`, hashed, and `validate.mjs` asserts every
`sourceText` on a card appears in that capture. Before 2026-08-17 the verbatim check compared a step's
`text` to its `sourceText`, both typed by the same agent, so it verified that an agent agreed with
itself. Build the card from the capture. A quote the page does not carry now fails the build.

**Check what is already on the port before you trust a local probe run.** On 2026-08-18 four
`next start` servers from earlier sessions were still listening on 3002, 3007, 3009 and 3011, all
serving old builds of this repo. A `pnpm start -p 3007` failed with the port in use, the
wait-for-server loop was satisfied by the stale one instantly, and the probe printed nine confident
failures about code that had already been replaced. `probe-kitchen.mjs` now compares the served build
against `.next/BUILD_ID` and refuses to run rather than reporting, so this costs a message instead of
an hour. Pick a port nothing holds: `netstat -ano | grep LISTENING | grep :30`.

**Touching `/kitchen`? Run `node scripts/probe-kitchen.mjs <base-url>`.** Same argument as the gym
probe: the static gates all pass on a page that renders a stale ingredient row, and both bugs found on
2026-08-16 needed a browser. It drives real Chrome over raw CDP with no new dependency, at 390px, and
writes nothing. Adding a case that would POST to `/kitchen/api` is forbidden: there is no development
database and a probe writing into his stock or his cook log is worse than no probe.

Two other gates worth knowing before you edit anything under `content/kitchen/`:

- `provenance.readAt` is the build at which every step was read AS RENDERED. Change one word and the
  stamp goes stale, strict validation exits 1, and the deploy dies. Use `node
  content/kitchen/render.mjs <id>` to read one in seconds, which is the reason nobody ever did.
- `provenance.cookedResult: "failed"` drops a dish from the offered list whatever else it passes.
  Piccata is currently `failed` and is being rewritten from a source.

## THE GYM DATA PIPELINE, and what each activity actually holds

Everything under `/gym` that is not a plan comes from the Samsung Health export on the laptop, via
`healthos.db`, via `content/health/sync.mjs`, into Neon. The 07:15 scheduled task
(`HealthOS/sync/run-health-sync.ps1`) runs the whole chain: pull the newest export from Drive, unzip
it, `import-watch-sessions.mjs`, `import-session-detail.mjs`, then the mirror.

**The four activities are NOT equal and no page should pretend otherwise.** Audited 2026-08-22:

| Activity | What the watch records | What a page can honestly say |
|---|---|---|
| Swimming | HR per second, and per LENGTH: duration, stroke cycles, stroke type, rest | Everything. SWOLF, pace, stroke rate, the shape of the swim |
| Treadmill | HR, **cadence**, speed, distance per second | Cadence IS measured indoors. Real form feedback |
| Lifting | HR only | The shape of the hour. 54% of his sessions sit under 110 bpm. It cannot judge a lift |
| Bike | HR only | Nothing. No rpm, no power, no resistance, and the page says so |

**`stroke_count` is CYCLES, not arm strokes.** His median is 9 per 25 m; as single arm strokes that
would be 2.78 m per stroke, which is not physically possible. Every stroke-rate number depends on
this.

**Samsung exercise type 0 is not a sport, and it is two things at once.** It is the generic "other
workout" bucket, 301 sessions, and until 2026-08-22 the pipeline gave both halves one name. 213 of
them he started himself and picked "Other workout" from the watch's list; 87 the watch's automatic
detection invented, roughly ten minutes after the fact. They import as `other` and `other-auto`, and
the evidence for the split is written out in `HealthOS/server/import-watch-sessions.mjs`: source
type 4 appears only on activities Samsung's detection supports and never once on strength, treadmill
or stationary bike, and its heart-rate trace starts ten minutes in where a manual one starts at
five seconds. Both still count as a training day. **What the 36 minutes at 151 bpm on 2026-07-25
actually was is not recoverable** and no further digging will change that: nobody chose it, and the
watch stored heart rate and nothing else.

**A kind rename duplicates every session it touches**, in both stores, because each keys on
(start_time, kind) and an upsert under a new name inserts beside the old row. Both importers and
`content/health/sync.mjs` now delete the stale row, and the mirror asserts its Postgres count
against sqlite's rather than printing both and moving on. That split left 87 sessions in the week
strip twice while every log line read healthy.

**Samsung does not label the swim PB distances.** `best_records` stores a numeric type and a
duration. The mapping 13/14/15/16 = 100/200/400/1500 is DERIVED and re-tested on every import by
requiring pace per 100 m to rise with distance. A firmware renumbering exits non-zero rather than
silently relabelling his personal bests.

**Two things that failed silently and were found by counting, not by reading the success line.** An
unrounded 117.5 into an integer column killed the Neon mirror mid-run after 108 of 151 rows, so the
table looked populated and stopped three weeks short, and it aborted before `swim_session` and
`health_target` too. And before 2026-08-21 the mirror carried only `strength` and `swimming`, so no
run or bike had ever reached the site. Compare row counts across the two stores, not the log line.

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
- **Touching `/gym`? Run `node scripts/gym-notes.mjs` FIRST.** There is a note box at the bottom of
  the workout, added 2026-08-16 at his request, and it writes to `gym_note`. It is the only place
  the app records anything in his own words: everything else is numbers typed into boxes, and a
  number cannot say "the racks were taken" or "my knee felt off". Act on what is there, then
  `node scripts/gym-notes.mjs --handled <id>`. The kitchen already learned what happens otherwise:
  a captured question nobody answers is worse than no capture, because he stops believing the box
  does anything.
- **Adding a POST route under `/gym/api`? It must go in `WRITE_ROUTES` in `scripts/probe-gym.js`.**
  Nothing is optional about this: the probe drives a real browser against the real Neon store, and
  an unstubbed write route means a test posts into his actual training log. `/gym/api/note` was
  added without it and the first probe went out over the network. `scripts/lint-probe-routes.mjs`
  now fails the build on it, so this is a description of a gate rather than a thing to remember.
- **Touching `/gym`? Run `node scripts/run-probe-gym.mjs <base-url>` as well**, and the reload pair
  with `node scripts/run-probe-gym.mjs <base-url> swapSurvivesReload`. Together that is 24 checks;
  it exits non-zero on any failure. The four other gates are static: they all passed on a build
  whose swap control silently reset on every page load, whose logged sets then became invisible,
  whose write recorded one exercise's id next to another's name, and which opened on the wrong day
  the moment the first set of a session landed. Silvio found all of that by training with it. The
  probe drives the real interactions in a real browser and stubs every write, so nothing reaches his
  log. It is the only test on this repo that presses a button.

  **The driver is in the repo now because a gate nobody can run is not a gate.** `agent-browser`,
  which the probe's header documents, hangs on this machine, so for two sessions the probe was
  driven by a throwaway script rewritten from scratch each time. On 2026-08-21 one of those opened a
  background tab, and Chrome fires no focus or blur events for a document without system focus:
  `el.focus()` moved `document.activeElement` while emitting no `focusout`, React's delegated
  `onBlur` never ran, and five write-path tests reported zero writes. That was written up as "the
  repo's only interaction test is dark on the write path" and queued as its own session. **The app
  was correct the whole time.** `run()` now measures whether the page can produce a blur at all and
  refuses to run rather than blaming the app, and `run-probe-gym.mjs` sets
  `Emulation.setFocusEmulationEnabled`. Verified both directions on one build: 5 failed without the
  flag, 0 with it.
- **The lockfile check is not optional and `pnpm build` cannot substitute for it.** On 2026-08-09 a
  dep was removed by editing `package.json` directly instead of running `pnpm remove`. Every local
  command passed, because `node_modules` was already correct and install never re-ran. Vercel
  installs with `--frozen-lockfile`, refused the mismatch, and the deploy died in 5 seconds without
  ever reaching the build. Change a dependency only through `pnpm add` / `pnpm remove`.
- Lint catches `react-hooks/rules-of-hooks` on plain functions named `use*`. Rename them rather than
  disabling the rule.
- Dev server: `pnpm dev` (port 3001). **Test on `localhost`, not `127.0.0.1`**. The dev server
  blocks cross-origin dev resources from the bare IP and the page silently will not hydrate.
- **Do not run `pnpm build` while `pnpm dev` is up.** They share `.next`, and the build leaves the
  dev server serving a stale CSS chunk under the SAME hashed filename. It cost two false readings on
  2026-08-15: a change measured as "no effect" when the stylesheet was correct all along. Stop dev,
  build, restart. Anything that has to be certain should be measured against `pnpm start`, which
  serves what actually deploys.
- Renaming a root convention file leaves a stale Turbopack cache. `rm -rf .next/dev` and restart.

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
