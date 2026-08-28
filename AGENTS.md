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

Every PAGE is public. Only WRITES need the cookie, per the reasoning in `src/proxy.ts`. This table
said `/kitchen` was gated and listed none of the five routes added after it, which is the same drift
that let a hub row describe the wrong app for months: a hand-maintained list of what exists will
always lose to the thing that exists.

| Route | What | Writes gated |
|---|---|---|
| `/` | The hub index. Rows show real state, never a link label | n/a |
| `/kitchen` | KitchenOS. See `content/kitchen/` and `KitchenOS/WHERE-THINGS-LIVE.md` | yes |
| `/gym` | Lifting log + a note box, and lifting ONLY since 2026-08-27. The notes are READABLE from the page as of the same day, collapsed at the bottom with the count of unanswered ones in the summary; `gym_note` was write-only from the web before that. `content/gym/` + `gym_*` tables | yes |
| ~~`/gym/conditioning`~~ | **Deleted 2026-08-27.** It held the whole week behind two levels of query parameters and every one of its URLs now 307s from `next.config.ts`: `?p=run` to `/run`, `?p=bike` to `/bike`, `?p=swim` to `/swim`, everything else to `/health`, sub-tab preserved in all three | n/a |
| `/run` | Running. Three sub-tabs on the `?s=` idiom: Now (last session the watch saw), Plan (the ten-week walk-to-run build, belt settings in both units, the week table), How (cues). Source: `conditioning.json`, unchanged in the move | no writes |
| `/bike` | Cycling. Same three sub-tabs. **The watch records a heart rate and nothing else on a bike**, so the page says so and the resistance levels get typed instead. Source: `conditioning.json` | via `/bike/api/ride` |
| `/bike/api/ride` | One ride: date, minutes, the resistance level he finished EACH interval on, effort, note. Writes `bike_ride`. Four levels rather than one because `conditioning.json` already tells him to write down all four, and 1 to 20 is his dial. Shipped before the form, so its gates were built while somebody was looking | **cookie** |
| `/health` | **THE TRAINING INDEX since 2026-08-27**, and the Overview tab of the dead conditioning page lives here. Three sub-tabs: Now (days in a row, the recovery caveat, last lift, the last ten lifts trended, what actually happened over a fortnight, attendance behind a tap), Weight (all 8 body-composition columns, not the 2 it drew before: the fat/lean split of every kilo lost, plus watch-only muscle and water), Plan (the planned week, how the four disciplines fit, the rest rule, when things happen), Volume (weekly fractional sets per muscle with a column per day, per lift behind a tap, and the pairings that cost the lift in front of them). Volume is the one thing on this site that answers a question he asked three times and got a document for three times, so /gym carries a one-line link to it under the finish buttons. Was a dead end nothing linked to and which linked to nothing | n/a |
| `/french` | LanguageOS review queue. Cards enter only from a page he worked | yes |
| `/curio` | CuriosityOS archive. One-way mirror of `CuriosityOS/log.md` | no writes |
| `/music` | Spotify charts plus a listening history that only exists because a cron writes it | no writes |
| `/swim` | **His own swimming, since 2026-08-26.** Five sub-tabs on the same `?s=` idiom: Now (last session drawn, tier ladder, personal bests, 90-day history, and a link to `/swim/deep`), Plan (the ten-week continuity ladder), How, Coach me, Coach them. **Five and not six: the chips end at 317px of a 390px screen and `.subtabs` has neither wrap nor scroll, so the deep dive is a route.** The Calgary pool schedule that used to be here is DELETED, along with six scrapers, the `HOODII-SwimOS-Daily` task and the four `swim_*` tables; backup at `_archive/SwimOS-2026-08-26/`. Sources: `content/swim/*.json` and `health_swim_pb` / `health_swim_session` / `health_session_detail` in Neon | `/swim/api/baseline` only |
| `/swim/deep` | **The whole record, since 2026-08-27.** The only thing that reads `health_swim_length`, 19,327 lengths back to 2018. Stroke efficiency over time, PB progression out of `standingFor()`'s `history` array, weight against pace, swimming after lifting, work to rest, stroke mix, the last session split at the walls he stopped at, season gaps, and a limits section. `noindex`. Read `src/lib/swim/deep.ts` before adding a figure: its header records the three data traps that produced wrong answers here | no writes |
| `/swim/api/baseline` | The one number the swim ladder is measured from. Every rung reads "your number plus 100 m" and for a month there was nowhere to put it. Writes `gym_swim_baseline` (the table keeps its `gym_` prefix on purpose), a history not a value, and records whether the pull buoy was out. Was `/gym/api/swim-baseline` | **cookie** |
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

## CO-BUILDING WITH HIM, rather than designing for him

His ask, 2026-08-27: *"whenever i let the agents design we still have shortcomings so lets come up
with a way to co build it"*. This is that protocol. Four rules, each with the mechanism named, per
the meta-law in `.agents/ENGINEERING.md`: **a rule that does not execute is decoration.**

**1. Agents author MECHANISM. He authors JUDGMENT.** The kitchen's rule, transplanted. `AGENTS DO
NOT WRITE COOKING STEPS` was written 2026-08-09 after a dish that had passed a six-source
cross-check burnt anyway, because **all four failures came from a sentence an agent wrote and none
from a figure a source gave.** The gym produces the same shape of defect.

| An agent may author | Only he can author |
|---|---|
| Arithmetic, unit consistency, gates, validators | What is actually in the gym, and where |
| Evidence lookup and verbatim quotation from a source | How much time he really has that day |
| Rendering, refactors, migrations | What a cue must say to be followable |
| An option set with the cost of each attached | Whether a reason is legible where it appears |
| Anything a test can prove | How much text is too much |

*Mechanism:* `validate.mjs` refuses an exercise with no `cue`, `station` or `zone`, and refuses a
`whyHere` that is not a verbatim span of an accepted `why`. Agent prose in a judgment field does not
compile.

**2. Judgment calls get batched into ONE pass, with costs, before anything is written.** Not buried
in prose: a real question with real options and the consequence of each. The farmer carry proved it
(see the `open` bullet under Commits and deploy): five days of three contradictory answers, then one
word from him and a same-hour ship.

**3. Every ruling is written where the thing lives, and he is never asked twice.** An unanswered
question is an `open` row on the exercise or station. An answered one is deleted and the answer
written into the `why`, the `cue` or `equipment.json`, dated, with the note number. *Mechanism:*
`gym-notes.mjs` prints every `open` row and exits non-zero past its `due` date.

**4. The pairing session has a fixed shape, so it does not become an audit.** An audit produces a
document. This produces a decision and a shipped change.

```
1. READ    gym-notes.mjs --all, program.json's $comment, and the block the notes point at.
           NO PROPOSALS YET.
2. LOCATE  which KIND of failure this is (table below). If it is a new kind, say so.
3. ASK     one batch of judgment calls, options plus costs, in his words not a field name.
4. BUILD   only what he ruled on. All the gates. Screenshot at 390px and LOOK at it. Ship.
5. CLOSE   mark the notes handled, write the ruling where the thing lives.
```

**Step 2 is the one that is new, and it is what stops the session becoming another redesign.** The
taxonomy, from all eighteen notes as of 2026-08-27:

| Kind of failure | Notes | What the work actually is |
|---|---|---|
| Placement unexplained at the point of asking | #6 #8 #9 #13 #17 | **Reach, not reasoning.** The answer usually already exists |
| Equipment reality an agent could not know | #14 #15 #16 #18 | Ask him, then write it into `equipment.json` |
| Unit guessed instead of declared | #5 #19 | Three options with costs; he rules |
| Time budget assumed, not asked | #2 #7 #11 | 40 minutes is the real constraint on at least three days |
| Form and feel, which only he can report | #3 #4 | Cannot be derived. Only he has the instrument |
| Volume of text | #12 | The counterweight to the five at the top. Measure at 390px |
| Improvisation the app did not offer | #10 | The app was missing an option, not wrong |

**"Done" has to mean it changed what he knows, not that it was rendered.** The block `why` was
required by a validator, present on all 24 blocks, named the questioned exercise in 9 of 11 cases,
was backed by 61 KB of sourced evidence, and shipped specifically to answer this complaint. He asked
the same question five more times over nine days. Nothing was broken. **The note box is currently the
only instrument in this system that measures reach, which is why an unanswered note is worse than no
note box at all.**

## THE GYM DATA PIPELINE, and what each activity actually holds

Everything under `/gym` that is not a plan comes from the Samsung Health export on the laptop, via
`healthos.db`, via `content/health/sync.mjs`, into Neon. The 07:15 scheduled task
(`HealthOS/sync/run-health-sync.ps1`) runs the whole chain: pull the newest export from Drive, unzip
it **and verify the unzip**, `parse-body-metrics.js` + `server/migrate-body-comp.mjs`,
`import-watch-sessions.mjs`, `import-session-detail.mjs`, then the mirror.

**That chain lives in its own repo: `silvio-hoodii/HealthOS`, PRIVATE, on `master`.** Worth knowing
because three handoffs in a row recorded it as "not tracked by git", which sent nobody looking for a
remote that already existed. What was actually true, until 2026-08-27, is that `guard-regen.mjs` was
untracked and the extraction gate plus both parser rewrites had sat uncommitted for three weeks.
Both gates below are committed and pushed now. If you change something in `HealthOS/`, commit it
there: nothing in this repo will carry it.

**A HALF-EXTRACTED EXPORT LOOKS EXACTLY LIKE AN EXPORT WITH LESS DATA IN IT, and that cost a day on
2026-08-26.** The 2026-08-21 export extracted 244 of its 88,838 entries. All 80 CSVs landed and 164
of 88,757 JSON blobs did, so nothing crashed and nothing looked wrong: attendance, body composition
and the swim PBs were all correct, because those come from CSVs. Only the per-session detail was
starved. Two research agents then read that directory carefully and both concluded, in writing and
with evidence, that Samsung had stopped shipping HRV, GPS and per-length swim data. All of it was in
the .zip.

Two faults, and the second is why it lasted five days rather than one. `Expand-Archive` failed
partway and the catch logged a WARN, because every step in that task is non-fatal on purpose, which
is right for a Drive pull and wrong for an extraction. Then `if (Test-Path $dest) { "already
unpacked" }` meant the half-empty directory satisfied every later run. **The partial state was
self-perpetuating.**

Both are now gates rather than intentions:

- **Extraction gate**, in that task. Extract to staging, count the archive's file entries against the
  files on disk, refuse to promote below 98%, and re-count an existing directory rather than
  trusting that it exists. Verified against both real cases: the broken export refuses at 244
  against a floor of 87,061, the good one promotes at 89,186 of 89,186.
- **Regeneration gate**, `HealthOS/guard-regen.mjs`, wired into `parse-swim-laps.js` and
  `parse-swimming.js`. **Any script that regenerates an accumulated artifact from one export must go
  through it.** It refuses to write fewer records than the file already holds, keeps a `.prev`, and
  `--force` overrides while saying so. This is the more general of the two: a truncated download, a
  schema change, a filter typo and an interrupted unzip all present identically to the script doing
  the writing, so the check belongs where the loss happens. `parse-swim-laps.js` was one documented
  command (`npm run laps`) from replacing 18,804 lengths going back to 2018 with about 1,300, and
  its own header called rerunning it cheap.

**`gym_set.rir` IS GONE, dropped 2026-08-27 on his call, and `gym_set.estimated` MUST NOT FOLLOW
IT.** The plan listed both as dead columns that could not be filled. Only one was. `rir` held a
value in 0 of 569 rows across its whole life while being declared in three interfaces, sent on every
POST, written, upserted and selected back out. `estimated` is load-bearing: 54 rows are `true`, and
`getLastSession` filters `coalesce(estimated, false) = false` so progression only ever walks back to
a set whose numbers were actually typed rather than recalled. Dropping it would feed 54 backfilled
sets into the weight suggestions. The 178 nulls since 2026-08-14 are correct, because null means
measured live.

**The order was code first, column second**, and it matters for any future column drop here: the
deployed app was still running `select weight, reps, rir`, so dropping first would have 500'd every
read of /gym. Ship the code, confirm production is READY on that commit
(`vercel api /v13/deployments/<url>` returns `readyState` and `meta.githubCommitSha`), then drop. The
drop script re-counted the column's non-null rows and would have refused if any had appeared.

**And the RIR guide stayed.** `content/gym/rir-guide.json` teaches what reps-in-reserve means, which
is worth having whether the number is logged or not. Deleting the teaching along with the dead
plumbing is the mistake available whenever a name is shared by a feature and its explainer.

**`pace_per_100m_ms` and `moving_pace_per_100m_ms` are two columns because one column was two
metrics.** Wall clock always, rest-excluded only where the per-length detail was read, null
otherwise and never a fallback. A single mixed column mattered because the only operation anything
performs on it is a minimum, and a minimum over a mixed column always selects the flattering
definition: `/health` showed a best of 1:31 per 100 m, off a 300 m session that ran 25 minutes with
4 minutes of swimming in it, **faster than the official 100 m PB of 1:38.71**. Two numbers answering
"how fast can he swim", on two pages, neither linking to the other.

**`health_swim_session.date` AND `health_swim_length.date` ARE UTC. `health_session_detail.date` AND
`health_watch_session.date` ARE LOCAL.** Four date columns describing the same swims, two of them a
day out for any swim starting after 18:00 in Calgary: 94 of 475 rows. Found 2026-08-27, and it had
been rendering the whole time: /swim showed a card headed "Your last session (Aug 25)" and, one
screen below it, "Last swim the watch export has reached: Aug 26", about the same swim. The comment
above `getSwimHistory` asserted that "every row in these tables was stamped in local time", which
was true of the tables it was written for and is why nobody looked.

**Do not add a swim figure keyed on `date`.** Recover the instant instead: neither
`health_swim_session` nor the mirror filling it carries a start time, so join
`health_swim_length.session_start_time` or `health_session_detail.start_time` and convert through
`America/Edmonton`. The evidence that this is the right direction rather than a preference: the
conversion reproduces the date `health_watch_session` independently recorded on 359 of 361 sessions
where both exist, against 271 for the raw column. `SWIM_LOCAL_DATE` in `src/lib/swim/db.ts` is the
expression; `src/lib/swim/deep.ts` derives every date it prints and never selects `date`. The 108
sessions with no start time anywhere keep the raw value rather than being dropped. **The real repair
is in the importer on the laptop, which git still does not track.**

**A SENTENCE CAN SIT THREE LINES ABOVE THE TABLE THAT DISPROVES IT.** /swim/deep shipped its weight
section reading "the heaviest band is also the period he swam most", which is the obvious confound
and is false: 2023 is his biggest year by distance, 186 swims at 104 kg, and 2025 is his fastest at
118 kg on 102. Weight and volume did not move together. Typecheck, lint, build and a full text dump
of the rendered page all passed with it in place, because none of them compares prose against the
numbers beside it. The screenshot caught it, along with a tile labelled "Best this year" above a date
from the previous September and a "100 m" breaking into "100" over "M". **The rule this repo keeps
relearning: read the rendered screen.** The corollary that is cheaper than a screenshot: derive the
claim. Every figure on that page is returned from `deep.ts` and none is typed into a sentence, which
is what made three recovered "facts" falsifiable in the first place.

**Every discipline's `now` tab draws the last TEN sessions, not one, since 2026-08-27**, via
`getRecentSessions`, which had existed since 2026-08-22 with zero importers. The trend each one gets
was chosen by counting populated rows in Neon first: percent-under-110 for lifting (80 sessions),
SWOLF for swimming (8 of the last 10 carry it, and the caption says so), cadence for running (5
sessions, all with it), and nothing at all for cycling, which has exactly one session ever.

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
- **A source that 403s the fetcher is not a source that cannot be checked.** Use
  `node scripts/read-source.mjs <url> ["<regex>"]`, which reads the page in the real Chrome on CDP
  9222 and prints the rendered text. On 2026-08-22 swimming.org returned 403, a swim cue was
  downgraded to "convention", and the file was made to say no sentence from that page could be
  quoted "by anyone reading this". It loads fine in a browser. Silvio caught it in one line. Reading
  it then showed the file's note ABOUT that source was also wrong: it claimed nine core aquatic
  skills and listed nine, and the page names four (Floatation and Balance, Rotation and Orientation,
  Streamlining, Aquatic Breathing). Nobody had opened it, so the detail had been written from
  memory. Before writing "this cannot be verified", verify it. Before trusting a note about a
  source, read the source.
- **Touching `content/gym/program.json`? Run `node scripts/check-ladder.mjs`.** It reads his real
  working weights out of Neon and asks one question of every logged lift: does maxing out the rep
  range actually earn the next weight? Double progression is a ladder, and a rung that cannot be
  reached from the one below means the app asks for a jump he fails, drops back from, and repeats.
  On 2026-08-22 eight of fifteen lifts were in that state, all dumbbell or cable, and it is why the
  overhead press was the only main lift flat all year: at 65 lb, three sets of ten banks an
  estimated max of 86.7 and the jump to 70 demands 88.7. Fixed by a 2.5 lb increment on the cable
  stack (evidenced by the 72.5 and 87.5 he has logged on it) and a per-exercise `rangeWidth` on the
  dumbbell lifts. It cannot live in `validate.mjs`, which is offline by design, so the 07:15 sync
  task runs it daily: the check depends on his current loads and can break with no file edited.
- **`.ex` ON /gym MEANS AN EXERCISE, and nothing else may answer to it.** `scripts/probe-gym.js`
  selects it to find the day's cards. On 2026-08-27 a notes block reused it and **all 22 tests
  passed** while the harness's `cardNames()` went from 10 entries to 28, because `wholeDayIsShown`
  compares that count against itself. Third borrow on this surface after `.tab`/`.surf-tab` (17
  failing tests) and swap-revert/swap-toggle, and the first two were each "fixed" with a comment
  saying not to do it again. `exSelectorMeansExercise` is the gate now: every `.ex` must carry
  `data-slot`. A shared look is a CSS decision; a shared class name is an API.
- **Touching `/gym`? Run `node scripts/gym-notes.mjs` FIRST.** There is a note box at the bottom of
  the workout, added 2026-08-16 at his request, and it writes to `gym_note`. It is the only place
  the app records anything in his own words: everything else is numbers typed into boxes, and a
  number cannot say "the racks were taken" or "my knee felt off". Act on what is there, then
  `node scripts/gym-notes.mjs --handled <id>`. The kitchen already learned what happens otherwise:
  a captured question nobody answers is worse than no capture, because he stops believing the box
  does anything.

  **That command also prints the `open` questions and exits non-zero on an overdue one.** See the
  co-build section below.
- **A PARTNER EXERCISE CARRIES `whyHere`, AND IT MAY NOT SAY ANYTHING NEW.** `validate.mjs` requires
  the last exercise of every block to have either a `whyHere` or an `open` question, and refuses a
  `whyHere` that is not a **verbatim span of its own block's `why`**, first-character case aside.

  **The failure it fixes was REACH, not reasoning, and that distinction is the whole design.** Five
  of his eighteen gym notes ask a version of "why is this here" (#6 #8 #9 #13 #17), and every
  exercise they name resolves to **eleven placements, all at partner position 2, not one a lead
  lift**. The answer was already there: `why` is required on all 24 blocks, is rendered, is backed by
  61 KB of sourced evidence in `HealthOS/knowledge/training-programme-evidence.md`, and **names the
  questioned partner in 10 of those 11 cases**. It shipped on 2026-08-16 for exactly this complaint.
  He then asked five more times over the next nine days, because the block heading said "Main Lift:
  BB Row", the control said "Why this is here", and he was looking at a calf raise in position 2.
  Nothing told him the tap would explain the calf raise.

  **A fix can ship, validate, render, and still not reach him, and every gate will call that done.**
  An agent handed "explain the programme better" writes more reasoning. There was already more
  reasoning than he had ever seen.

  **Why the verbatim-span gate and not a free-text field.** Note #12, eight days after the others:
  *"Walls of text again why do I need all this, just leave the cue and thats it, it can even be
  hidden"*. A per-exercise prose field is exactly how that wall comes back one honest-looking clause
  at a time, invisible in any diff review. Text that is not already in the accepted `why` does not
  compile. Measured at 390px on the shipped build: 4 to 6 clauses a day, 164 to 246px, **2.1% to
  3.2% of the page, nothing longer than three lines.** Re-measure if you touch it; do not estimate
  it from the source.

  A partner whose block `why` does not explain it **does not get a reason invented for it.** It gets
  an `open` question, which is the honest state. Three currently do.
- **`content/gym/validate.test.mjs` is that validator's regression suite, and `scripts/verify.mjs`
  runs it.** Ten cases; each mutates a copy of `content/gym` in a temp directory and asserts the real
  validator refuses it. **A gate that has only ever been seen to pass has not been seen to work**: it
  may be matching nothing. This one earned its place on its first run by catching a hole in the gate
  it was written to cover, which normalised the first character's case in one direction only. It is
  in `verify.mjs` and deliberately NOT in `pnpm build`: it spawns ten processes and copies a
  directory ten times, which belongs in what a person types before pushing, not in the deploy path.
- **AN OPEN QUESTION FOR SILVIO LIVES ON THE THING IT IS ABOUT.** An `open: [{q, asked, due}]` array
  on an exercise in `program.json` or a station in `equipment.json`. His ruling, 2026-08-27, chosen
  over a second `UNKNOWNS.md`: the question goes where the next agent is already reading.
  `validate.mjs` gates the shape; **`scripts/gym-notes.mjs` surfaces every one and exits non-zero
  past `due`**, which is the command AGENTS.md already requires before any `/gym` edit. It is not in
  the validator because a due date that turns the build red overnight with no file edited would
  block an unrelated deploy, the same reason `check-ladder.mjs` is not in there.

  **The failure it exists to stop:** the farmer carry had three contradictory answers live in the app
  for five days, the card saying 40 reps, his note saying seconds, the cue saying count steps. A
  2026-08-22 audit had already concluded it was *"a decision to put to Silvio, not to invent"*. Nobody
  put it to him. Put as three options with the cost of each, he answered in one word and it shipped
  the same hour. Cost to him: seconds.
- **Adding a POST route under `/gym/api`, `/swim/api` or `/bike/api`? It must go in `WRITE_ROUTES` in `scripts/probe-gym.js`.**
  Nothing is optional about this: the probe drives a real browser against the real Neon store, and
  an unstubbed write route means a test posts into his actual training log. `/gym/api/note` was
  added without it and the first probe went out over the network. `scripts/lint-probe-routes.mjs`
  now fails the build on it, so this is a description of a gate rather than a thing to remember.
  That linter hardcoded ONE directory until 2026-08-26, when the baseline write moved to
  `/swim/api/baseline` and would have left its scope silently. It walks a list of API roots now, and
  `src/proxy.ts` needed TWO edits for the same move: the path-prefix check AND `config.matcher`,
  which named no `/swim` path at all. A prefix added without the matcher reads as a gate and is none.
  **That was demonstrated rather than asserted on 2026-08-27**, when `/bike/api` was added: with
  the prefix present and the matcher entry deleted, an unauthenticated POST reached the handler
  and returned 400 from the route instead of 401 from the gate. Do the same to any new prefix.
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
- **`node scripts/gym-coverage.mjs` MEANS SOMETHING NOW, and it is in `verify.mjs`.** It exited 1
  on every run until 2026-08-27 and the handoff that shipped it said so and called that correct:
  11 of 16 muscles sit past the efficient zone and four exercises carry no source, all known. A
  light that is always red is not a light, and it could not get redder, so pushing a muscle BELOW
  its minimum dose would not have moved the exit code by one bit. It compares against
  `content/gym/coverage-baseline.json` instead, a dated snapshot of the three states nobody argues
  should be tolerated (a muscle under 4 fractional sets, a strict Zhang pairing, an unsourced
  exercise). Past-efficient is printed, never gated. Every run also prints which muscles moved and
  by how much since the baseline was stamped, which is how a pairing change gets quoted as a number
  rather than as an intention. To accept a change: `node scripts/gym-coverage.mjs --accept`, which
  REFUSES while a regression is present unless `--accept-regression` is also passed.
- **The arithmetic behind it is `src/lib/gym/coverage.mts`, and `/health?s=volume` imports the same
  file.** That page is the answer to a question he asked three times and got a document for three
  times: "how all those 4 days add up to volume within one period?" The alternative was
  reimplementing fractional sets in the page, which is two implementations of one computation, and
  they drift while both keep printing plausible numbers. It is `.mts` so node runs it with no build
  step; `tsconfig.json` carries `allowImportingTsExtensions` for it, because Turbopack resolves the
  literal path and will not rewrite a `.mjs` specifier to `.mts`.
- **`inProgramme` IS GONE FROM `movements.json` AND MAY NOT COME BACK.** All 103 variants carried
  it and nine were already wrong the day the file shipped, because that morning's rebuild edited
  `program.json` and never touched the flags. `gym-catalogue.mjs` derives the `*` marker now, and
  `validate.mjs` fails the build on the key's return with a regression case behind it. Same disease
  as the body-metrics and immigration copies: every copy of a fact is a fact that goes stale
  silently.
- **`--pairing` compares STATIONS, not zones.** It compared zones until 2026-08-27 and printed the
  results under the word "station", which made it recommend the exact three swaps that had been
  tried and reversed that same hour (cable lateral raise behind the seated row, cable curl behind
  the pushdown, reverse pec deck behind the machine shoulder press). All three fail `validate.mjs`.
  A tool that suggests work the gate will reject is worse than no tool: the suggestion is free and
  the rejection arrives after the work is done.
- **`scripts/lint-prose.mjs` also refuses invisible characters**, added 2026-08-27: every C0 control
  character except tab, DEL, and no-break/zero-width space. Two BACKSPACE bytes baked into a regex
  by a bad escape made `/friday/i` unable to match "Friday", and every gate in this repo passed with
  them in place. Its first live finding was real and legitimate (the kitchen validator's own nbsp
  stripper, now written as `\u00a0`).
- **A pre-push hook now runs `node scripts/guard-live-session.mjs` and then `node scripts/verify.mjs`,
  and refuses a red tree.** The first asks `gym_session` for a row with no `finished_at`: "he trains
  off this app, do not deploy while he is mid-session" was the first warning in the 2026-08-27
  handoff and was pure prose, because `verify.mjs` is offline by design and nothing executed it. It
  exits 0 and says so on a machine with no database URL. `GYM_GUARD_OFF=1` overrides an abandoned
  session. Both live in `.githooks/pre-push`,
  wired with `git config core.hooksPath .githooks`. 49 seconds: install, typecheck, lint, build, one
  GREEN or RED line whose exit code agrees with it. `verify.mjs` had existed for this since
  2026-08-17 and its own header called itself "the thing a person or an agent types before pushing";
  nothing made anyone type it. On 2026-08-22 two Claude sessions were pushing to main in the same
  hour, one pushed a recipe containing an en dash, lint-prose refused it and the deploy failed.
  Silvio noticed before either session did. **If two sessions are working here, `git pull --rebase
  origin main` before you push**: the hook checks the tree you are pushing, so a failure may be
  someone else's file that you have not pulled yet.
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

## What costs money, and the gate that is NOT in this repo

**Four Vercel firewall rules protect this site and none of them are visible in these files.**
Read them with `vercel firewall overview` and `vercel firewall rules list` before concluding that
something is unprotected, and re-read them before adding a filter page.

| # | Rule | What it does |
|---|---|---|
| 1 | Block AI training crawlers | UA regex, deny. meta-externalagent, GPTBot, ClaudeBot, Bytespider and friends |
| 2 | Unlocked device bypass | A request carrying the `kos` cookie skips rules 3 and 4 |
| 3 | Filter surface cost gate | `/reading/shelf`, `/reading/want`, `/kitchen/find` get an edge challenge |
| 4 | Document burst limit | 150 non-`/_next/` requests per minute per IP, then a challenge |

**Rule 1 names the actual culprit, identified 2026-08-25 from `vercel.request.count` grouped by
`bot_name`: `meta-externalagent`, Meta's AI training crawler, was 208,938 of 215,673 edge requests
in one 30-hour window.** Googlebot, bingbot, facebookexternalhit and UptimeRobot are deliberately
NOT in that rule and were each re-tested after publishing it: search indexing and link-preview
cards are wanted. Deny rather than challenge, because a challenge page is 33KB served to something
that will never look at it, against 59 bytes for a 403.

**Two traps in that rule, both of which cost a wrong answer before being caught.** The Vercel
dashboard TRUNCATES the user agent column, and `meta-externalagent/1.1` sits at the END of an
otherwise ordinary Chrome UA string, so the top user agents look like plain desktop Chrome. Group
by `bot_name`, never eyeball the UA column. And the firewall's `inc` operator is EXACT match
against a list, not substring: the first version of this rule used `inc` with the bot names,
published clean, and let `meta-externalagent` through with a 200 on every path. Only `re` (regex,
RE2, so no `(?i)` inline flag) does substring matching. A firewall rule that reads correctly in
`vercel firewall rules list` has not been tested. Curl it with the real user agent, both the
should-block and the should-pass side.

Added 2026-08-24, after `/reading/shelf` took **178,000 invocations and 40 minutes of Active CPU
in twelve hours**: 97.7% of the site's invocations and 95.7% of its compute, at a sustained 3.55
req/s that a live log tail caught still running. Projected out, that was ten times the entire
Hobby monthly allowance for both invocations and Active CPU, and the plan is to move back to Hobby.

**The lesson is about which of these mechanisms actually executes.** `robots.ts` had disallowed all
three of those paths since 2026-08-20, and its own addendum argued correctly that an AI scraper has
no reason to read a page's meta tags before fetching it. It does not read `robots.txt` either. Two
of the three disallowed paths were the two most-requested routes on the site. Keep the Disallow, it
still speaks to crawlers that do honour it, but never count it as protection. After publishing the
rules, function invocations went from 2.37 req/s to 0.02 req/s with zero on all three paths.

**Rule 3 is the one that matters for code you have not written yet.** `/kitchen/find` was caught
with this shape on 2026-08-20 and `/reading/shelf` shipped the same shape on 2026-08-21, so naming
paths one at a time loses. Any page that renders on every request, exposes its filter state as
crawlable `<Link>` hrefs, and needs no cookie is a combinatorial URL space someone will walk.

**Two numbers to reason with before optimising anything here.** Vercel bills Active CPU only while
code runs, and Provisioned Memory for an instance's whole lifetime *including* time spent waiting
on I/O. `/reading/shelf` was 13ms of Active CPU against a 153ms P75 time to first byte, so what it
cost was memory held open waiting for Postgres, not compute. **Count round trips, not work.** That
page issued nine separate HTTP queries per hit; `getShelfBundle` in `src/lib/reading/shelf-db.ts`
sends the same nine as one `sql.transaction`. A `Promise.all` makes queries concurrent, not free.

`/` and `/opengraph-image` were checked at the same time and left alone: the first already carries
`revalidate = 60` and the second prerenders static (`○` in the build's route table). Neither was
costing anything, and changing them would have been motion.

**How to read the real numbers, rather than the dashboard.** `vercel api` is an authenticated
passthrough to the whole Vercel REST API using the CLI's own login, so no separate token is needed.
In Git Bash, prefix it with `MSYS_NO_PATHCONV=1` or the leading `/` in the path gets rewritten into
a Windows path and the CLI rejects it.

```
MSYS_NO_PATHCONV=1 vercel api /v2/observability/schema                # 97 metrics and their dimensions
MSYS_NO_PATHCONV=1 vercel api /v2/observability/schema/<metricId>     # the dimensions you may group by
MSYS_NO_PATHCONV=1 vercel api /v2/observability/query -X POST --input body.json
```

The query body needs `scope: {type: "owner", ownerId: "<team id>"}`, a single `metric`, ISO-string
`startTime` / `endTime`, and an optional `groupBy` array. The metrics worth knowing:
`vercel.external_api_request.count` (every Neon query counts here, and on this site that is ALL of
it: group by `origin_route` to see which page), `vercel.function_invocation.count` (group by
`route`), and `vercel.request.count` (group by `bot_name`, `client_user_agent`, `client_ip`,
`waf_action`, `waf_rule_id`, `project_name`).

**"External API Requests" on the billing page means Neon.** It was 66.6% of all observability
events during the scrape, and grouping by `request_hostname` returned exactly one value:
`api.us-west-2.aws.neon.tech`. Not Spotify, not PSN. That is what makes the round-trip count in
`getShelfBundle` a billing decision and not a tidiness one.

**`aggregation: "sum"` is not the default and forgetting it reads as ZERO, not as an error.** Every
value metric (`function_cpu_time_ms`, `function_duration_gbhr`, `fdt_total_bytes`,
`peak_memory_mb`, the ISR byte counts) defaults to `avg`, so the response field comes back named
`..._avg`. Code that reads a `..._sum` key it built by string manipulation gets `undefined`, scores
it as 0, and prints a confident "0.00 CPU-hours" for a site that ran functions all day. That is
exactly what the first pass of the 2026-08-25 sweep reported. Pass `aggregation` explicitly and
assert the field name is present in the response before summing it.

**Baseline as of 2026-08-25, so a future session can tell drift from noise.** Measured over a clean
13-hour window with the scraper blocked, projected to a month, against the Hobby allowances that
matter because that is where this account is going:

| Resource | Projected / month | Hobby allows |
|---|---|---|
| Active CPU | ~1.0 CPU-hr | 4 |
| Function invocations | ~33,000 | 1,000,000 |
| Provisioned memory | ~7 GB-hrs | 360 |
| Fast data transfer | ~0.8 GB | 100 GB |
| Image transformations | ~111 | 5,000 |

Function error rate at that point was 9 non-200s out of 26,225 invocations in 24 hours. If a later
sweep shows Active CPU climbing, look at `vercel.function_invocation.function_cpu_time_ms` grouped
by `route` first: on 2026-08-25 a single route, `/`, was 67.1% of the whole account's CPU, and the
fix was its `revalidate`, not its code.

## Posture rules (load-bearing)

- **No CMS.** Content lives in TS/JSON files in this repo.
- **No "Hoodii" branding.** His name plus the domain. No Hoodii logos, no Hoodii Inc framing.
- **Voice is "I" (first person).** Personal site, not a company.
- **No em dashes.** Zero tolerance, per `feedback_copy_no_ai_tells`.
- **Honest states only.** A card for an app that is not here yet renders as a dashed, unlinked
  placeholder saying so. Never a link that 404s.
