---
audit: small apps (/health, /music, /curio, /french)
date: 2026-08-26
repo: C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site
mode: read-only, adversarial (Law 5, hunting named failures per app)
read-first: AGENTS.md, .agents/ENGINEERING.md, LanguageOS/CLAUDE.md + DESIGN.md, CuriosityOS/README.md
scope: src/app/{health,music,curio,french}/**, src/app/api/music/sync, src/lib/{music,health,curio,french}, content/{curio,french}, src/app/charts.css, vercel.json crons, src/proxy.ts gating for these routes
---

# Small apps audit: /health, /music, /curio, /french

Adversarial goals, per app: the catch that hides the token's death (/music), the stale number
presented as current (/health), the seeded card / readiness % / ungated write (/french), the
divergence a one-way mirror can accumulate (/curio). Findings below, grouped by app, severity first.

No P0 was found. All four write paths that exist are gated, no page bakes data at build time that it
claims is live, and nothing here can lose data unrecoverably except the one already-known /music
window, whose loss detection exists but is buried (M1).

---

## /music

### P1

**M1. A saturated run (plays known lost) is recorded and then shown to no one.**
- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\music\sync.ts` lines 58 to 63 and 80; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\music\db.ts` lines 123 to 142; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\music\page.tsx` lines 92 to 103.
- Evidence: sync.ts pushes `'this run added the full 50-item maximum, so listening outran the poll interval and some plays were almost certainly lost...'` into `warnings`, then `recordSync({ ok: true, ..., error: warnings.join(' | ') || null })`. But `getLiveness()` reads the error column only from failed rows: `select ran_at, error from music_sync where ok = false order by ran_at desc limit 1`. The page's alarm fires only on `now.broken || summary.liveness.stale`. The cron route returns 200 for this run, so Vercel shows a healthy cron too.
- Why: the exact event the poll interval exists to prevent (heavy listening exceeding the 50-play window between crons, the question this audit was told to ask) lands in a database column nothing reads, so a run that provably lost plays looks like a quiet evening everywhere a human looks. This is the half-extracted-export class: a partial capture presenting as a complete one.
- Fix: extend `getLiveness()` to also select the newest `ok = true` row's `error` (call it `lastOkWarning`), and render it on /music as its own notice ("the last run hit the 50-play ceiling, some plays between runs were lost") plus in the hub row's `sub`. Optionally add a fourth cron at that point, as the warning text already suggests.
- Verify: `insert into music_sync (ran_at, ok, plays_added, tops_added, error) values (now(), true, 50, 0, 'this run added the full 50-item maximum...')`, load /music and `/`, see the notice; delete the row after.

### P2

**M2. A public force-dynamic page spends ~18 Neon round trips plus two live Spotify calls on every anonymous request.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\music\page.tsx` lines 5 and 65 to 75.
- Evidence: `export const dynamic = 'force-dynamic'` and the render awaits `getSummary()` (3 queries), `getRecentPlays` (1), `getMostPlayed` (2), and `getLatestTop` twelve times (2 queries each, 3 ranges x 2 kinds = 12 calls = 12 queries because each does a max() then a select), plus `nowPlayingSafe()` which POSTs the Spotify token endpoint and GETs currently-playing per page view.
- Why: AGENTS.md's own billing lesson ("count round trips, not work", `getShelfBundle`) applies verbatim; and every drive-by visitor triggers a Spotify token refresh, which both adds latency and lets page traffic consume the API quota the collector depends on.
- Fix: batch the Neon reads into one `sql.transaction` (the twelve top queries collapse to two: latest day per (kind, range) in one query, entries in one); either accept the per-request Spotify call as the price of a live now-playing or move now-playing to a small client fetch against the existing `/api/spotify` so the document itself can carry `revalidate = 60`.
- Verify: `MSYS_NO_PATHCONV=1 vercel api /v2/observability/query` on `vercel.external_api_request.count` grouped by `origin_route` before and after; /music should drop to 1 to 2 per hit.

### P3

**M3. A transient Spotify failure during a page view renders as "The collector is not working."**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\music\page.tsx` lines 92 to 103. `now.broken` (a failure of the render-time now-playing probe, e.g. a 429 caused by page traffic itself) triggers the same alarm text as collector staleness, including "Plays are being lost", which may be false: the last cron may have succeeded an hour ago. Split the copy: token/auth errors deserve the alarm, a transient API error at render time deserves only the "Cannot tell" line it already has at line 124.

**M4. `lastError` can be an ancient, already-recovered failure.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\music\db.ts` lines 126 to 128: the newest `ok = false` row ever, with no "since the last success" bound. If staleness fires because runs stopped arriving entirely, the alarm prints an unrelated old error as the explanation. Bound it: `and ran_at > (select max(ran_at) from music_sync where ok = true)`.

**M5. Items without a track id are silently dropped from the plays fetch.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\music\spotify.ts` line 143: `if (!t?.id || !t.name || !item.played_at) continue;`. Local files and some podcast rows have no id; they vanish with no count. Cheap fix: count skips and include them in the sync warnings. Also the comment in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\api\music\sync\route.ts` line 16 says "four Spotify calls per hit"; the real number is eight (token + recently-played + 6 tops).

### Verified links of the death-visibility chain (all hold)

- `src/lib/music/spotify.ts` throws on every failure path, `getAccessToken` names the 180-day expiry in its error (lines 89 to 100), and the file forbids the catch-and-default in its header.
- Every run writes a `music_sync` row: success at sync.ts line 80, failure at line 86 (best-effort, with the honest comment that a dead Postgres cannot be reported to Postgres).
- The cron route refuses when `CRON_SECRET` is unset (500) AND when the header is wrong (401), and returns 500 on a failed sync so Vercel's cron dashboard shows red (route.ts lines 18 to 35).
- 36-hour staleness shouts on /music (page.tsx line 92) and on the hub (`src/app/page.tsx` lines 292 to 301), and "never ran" counts as stale (db.ts line 139).
- A 429 or partial failure on the plays fetch throws before any write, so a partial sync records `ok = false` and cannot look like a quiet evening. Dedupe is `played_at` as PRIMARY KEY (`content/music/schema.sql` line 19) with `on conflict do nothing`, so overlapping windows between the three crons (07:00, 15:00, 23:00 UTC, exactly 8 hours apart in `vercel.json`) can double-fetch but never double-count. The only loss mode is the >50-plays-per-window one, which is detected (sync.ts line 58) but buried (M1).

---

## /health

### P2

**H1. The same 120-day series query runs twice per render.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 19 to 20: `getBodyCompSeries(120).then(...kg...)` and `getBodyCompSeries(120).then(...bf_pct...)` are two identical Neon queries whose results are filtered differently in JS.
- Why: pure duplicate round trip, the getShelfBundle lesson in miniature; ISR at 1800 keeps the cost small, which is why this is P2 not P1, but it is one fetch doing the work of two.
- Fix: call once, derive both arrays from the one result. While there, `getBodyCompSummary` plus adherence plus liveness is 10 round trips per regeneration; a single `sql.transaction` would carry all of them.
- Verify: `rg getBodyCompSeries src/app/health/page.tsx` shows one call; typecheck passes.

### P3

**H2. The trend line is hardcoded "down" and painted in the good colour whichever way the weight moves.**
- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` line 82: `<div className="stat-d down">{trendLine(bodySummary.trend30)}</div>`; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\health.css` line 67: `.health .stat-d.down { color: var(--signal); }`.
- Why: a +0.4 kg/wk regain would render in --signal, the colour this site reserves for a value that is true and good right now. Fix: apply `down` only when `trend30.kg < 0`. Verify: temporarily invert the sign in dev data or read the class logic in a unit-less check.

**H3. The "today" ring on the adherence strip uses UTC.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\HealthCharts.tsx` line 264: `const todayStr = new Date().toISOString().slice(0, 10)`, while the strip's day cells come from `src/lib/day.ts` (Calgary). From about 18:00 Calgary the UTC date is tomorrow, no cell matches, and the ring silently disappears every evening. Fix: pass the server-computed Calgary `today()` down as a prop. Verify: set system clock past 18:00 local or compute both strings at 19:00 and compare.

**H4. `trend90` is computed (one extra query) and never rendered.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` line 87 computes both; `page.tsx` renders only `trend30`. Either render it or stop querying it.

**H5. The hub Health row does not reflect sync liveness.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx` lines 160 to 186: `healthRow()` checks only measurement staleness (14 days). Between 36 hours and 14 days of a dead mirror, the hub shows the weight with `.live` and "as of {date}" while /health itself is shouting "Not syncing". The date is printed, so this is drift not a lie, but the two surfaces disagree about the same condition. Cheap fix: reuse `getSyncLiveness()` in the row and drop `.live` when the mirror is stale.

### What was hunted and NOT found on /health

- **The stale number presented as current: defended twice over.** `getSyncLiveness()` (`src/lib/health/db.ts` lines 106 to 124) reads `health_sync`, which `content/health/sync.mjs` writes on every run including failures (its line 402), and the 07:15 task logs a pointed WARN if the script is missing. If the laptop pipeline stops entirely, no new ok row arrives, `hoursSince` grows past 36, and the page renders the "Not syncing... Everything below is whatever it held at that point" banner (page.tsx lines 48 to 58). A separate banner distinguishes "mirror dead" from "he has not weighed in" (lines 60 to 68), which is exactly the two-conditions-one-sentence failure the comment names.
- **No mixed-definition aggregate.** The swim minimum-over-a-mixed-column lesson is honoured by removal: /health renders no swim number at all, it links to /swim (page.tsx lines 115 to 126).
- **No restated body numbers.** No protein target, no lean mass, nothing typed; weight and bf come straight from `health_body_comp` per render, and the smoothing (median of last 5 Watch readings) matches `HealthOS/server/publish-current.mjs`'s method by declared intent. The 14-day threshold is one constant shared in spirit with CURRENT.md (`STALE_AFTER_DAYS = 14`, db.ts line 24).
- **The strip cannot claim rest for a day it knows nothing about**: `known` vs `unknown` hatching, the `logged && !trained` fourth state, and the horizon derived from all session kinds, all present with their incident notes (HealthCharts.tsx lines 277 to 316, db.ts lines 137 to 168).
- **Charts at 390px**: the measured-width viewBox (HealthCharts.tsx header comment, lines 19 to 44) makes labels render at their stated 10.5 to 12px on a phone instead of 6.1px, with `min-height: 160px` reserved against hydration jump in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\charts.css` line 21.
- **charts.css (shared with /swim)**: no defects found from the /health side; every rule is duplicated across `.health` and `.training` selector pairs, so a third consumer or a rename must touch every line. Coordinate with the swim agent before any change there.

---

## /french

### P1

**F1. The French "day" is UTC, so every honest number on the page bends after 18:00 Calgary, and the new-card ceiling is a 24-hour ceiling that resets at dinnertime.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\french\db.ts` line 22: `const today = (): string => new Date().toISOString().slice(0, 10);`. Also `getQueue`'s `x.first_seen::date` (line 123, a UTC cast on Neon), `getActivity`'s `now() - interval '365 days'` (line 285), and the client strip in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\french\FrenchClient.tsx` line 267 (`toISOString().slice(0, 10)`).
- Evidence that this exact class is known and solved in this repo: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\day.ts` exists because "after 18:00 a session logged an hour ago reads as belonging to yesterday" (its header, describing the gym row incident of 2026-08-14). /health and /gym use it; /french does not.
- Why it lies: (a) `NEW_PER_DAY = 12` is documented as "a hard ceiling, not a suggestion" (db.ts line 18, DESIGN.md rule 6), but the day it caps runs 18:00-to-18:00 local, so a sitting at 17:00 and another at 18:30 the same evening can introduce 24 new cards in one calendar day, which is the wall-of-cards failure this app exists to prevent, at half scale. (b) "N reviewed today" (FrenchClient.tsx line 261) shows last evening's reviews as today's every morning. (c) The streak collapses two Calgary days into one row when he reviews Monday 19:00 (stamped Tuesday) and Tuesday 17:00 (also Tuesday), undercounting a real 2-day streak, on a page whose design rule is "honest numbers only".
- Fix: import `today`/`dayOf` from `@/lib/day` in `src/lib/french/db.ts`, change the introduced-today comparison to `(x.first_seen at time zone 'America/Edmonton')::date = ${today()}`, and pass the Calgary today into FrenchClient for the strip (or compute cells with the same Intl formatter). No schema change: `french_days.date` is text and existing rows stay as they are.
- Verify: after 18:00 Calgary, rate one card on a dev DB copy, then GET `/french/api/summary`: `reviewedToday` must be 1 and `french_days` must hold a row for the Calgary date, not tomorrow's.

### P2

**F2. Card provenance is a prose rule at the only intake.**
- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\french\api\cards\route.ts` lines 7 to 10 ("This route does not and must not decide what counts as a legitimate card; that discipline lives in the caller"); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\french\db.ts` lines 72 to 98 accepts cards whose `book`, `chapter` and `page` are all null.
- Why: DESIGN.md rule 7 says every card traces to a real page and the source renders on the card back; the meta-law says a rule without a mechanism is decoration, and both prior deaths of this project came from content entering that no page had earned. The cookie limits WHO can post, not WHAT.
- Fix: in `addCards`, reject (count into a returned `rejected`, or 400 the whole batch) any card that resolves to null `book` or null `page` after merging `source` and per-card fields. `scripts/ingest-page.mjs` and the documented in-session flow always supply them, so nothing legitimate breaks.
- Verify: `POST /french/api/cards` (with the cookie, against a dev copy, never production) with `{"cards":[{"front":"x","back":"y"}]}` expects a refusal.

**F3. A public force-dynamic page spends ~11 Neon round trips per request, including a full-table streak scan.**
- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\french\page.tsx` line 5; `src/lib/french/db.ts` lines 241 to 279 (`getSummary` is 8 queries plus `getStreak`, which selects every reviewed day ever) plus `getActivity`.
- Why: force-dynamic is right for a live queue, but every anonymous hit pays the whole fan-out; External API Requests means Neon on this account. Fix: one `sql.transaction` for the summary set, and compute the streak in SQL over a bounded window (`date >= today - 400 days` is enough for any streak the page would show). Verify with `vercel.external_api_request.count` grouped by `origin_route`.

### P3

**F4. The Review button can overstate the queue.** `queueSize: Math.min(dueNow + Math.min(unseen, NEW_PER_DAY), MAX_QUEUE)` (`src/lib/french/db.ts` line 270) ignores `introducedToday`, so after a morning sitting that used the new-card budget, the button says "Review 12" and the overlay opens with fewer. Subtract the same introduced-today count the queue uses.

**F5. An "Again" card re-enters the sitting with stale button previews.** `advance` re-appends the fetched card object (FrenchClient.tsx line 163), so its `preview` intervals are from before the server rescheduled it; the second showing's Again/Hard/Good/Easy labels are slightly wrong. Either use the `reviewCard` response (already returned by the API) to refresh the card, or drop the preview on requeued cards.

**F6. The activity strip's values are unreachable on the phone.** 56 cells at 16px with `title` tooltips only (FrenchClient.tsx line 412, `.strip` in globals.css): title never fires on touch. Polish, same class as the health strip's aria-labelled buttons, which do it right.

### The named violations hunted and NOT found on /french

- **No seeding, anywhere.** The only card intake is the cookie-gated POST (route comment and DESIGN rule 1 restated in `content/french/schema.sql` lines 9 to 11); the schema seeds exactly one row, the `french_state` singleton. No import script, no starter deck, no route that generates French. `addCards` preserves FSRS state on re-ingest so a re-photographed page cannot reset progress.
- **No readiness percentage, no projected CLB.** Grepped page, client, all seven routes, db, fsrs: the only percent-like number anywhere is FSRS's internal `DESIRED_RETENTION = 0.9`, never rendered. The tagline shows counts and "learned" is the stated stability >= 21d threshold.
- **One page.** No second surface; the review overlay is a layer, not a route.
- **Write gating verified in BOTH places** (the 2026-08-26 lesson): `src/proxy.ts` line 73 names `/french/api` in the prefix check and line 101's matcher `'/french/:path*'` covers it. GETs (summary, queue, activity) pass; POSTs (review, cards, chapter, exam) need the cookie. `canEdit` in `src/app/french/page.tsx` line 21 is presentation only and says so.
- **The queue is honest about a missed day.** Due cards order by `next_review_at` and always precede new; FSRS computes retrievability from real elapsed days, a lapse comes back tomorrow (`fsrs.ts` line 133), and there is no punishment state; `MAX_QUEUE` caps the sitting. The introduced-today count uses first-review dates, not `reps = 1`, with the leak it prevents documented (db.ts lines 118 to 124).
- **Writes report outcomes.** `post()` checks `res.ok`, nothing advances or clears on a refused write, refusals queue per-kind in a list (the overwrite bug is documented at FrenchClient.tsx lines 75 to 81), and SaveBlocked retries after unlock.

---

## /curio

### P2

**C1. The mirror only ever grows: an edited or deleted ledger row survives in Neon forever.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\curio\sync.mjs` lines 36 to 45 (`idFor` keys on the question text) and 84 to 96 (upsert only, no delete).
- Evidence: change one word of a question in `C:\Users\sneyr\Desktop\HOODII\CuriosityOS\log.md` and the next sync inserts a new id while the old row stays; /curio then publicly shows both versions, and `summary.items` drifts above the ledger's row count. Retiring a row hides it (`getItems` filters `status <> 'retired'`) only if the row still exists in log.md to carry the status; a row deleted from the ledger is unreachable forever.
- Why: this is the divergence a one-way mirror accumulates; the page's count ("N answered") becomes a claim the source no longer supports.
- Fix: after the upsert loop, delete `curio_items` rows whose id is not in the parsed set, guarded like `HealthOS/guard-regen.mjs`: refuse if the delete would remove more than, say, 20% of existing rows (protecting against a broken parse masquerading as mass deletion, see C2).
- Verify: edit a question's wording in a scratch copy of log.md, run sync against a dev database, confirm old id is gone and count matches the ledger.

**C2. A partial parse writes cleanly and looks complete.**
- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\curio\sync.mjs` lines 52 to 55: `if (cells.length < 8) continue;` and the date-shape check drop malformed rows silently; the only guard is `if (!items.length) throw` (line 82).
- Why: a column added to log.md, or a formatting slip in half the rows, syncs the surviving half with a success line, which is exactly the 2026-08-26 half-extracted-export class AGENTS.md documents: correct-looking data, silently starved. `fetch-award-sources.mjs` already encodes the right rule ("refuses to write a source whose parse dropped more rows than it kept").
- Fix: count candidate lines (rows starting with `|` carrying a date-like first cell OR simply all `|` rows minus 2 header lines) and refuse when parsed/candidates falls below a floor; also refuse when parsed count < current `curio_items` count (rows should only grow) without a `--force`.
- Verify: append a 7-cell row to a scratch ledger and run against a dev database: exit non-zero.

**C3. Nothing shouts when the mirror stops being written.**
- Files: `C:\Users\sneyr\Desktop\HOODII\CuriosityOS\digest\run-curiosity.ps1` lines 106 to 113 (`WARN: curio sync exit ...`, non-fatal, log nobody reads); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\curio\page.tsx` lines 112 to 117 (the "that job has stopped" line renders only when the table is EMPTY).
- Why: once content exists, a dead sync or dead digest job produces a page that keeps rendering yesterday's archive with no aging signal beyond the small "latest {day}" the reader must compute against today. /health and /music both earned a 36-hour shout; /curio has the data for one (`summary.latestDay`) and does not use it. Unlike /music the loss is recoverable (log.md keeps accumulating), which is why this is P2 not P1.
- Fix: in `src/app/curio/page.tsx`, when `summary.latestDay` is older than ~3 days, render one line in the mornings section: "No morning since {day}. The daily job or its sync has stopped; the ledger on the laptop is unaffected." No new table needed.
- Verify: with `latestDay` mocked to last week, the notice renders; with yesterday's date it does not.

### P3

**C4. Unverified rows publish unmarked, and two fetched fields are dead.** `getItems` in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\curio\db.ts` returns `sourceKind` and `sentCount` and the page renders neither; rows whose Source is `verify` (checked only before a digest ships, per `C:\Users\sneyr\Desktop\HOODII\CuriosityOS\README.md`) appear on a public page indistinguishable from verified ones. Cheap fix: a small "unverified" tag when `sourceKind === 'verify'`, and drop `sentCount` from the query if unused.

### What is right on /curio

- Truly read-only: no `/curio/api` exists at all, stated and true (`src/lib/curio/db.ts` lines 3 to 4).
- The ReadLater `pile` is deliberately not mirrored, with the concrete leak it prevents written into `content/curio/schema.sql` lines 6 to 10 (the job-search signal the hub was built without). Checked: sync.mjs never reads `d.pile`.
- Rendering mode fits the data: `revalidate = 3600` on a page whose store changes at most daily; 3 queries per regeneration, not per request.
- Growth is handled: both the mornings and the ledger fold behind native `<details>` past 6 and 12 entries (the 28,000px page is documented in the comments), content stays in-document for find-in-page.
- Honest empty states for both sections, each naming what an empty state means.
- The sync is idempotent (upserts keyed on stable ids), refuses a zero-row parse, skips unparseable outbox JSON with a warning, and is wired into the same wrapper as the digest job so it runs when the data changes.

---

## Cross-cutting

- **Rendering modes are all defensible**: /music force-dynamic (liveness must not cache, but see M2 for the cost), /french force-dynamic (a live queue), /health 1800, /curio 3600. None is static-shaped-but-dynamic or the reverse; confirm in the build route table (`ƒ` vs `○`) whenever these change.
- **All four DB clients share the same env fallback chain** (APP_DATABASE_URL then GYM then KITCHEN) and throw at import when none is set; consistent and loud.
- **Login pages** (`/health/login` read; `/french/login` same shape) reuse the one `kos` cookie, httpOnly, secure in prod, one-year maxAge. The password check is a plain string compare, not constant-time; fine for this threat model, noted only so nobody upgrades the threat model without noticing.
- **One tokens quibble**: the /music collector alarm border is `var(--signal)` (`music.css` line 49) while /health's equivalent stale banner is `var(--destructive)` (`health.css` line 169). --signal is documented as "a value that is true right now"; a broken collector is the site's worst news. Pick one, probably destructive, for both.

## What is actually good

The /music death-visibility chain is complete and every link was verified in code, not prose: a
client that only throws, a sync that writes a row on every path, a cron that refuses without its
secret and 500s on failure, and two surfaces that shout at 36 hours including the never-ran case.
The /health page distinguishes four conditions most dashboards conflate (mirror dead, no recent
measurement, unknown day, rest day) and renders each differently, with the incident behind each
distinction written next to the code. /french is the cleanest rule-compliance surface audited:
both historical killers (seeding, readiness scores) are absent not because nobody added them but
because the code structure has nowhere for them to live, and the write path reports outcomes with
a per-kind pending queue. /curio's one deliberate omission (the ReadLater pile) has its privacy
reasoning stored in the schema file where the next agent will trip over it. Across all four, the
comments carry dated incidents rather than intentions, which made this audit checkable.

## Severity counts

| App | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| /music | 0 | 1 | 1 | 3 |
| /health | 0 | 0 | 1 | 4 |
| /french | 0 | 1 | 2 | 3 |
| /curio | 0 | 0 | 3 | 1 |
| **Total** | **0** | **2** | **7** | **11** |
