---
audit: /health, the training index
date: 2026-08-28
repo: C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site
head: 5151558
mode: read-only, adversarial (Law 5, hunting eight named failures). No edits, no build, no writes; one read-only Neon session
read-first: AGENTS.md (whole), .agents/ENGINEERING.md, HOODII/CLAUDE.md (body-metrics rule), docs/audits/2026-08-26/{04-reading,05-small-apps}.md
scope: src/app/health/** (page.tsx, HealthCharts.tsx, Week.tsx, Volume.tsx, layout.tsx, health.css), src/lib/health/**, src/app/charts.css, src/components/training/{LastSession,RecentSessions}.tsx as /health consumes them, src/lib/gym/{week.ts,session.ts,coverage.mts} as /health consumes them, content/health/{schema.sql,sync.mjs} and HealthOS/CURRENT.md only as far as they bound what /health may claim
out-of-scope: /gym, /swim, /run, /bike page code. Shared files (src/app/training.css, src/app/charts.css, src/lib/gym/week.ts, src/lib/gym/coverage.mts) are read and reported on, and every finding touching them is marked "shared file, coordinate"
warning: src/app/training.css was MODIFIED in the working tree during this audit by another session (git status showed ` M` and its line numbers moved by about 30 between two reads, and `.src > summary` went from 32px to 44px mid-pass). Line numbers cited for that one file are as-of-read and must be re-grepped by selector, not trusted
data-checked: health_body_comp (203 rows, 167 distinct days), health_watch_session, health_session_detail, health_sync, health_recovery, gym_set (all SELECT only)
severity-key: P0 data loss/leak/cost blowup; P1 lies or broken; P2 cost/debt/drift; P3 polish
---

# /health audit, 2026-08-28

Eight failures were hunted by name: a prose sentence the numbers beside it disprove, a stale number
presented as current, a timezone or day-boundary fault, a restated body metric, un-batched Neon
round trips, dead code, 390px and 44px failures, and a rule stated in a comment that nothing
enforces. Every one is answered below, including the four that held.

**No P0.** /health performs no write of any kind (no route under `src/app/health` except the login
form, no `/health/api`), so it cannot lose data. It reads one mirror and renders it. The cost shape
is real but bounded (P2-1, P2-7), not a blowup.

**Four P1s, and all four are the same disease in different organs: a label or a sentence wider
than the query behind it.** The page's numbers are almost all correct. What is wrong is what the
words next to them claim those numbers cover. That is precisely the /swim/deep failure AGENTS.md
records ("A SENTENCE CAN SIT THREE LINES ABOVE THE TABLE THAT DISPROVES IT"), and it survived
typecheck, lint, build and a full rendered-text dump the same way.

---

## P1

### P1-1. "Where the weight went" can print an impossible share of a change, and the trigger is losing weight while gaining lean mass, which is what the programme is for

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 144 to 156 (the computation) and lines 318 to 332 (the sentence).
- Evidence, the code:

  ```
  const fatShare = Math.abs(dKg) > 1 ? Math.round((dFat / dKg) * 100) : null;
  ```
  and, at line 329:
  ```
  lean{split.fatShare != null ? `, so ${Math.abs(split.fatShare)}% of the change was fat` : ''}.
  ```

  `dFat / dKg` is only a share while fat and lean move the same way as total weight. When lean mass
  moves the other way, `dFat` exceeds `dKg` and the ratio passes 100%; when fat moves the other way
  from total weight, the ratio goes negative and `Math.abs()` then prints it as a positive
  percentage of a change that went the opposite direction.

- Evidence, measured against the live `health_body_comp` table (203 rows, 167 distinct days after
  the page's own `distinct on (date)` Watch preference). Replaying the page's exact 120-day window
  ending on each historical reading: **165 windows produce a split, 148 of them clear the
  `Math.abs(dKg) > 1` gate and therefore print the sentence, and 23 of those 148 print an
  impossible share.** The full list, as the page would render it:

  | Window end | dKg | dFat | dLean | Sentence the page prints |
  |---|---|---|---|---|
  | 2023-06-16 | -6.1 | -6.2 | +0.1 | 101% of the change was fat |
  | 2023-08-18 | -1.1 | -1.6 | +0.4 | 141% of the change was fat |
  | 2023-12-13 | +2.9 | +3.5 | -0.6 | 120% of the change was fat |
  | 2024-01-06 | +2.9 | +3.3 | -0.3 | 112% of the change was fat |
  | 2024-02-03 | +1.3 | +2.3 | -1.0 | 175% of the change was fat |
  | 2024-02-10 | +2.6 | +3.4 | -0.8 | 131% of the change was fat |
  | 2024-04-13 | +1.4 | +2.6 | -1.2 | 186% of the change was fat |
  | 2024-04-20 | +1.2 | -0.6 | +1.8 | 53% of the change was fat (fat FELL while weight ROSE) |
  | 2024-04-27 | +2.0 | -1.4 | +3.4 | 71% of the change was fat (fat FELL while weight ROSE) |
  | 2024-05-04 | +1.8 | -1.0 | +2.8 | 55% of the change was fat (fat FELL while weight ROSE) |
  | 2024-05-25 | +2.7 | +2.8 | -0.1 | 103% of the change was fat |
  | 2024-06-01 | +2.8 | +3.0 | -0.2 | 106% of the change was fat |
  | 2025-04-14 | +5.3 | +6.7 | -1.4 | 127% of the change was fat |
  | 2025-04-29 | +5.1 | +6.6 | -1.5 | 130% of the change was fat |
  | 2025-05-12 | +5.5 | +6.9 | -1.4 | 125% of the change was fat |
  | 2025-06-13 | +2.3 | +5.5 | -3.1 | 233% of the change was fat |
  | 2025-06-23 | +1.2 | -4.1 | +5.3 | 332% of the change was fat (fat FELL while weight ROSE) |
  | 2025-07-14 | -2.6 | -6.0 | +3.4 | 233% of the change was fat |
  | 2025-07-22 | -3.3 | -5.9 | +2.6 | 180% of the change was fat |

  (plus four windows printing single-digit shares off a negative ratio: 2023-09-25, 2023-10-16,
  2024-01-27, 2024-04-06, where the arithmetic is wrong but the printed number happens to look
  small.)

- **Evidence that this is live today, not historical.** Today's 120-day window is 2026-05-06 to
  2026-08-24, dKg -8.2, dFat -8.0, dLean -0.2, share 98%, which is why nobody has seen it. But the
  SAME TAB, eleven lines higher at page.tsx line 274, already renders a 34-day trend: "vs
  2026-07-21 (34 d)". Run the split formula over that window, the one the page itself prints beside
  it: 2026-07-21 kg 108.0 / fat 35.10 / lean 72.90, 2026-08-24 kg 103.7 / fat 29.98 / lean 73.72.
  dKg -4.3, dFat -5.1, **dLean +0.8**, share **119%**. `HealthOS/CURRENT.md` publishes the same
  window as "fat -3.5, lean +0.4" off its own smoothing, which is also over 100%. The impossible
  case is present in this month's data and is hidden only by the choice of 120 days.
- **And the window choice is not stable either.** Move the window start 13 days later, from
  2026-05-06 to 2026-05-19, and dKg is identical (-8.2, both readings are 111.9 kg) while the share
  swings from **98% to 75%**, because 1.9 kg of "fat" appears to vanish between those two
  bioimpedance readings. The headline number is a two-point difference and moves 23 points on which
  of two readings 13 days apart happens to be first in the window.
- Why it matters in his terms: he is cutting while lifting four days a week, and the whole point of
  the programme is to lose weight while keeping or gaining lean mass. **That outcome is exactly what
  makes this sentence lie**, and it lies in the worse direction: it prints a confident percentage
  attributing a loss to fat over a period when the split says something more interesting happened.
  Three of the 23 tell him a percentage of his weight GAIN was fat during a period when fat
  actually fell. He audits arithmetic and he is right to; this is the number on the tab that exists
  to answer "what is my body doing".
- Exact fix, and it eliminates the class rather than clamping the instance:
  1. Stop computing a share when the two components do not both move with the total. In
     `page.tsx` line 154, replace the single `fatShare` with a discriminated result:
     `Math.sign(dFat) === Math.sign(dKg) && Math.sign(dLean) === Math.sign(dKg)` is the only case
     in which "N% of the change was fat" is a true sentence. Return
     `{ kind: 'share', pct }` there, and `{ kind: 'opposed' }` otherwise.
  2. In the `opposed` case say what actually happened, which is the more useful sentence anyway:
     "your weight fell 4.3 kg while lean mass ROSE 0.8 kg, so more than all of the loss came off
     fat mass". The two deltas are already rendered at lines 327 and 328; the share clause is the
     only part that has to go.
  3. Delete the `Math.abs()` at line 329. A percentage that needs an absolute value to look
     printable is a percentage that should not be printed.
- Verification step: add a pure unit for the split (there is no test file under `src/app/health`
  today) and assert the four sign combinations. Then, without a test, replay it against live data
  read-only: for each of the 19 window ends in the table above, the page must render an "opposed"
  sentence and never a percentage above 100 or below 0. Concretely, `node` a script that reads
  `health_body_comp`, rebuilds the page's window for `2025-06-23`, and asserts the rendered clause
  does not contain "332".
- Not P0: nothing is lost or leaked and nothing costs money. It is the single most important
  finding on this page.

### P1-2. "Fat mass plus lean mass equals weight exactly, so this is arithmetic rather than a model" is a tautology sold as evidence, and the caveat five lines below contradicts it

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` line 330, against lines 347 to 352 on the same screen; also the same claim in the source comment at lines 140 to 143 ("it is exact arithmetic rather than a model: fat mass plus lean mass equals weight to the decimal on every row (29.98 + 73.72 = 103.70, checked)").
- Evidence: the identity is true and I re-checked it. Across all 197 rows carrying kg, fat_kg and
  lean_kg, `abs((fat_kg + lean_kg) - kg)` exceeds 0.05 on **zero** rows and exceeds 0.001 on
  exactly one (2025-05-12, off by 0.010, rounding). But the reason it is exact is that the columns
  are derived from one measurement: `fat_kg = round(kg * bf_pct / 100, 2)` holds on 196 of 197 rows
  and `lean_kg = kg - fat_kg` holds on **197 of 197**. There is one instrument reading behind the
  split (`bf_pct`, bioimpedance) and two arithmetic restatements of it.
- The page then says so itself, five lines later at line 348: "Neither line is measured directly.
  Both are inferred from a bioimpedance reading, a small current passed through the body, and that
  reading moves with how hydrated you were that morning."
- Why it matters in his terms: the sentence's job is to raise his confidence in the number, and it
  raises it by pointing at a fact that carries no information (lean is defined as weight minus fat,
  so of course they add up). It is doing that directly above the percentage in P1-1 and directly
  above the caveat that says the opposite. This is the corollary in `.agents/ENGINEERING.md`:
  "Fixing the mechanism behind a claim can invalidate the sentence next to it, and the sentence
  does not typecheck."
- Exact fix: delete the clause at line 330 outright. If something is wanted in its place, the true
  statement is the one the caveat already makes plus the derivation: "Body fat percent is the only
  thing measured here. Fat mass and lean mass are both computed from it, so they always add up to
  the weight." Correct the source comment at lines 140 to 143 in the same edit, because that comment
  is what would talk the next agent back into the sentence.
- Verification step: `grep -n "arithmetic rather than a model" src/app/health/page.tsx` returns
  nothing, and the rendered Weight tab contains no claim that the split is measured.

### P1-3. The attendance strip counts LIFTING only, under a caption that says the watch records every session, and draws three real training days as "rest" including in the screen-reader label

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` line 162; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 199 to 202, 223 to 241; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\HealthCharts.tsx` lines 297 to 315.
- Evidence, the query (`db.ts` line 162):
  ```
  sql`select distinct date from health_watch_session where kind = 'strength' and date >= ${cutoff}`,
  ```
  Its own JSDoc at line 155 is honest: "Per-day lifting attendance for the last N days". The page
  then drops the word. The summary at page.tsx line 225 reads
  `Attendance, last 30 days <span className="tag">({trainedCount} trained)</span>`, the cue at line
  228 reads "Read from the watch, which records every session: the gym app only sees sessions
  logged there", and the tab's lede at line 200 reads "Lifting, swimming, running and riding in one
  count, and how many days in a row you have trained."
- Evidence, live, replaying `getLiftingAdherence(30)` exactly (cutoff 2026-07-29, horizon
  2026-08-25): the strip renders "**17** trained, **16** also logged, 1 trained but unlogged".
  Distinct days in that window with ANY watch session: **20**. Three days the watch recorded a real
  session are drawn as empty rest cells:

  | Date | What the watch actually recorded | Strip cell | aria-label the strip emits |
  |---|---|---|---|
  | 2026-08-24 | running 40m, other-auto 12m | empty | `2026-08-24: rest` |
  | 2026-08-21 | swimming 33m + 7m + 19m (59 min) | empty | `2026-08-21: rest` |
  | 2026-08-07 | swimming 43m | empty | `2026-08-07: rest` |

- Evidence that the same tab disagrees with itself: "What actually happened" (page.tsx line 212,
  `ActualDays` from `src/lib/gym/week.ts` line 235, where `trained = sessions.length > 0 ||
  isLogged` across every kind) shows 2026-08-21 as "swim 33m, swim 7m, swim 19m" and 2026-08-24 as
  "run 40m, movement the watch noticed 12m". Scroll one block down, open Attendance, and the same
  two days are blank cells labelled rest. A fourth day, 2026-08-27, is a day he logged in the gym
  app that the watch has no strength row for: the strip draws it `logged-only` and the legend adds
  a key for it, but it counts in neither number in the sentence, so "16 also logged" understates
  the app's own record (gym_set has 17 days in the window).
- Why it matters in his terms: this is the exact defect the code above it says it fixed. The
  comment at HealthCharts.tsx lines 288 to 296 says "An empty cell used to mean 'rest' whether he
  rested or the export simply had not reached that day ... Both the picture and the screen reader
  asserted a rest day on a day he trained. Found by an adversarial pass on 2026-08-14." That pass
  closed the `known` hole and the `logged && !trained` hole. It did not close the kind filter, so
  the picture and the screen reader still assert a rest day on a day he swam for 59 minutes. And
  `trainedCount` wears `className="live tnum"` (page.tsx line 229), the one chromatic colour this
  site reserves for a value that is true right now.
- Exact fix, and it is the same edit as P2-1 so do them together. Delete
  `getLiftingAdherence` and derive the strip from the block `getTrainingWeek` already fetched:
  1. Widen `actualBlock` in `src/lib/gym/week.ts` from 28 days to 30 (shared file, coordinate: /gym
     and the hub call `getTrainingStreak`, which takes `days` as a parameter and defaults to 28, so
     pass 30 from /health rather than changing the default).
  2. `ActualDay` already carries `date`, `trained`, `logged`, `known` and `sessions`. Map it
     straight into `AdherenceCell`. The strip then means "trained at anything", which is what its
     caption already claims and what the tab's lede promises.
  3. If a lifting-only strip is actually wanted, then the label must say it: "Lifting attendance,
     last 30 days", and the cue must stop saying "every session". Do not do both halves: two
     definitions of `trained` on one tab is the drift, not the wording.
  4. Delete `getLiftingAdherence` from `src/lib/health/db.ts` (lines 155 to 191) once nothing calls
     it. The `AdherenceDay` type in `src/lib/health/types.ts` lines 48 to 55 goes with it, since
     `AdherenceCell` in HealthCharts.tsx lines 256 to 261 is the same shape declared twice.
- Verification step: load `/health?s=now`, open Attendance, and confirm the cell for 2026-08-21
  carries `aria-label="2026-08-21: trained, not logged"` rather than "rest", and that the count in
  the summary equals the number of non-rest rows in "What actually happened" over the overlapping
  fortnight. Read the counts out of the DOM, not the source.

### P1-4. "Your last session" on the training index is the last LIFT, and his actual last session was a swim

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 122 and 207 to 208; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\LastSession.tsx` lines 32 to 34; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\RecentSessions.tsx` lines 152 to 155 (shared files, coordinate: /swim, /run and /bike draw the same two components).
- Evidence, the code: `const recentLifts = sub === 'now' ? await getRecentSessions('strength', 10) : [];`
  feeding `<LastSession s={lastLift} />`, whose heading is
  `Your last session <span className="tag">({shortDate(s.date)})</span>`, and
  `<RecentSessions sessions={recentLifts} kind="strength" />`, whose heading is
  `The last {sessions.length}`. Neither string contains the word lifting, and the page passes no
  label.
- Evidence, live: the newest three rows of `health_session_detail` by `start_time` are
  `2026-08-25 swimming 29m (start 2026-08-26 02:56:55)`, `2026-08-25 strength 103m (start
  2026-08-26 00:37:45)`, `2026-08-24 other-auto 12m`. The page renders "Your last session (Aug 25)"
  over the 103-minute lift, its heart-rate trace, and the verdict "76% of this session was under
  110 bpm". His last session was the swim that started an hour and a half after the lift finished.
- Why it matters in his terms: /health is THE TRAINING INDEX as of 2026-08-27 and its own lede two
  lines above names four disciplines. A block called "Your last session" on that page is a claim
  about all four. This is the same class as the "Best this year" tile over a date from the previous
  September that AGENTS.md records from /swim/deep, and AGENTS.md's own description of this tab
  already uses the right word: "last lift, the last ten lifts trended".
- Exact fix: add an optional `label` prop to `LastSession` and `RecentSessions` (default to today's
  strings so /swim, /run and /bike are untouched) and pass "Your last lift" and "The last 10 lifts"
  from `/health`. Cheaper alternative with no shared-file change: wrap both in the existing
  `.exgroup` pattern with an explicit heading, but the prop is the honest fix because the component
  is the thing making the claim.
- Verification step: fetch `/health?s=now` and grep the rendered HTML for "Your last session". It
  must not appear; "Your last lift" must, and the date beside it must equal the newest `strength`
  row in `health_session_detail`.

---

## P2

### P2-1. Nine un-batched Neon round trips on `?s=now`, three of them redundant, behind four sequential await barriers

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 100, 102 to 105, 111 to 122, 129 to 132, 160; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\week.ts` lines 201 to 212 and 329 to 332 (shared file, coordinate); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` lines 161 to 169 and 128 to 131; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\session.ts` lines 100 to 109.
- Evidence, counted from the code, per sub-tab, per request (the page is `force-dynamic`, page.tsx
  line 39, so nothing is amortised):

  | Sub-tab | Neon round trips | Where |
  |---|---|---|
  | `?s=now` | **9** | getSyncLiveness 1; actualBlock 3; health_recovery 1; getRecentSessions 1; getLiftingAdherence 3 |
  | `?s=weight` | **6** | getSyncLiveness 1; getBodyCompSummary 3 (latest, last-5 Watch, prior); getBodyCompSeries 1; getWatchComposition 1 |
  | `?s=plan` | **5** | getSyncLiveness 1; actualBlock 3; health_recovery 1 |
  | `?s=volume` | **1** | getSyncLiveness only. The coverage arithmetic reads two JSON files off disk, as its comment says |

- Evidence, the redundancy on `?s=now`. Two of the nine are byte-identical queries issued twice in
  one render:
  - `select max(date) as last from health_watch_session` at `week.ts` line 211 and at `db.ts` line 168.
  - `select distinct date from gym_set where done = true and reps is not null and reps > 0 and date >= $1`
    at `week.ts` line 206 (cutoff 28 days) and `db.ts` line 163 (cutoff 30 days). Same query,
    different constant.
  And the third: `select date, kind, coalesce(minutes,0)::int as minutes from health_watch_session
  where date >= $1` (week.ts line 202) is a strict superset of `select distinct date from
  health_watch_session where kind = 'strength' and date >= $1` (db.ts line 162) once the windows
  agree. **Unify the window and the whole `getLiftingAdherence` trio becomes zero extra queries**,
  which is also the fix for P1-3.
- Evidence, the waterfall. Lines 100, 105, 122, 160 are four separate `await` barriers in sequence
  on the `now` path: `sync`, then `week`, then `recentLifts`, then `adherence`. Nothing in that
  chain depends on the value of the previous step. AGENTS.md's own billing note: "Vercel bills
  Active CPU only while code runs, and Provisioned Memory for an instance's whole lifetime
  including time spent waiting on I/O ... Count round trips, not work." Four serial waits to
  us-west-2 is memory held open doing nothing.
- Why it matters in his terms: "External API Requests on the billing page means Neon", and it is
  this account's entire external bill. This is the shape `getShelfBundle` was written to remove,
  one import away.
- Exact fix:
  1. Do P1-3's merge first: `now` goes from 9 to 6 with no batching at all.
  2. Add `getHealthNowBundle()` to `src/lib/health/db.ts` sending the remaining lazy queries through
     one `sql.transaction([...], { readOnly: true })`, exactly the construction in
     `src/lib/reading/shelf-db.ts`. `now` goes to 1, `plan` to 1, `weight` to 1.
  3. Kick off `getSyncLiveness` concurrently with the tab's own reads rather than awaiting it
     first, or fold it into the same transaction.
- Verification step: `MSYS_NO_PATHCONV=1 vercel api /v2/observability/query -X POST --input body.json`
  on `vercel.external_api_request.count` grouped by `origin_route`, before and after. `/health`
  must fall to 1 to 2 per hit. Also `rg -n "sql\`" src/lib/health/db.ts` should show the transaction
  rather than a list of awaits.

### P2-2. The weight tile and the delta printed under it are computed from two different numbers, and the number the delta uses is returned and never shown

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 261 to 276; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` lines 80 to 102 and 110; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\types.ts` line 25.
- Evidence: the tile renders `{bodySummary.latest.kg?.toFixed(1)}` (line 265). The line directly
  beneath it renders `trendLine(bodySummary.trend30)`, and `trend30.kg` is
  `+(smoothedKg - prior.kg).toFixed(1)` (db.ts line 100), where `smoothedKg` is the median of the
  last five Watch readings (db.ts lines 80 to 86). Live today: `latest.kg` 103.7, `smoothedKg`
  104.7, `prior` 2026-07-21 at 108.0. So the tile says **103.7 kg** and the line under it says
  **"vs 2026-07-21 (34 d): -3.3 kg, -0.68 kg/wk"**, while 103.7 minus 108.0 is **-4.3**. The 1.0 kg
  gap is the smoothing, and nothing on the page says smoothing is happening.
- `smoothedKg` is returned in `BodyCompSummary` (db.ts line 110, types.ts line 25) and read by no
  consumer anywhere in `src/`: verified by grep, the only references are inside `db.ts` itself.
- Evidence that the right shape already exists elsewhere: `HealthOS/CURRENT.md` prints both, and
  says so out loud: "Measured against a **5-reading median of 104.7 kg**, not the single latest
  weigh-in, so one dry morning cannot bend the rate." The canonical file explains the basis; the
  page that draws the same two numbers hides it.
- Why it matters in his terms: he subtracts. A delta under a number that does not equal that number
  minus the stated date's number is the kind of small wrongness that costs trust in the whole tab,
  and the fix is a sentence, not arithmetic.
- Exact fix: render `smoothedKg` beside the trend, in the words CURRENT.md already uses: change
  `trendLine` (page.tsx lines 82 to 86) to take the summary and emit "vs 2026-07-21 (34 d): -3.3 kg,
  -0.68 kg/wk, against a 5-reading median of 104.7 kg". One line, and it turns a dead returned field
  into the thing that makes the delta legible.
- Verification step: on the rendered Weight tab, the tile value minus the prior date's stored kg
  either equals the printed delta, or the printed sentence names the median it used. Check against
  `HealthOS/CURRENT.md`'s Trend section, which must agree to the rounding.

### P2-3. The fat/lean split can take its two endpoints from two different instruments, and the two instruments disagree about fat mass by up to 2.45 kg on the same day

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` lines 34 to 43; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 144 to 156.
- Evidence: `getBodyCompSeries` is `select distinct on (date) ... order by date asc, (source = 'Watch') desc`,
  which prefers Watch **per date** and silently accepts a Scale row on a date with no Watch reading.
  The split then takes `both[0]` and `both[both.length - 1]` with no source condition.
- Evidence, the instrument gap. 36 days in `health_body_comp` carry both a Scale and a Watch
  reading. On those days the two sources agree about weight to a mean absolute 0.017 kg (worst
  0.050) and disagree about **fat mass by a mean absolute 1.015 kg, worst 2.450 kg** (2023-10-16:
  Watch 28.44, Scale 30.89). Lean mass carries the same gap with the sign flipped, since lean is
  weight minus fat.
- Evidence it fires: replaying the page's 120-day window across all 167 distinct days, **40 of 165
  windows have endpoints from different sources**, and **9 of the 23 impossible shares in P1-1 are
  mixed-endpoint windows**. Today both endpoints are Watch (2026-05-06 and 2026-08-24), so it is
  not firing right now. It will fire the next time he steps on the scale and not the watch at
  either end of the window: the most recent Scale row is 2026-07-21, which is inside the current
  window and is the endpoint the 34-day trend already uses.
- Why it matters in his terms: this is the `pace_per_100m_ms` lesson with different columns. A
  single figure computed over a column that carries two definitions will pick up the difference
  between the definitions and present it as a physical change. With `dKg` commonly 1 to 3 kg, a
  2.45 kg instrument artifact can be larger than the thing being measured, and it lands in the one
  sentence on the page that claims to be exact.
- Exact fix: make the mixing unrepresentable rather than checked. Either
  (a) require both endpoints of the split to carry the same `source`, by selecting `source` in
  `getBodyCompSeries` (it is not selected today) and walking inward until the pair matches, or
  (b) restrict the split to `source = 'Watch'` the way `getWatchComposition` already restricts its
  own three columns, with the same reasoning written in the same place (db.ts lines 45 to 50 is the
  model: "Filtering here rather than in the page means no caller can forget").
  Then state the endpoints' source on screen, since the page already draws the Scale/Watch
  distinction two sections down.
- Verification step: after the change, `select` the two endpoint dates the page renders and confirm
  both rows share a `source`. Replay all 165 historical windows and assert zero mixed pairs.

### P2-4. "The mirror has never recorded a successful update" is derived from the last 20 rows, so a pipeline broken for 20 runs prints "never"

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` lines 128 to 138; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 188 to 190.
- Evidence:
  ```
  select ran_at, ok, error from health_sync order by ran_at desc limit 20
  ...
  const lastOk = all.find((r) => r.ok) ?? null;
  if (!lastOk) {
    // No successful run on record at all, including the case where the table is empty.
    return { lastOkAt: null, hoursSince: null, stale: true, lastError: lastErr };
  }
  ```
  and the page prints "The mirror behind this page has never recorded a successful update."
- Why it matters in his terms: `health_sync` gets a row from the 07:15 daily task plus every manual
  run (the live table has three rows on 2026-08-27 alone), so 20 rows is a few days to a couple of
  weeks. "Never" is a claim about the whole history derived from a window, and it sends him looking
  for a setup problem when what he has is a regression. The comment even asserts the two cases are
  the same ("including the case where the table is empty"), which is the sentence that makes the
  bug invisible.
- Exact fix: stop paging. One query answers both halves without a window:
  `select (select max(ran_at) from health_sync where ok) as last_ok, (select error from health_sync where not ok and error is not null and ran_at > coalesce((select max(ran_at) from health_sync where ok), '-infinity') order by ran_at desc limit 1) as last_error`.
  Same one round trip, no `limit 20`, and it fixes P2-5 in the same expression.
- Verification step: against a scratch copy, insert 25 `ok = false` rows after a success and load
  /health. The banner must name the real last success date, not "never".

### P2-5. `lastError` is unbounded by the last success, so the staleness banner can explain a dead mirror with an error that was already recovered (the /music M4 class, unfixed here)

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` line 134: `const lastErr = all.find((r) => !r.ok && r.error)?.error ?? null;`, rendered at `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` line 193.
- Evidence, live: the newest `health_sync` rows are `2026-08-28 13:17 ok`, `2026-08-27 14:44 ok`,
  `2026-08-27 05:50 ok`, `2026-08-27 05:47 FAILED`, `2026-08-27 05:45 FAILED`. So `lastOk` is four
  hours old (not stale) while `lastErr` holds "swim-laps.json has 19328 usable rows but only 19327
  distinct (sessionUuid, lengthIndex) pairs ...". If the mirror stopped now, in 36 hours the banner
  would fire and print that swim-lengths message as the explanation, three successful runs after it
  was fixed.
- Why it matters in his terms: the banner's job is to tell him what to go and fix. An error from
  before the last success points him at the wrong thing, and this exact finding was already written
  up for /music as 05-small-apps M4 ("the newest `ok = false` row ever, with no 'since the last
  success' bound"). The class repeats across two surfaces, which per Law 5's corollary means the
  question is executable: **no liveness reader on this repo may report an error older than its own
  last success.**
- Exact fix: the subquery in P2-4 already carries the bound
  (`ran_at > (select max(ran_at) from health_sync where ok)`). Apply the same bound in
  `src/lib/music/db.ts` while the reasoning is loaded (out of scope here, name it in the handoff).
- Verification step: with the live table as it is today, `getSyncLiveness().lastError` must return
  null, because every failure on record predates the last success.

### P2-6. The comment that cost a day on the swim dates is still sitting, unqualified, above an exported `sql` handle that reaches every table in the database

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` lines 15 to 18:
  ```
  export const sql = neon(DATABASE_URL);

  // Calgary dates, not UTC ones: every row in these tables was stamped in local time. See lib/day.ts.
  const isoDaysAgo = (days: number): string => daysAgo(days);
  ```
- Evidence that this is the sentence: AGENTS.md, on the four-swim-date incident: "The comment above
  `getSwimHistory` asserted that 'every row in these tables was stamped in local time', which was
  true of the tables it was written for and **is why nobody looked**." The same assertion, in the
  same words, is still here. It is true of what this file queries today (`health_body_comp`,
  `health_sync`, `health_watch_session`, `gym_set`, all local). It is false of
  `health_swim_session` and `health_swim_length`, which are in the same Neon database and are
  reachable through the `sql` this file exports, which `src/lib/gym/week.ts` and
  `src/lib/gym/session.ts` both already import.
- Why it matters in his terms: 94 of 475 swim rows were a day out and it rendered for weeks with
  two figures about the same swim a screen apart. The mechanism that fixed it is
  `SWIM_LOCAL_DATE` in `src/lib/swim/db.ts`; the prose that hid it is still here, above the handle
  the next agent will reach for.
- Exact fix, and this is the P2 that should be done first because it is five minutes: name the
  tables. "health_body_comp, health_sync, health_watch_session and gym_set are stamped in Calgary
  local time. `health_swim_session` and `health_swim_length` are UTC and must not be keyed on
  `date`: use `SWIM_LOCAL_DATE` in src/lib/swim/db.ts. See AGENTS.md, four date columns." A rule
  that names its scope is a rule the next reader can check.
- Verification step: the comment names every table any caller of this module's `sql` currently
  queries, and states the exception. Grep for `from health_swim` under `src/lib/health` and
  `src/lib/gym`: it must return nothing, which it does today.

### P2-7. /health is force-dynamic, uncached, nine round trips a hit, emits four crawlable query-string links, needs no cookie, and is in neither the robots Disallow list nor firewall rule 3

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` line 39 (`export const dynamic = 'force-dynamic'`) and lines 65 to 80 (`SubNav`, four `<Link href={`/health?s=${t.id}`}>`); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\robots.ts` line 81 (`disallow: ['/kitchen/find', '/reading/shelf', '/reading/want']`).
- Evidence: the page scores three out of three on the shape AGENTS.md names as the one that costs
  money ("Any page that renders on every request, exposes its filter state as crawlable `<Link>`
  hrefs, and needs no cookie is a combinatorial URL space someone will walk"). It differs only in
  that the space is four values rather than combinatorial, and in that unknown `?s=` values fall
  back to the Now tab (page.tsx line 94), which is the **most expensive** of the four at nine round
  trips. `/health` is `noindex` (layout.tsx line 21), and robots.ts's own corrected addendum
  explains at length why noindex is not protection against a scraper.
- Why it matters in his terms: /reading/shelf took 178,000 invocations in twelve hours off exactly
  this shape, and the response was a firewall rule plus a nine-into-one transaction. /health is
  cheaper per hit than that page was, and it is not zero.
- Exact fix, in order of value: (1) P2-1's transaction, which drops the per-hit cost by 80% and
  makes the exposure academic; (2) keep force-dynamic, which page.tsx lines 33 to 37 argues for
  correctly (the streak must be true at the moment he looks, and a page reading a query parameter
  cannot be static anyway); (3) consider adding `/health` to the robots Disallow only if a log tail
  ever shows a walker, since the four URLs are all a person needs.
- Verification step: `MSYS_NO_PATHCONV=1 vercel api /v2/observability/query` on
  `vercel.function_invocation.count` grouped by `route` for `/health` over 24 hours. If it is above
  a few hundred, someone is walking it.

### P2-8. AGENTS.md's /health row says "Three sub-tabs" and lists four, and says the Weight tab draws all 8 body-composition columns when it draws 7

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` line 84; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 48 to 63.
- Evidence, quoted: "Three sub-tabs: Now (...), Weight (all 8 body-composition columns, not the 2 it
  drew before ...), Plan (...), Volume (...)". Four are described and the `TABS` array holds four.
- Evidence for the column count: `health_body_comp` has 11 columns, of which 8 are body
  composition: `kg`, `bf_pct`, `fat_kg`, `lean_kg`, `skm_kg`, `water_kg`, `bmr_cal`, `bmi`. The
  Weight tab draws seven. **`bmi` is populated on 203 of 203 rows**, mirrored by
  `content/health/sync.mjs` lines 89 to 100, and read by nothing in `src/`: verified by grep across
  the whole tree. `HealthOS/CURRENT.md` does publish it (BMI 32.7), so the data has a reader; this
  repo does not.
- Why it matters in his terms: this is the 04-reading P2-2 class. A doc that describes the code as
  it is not is instructions for a regression, and this row is the one a session reads before
  touching this page. "Three sub-tabs" invites deleting one; "all 8 columns" invites nobody to
  notice `bmi`.
- Exact fix: change "Three" to "Four" and "all 8 body-composition columns" to "seven of the eight
  body-composition columns (`bmi` is mirrored and drawn nowhere; `HealthOS/CURRENT.md` publishes
  it)". Then decide about `bmi`: either draw it beside body fat on the Weight tab, or drop it from
  the mirror in `content/health/sync.mjs`. A column written every run and read by nothing is the
  `reading_catalog_entry` shape.
- Verification step: every count in AGENTS.md line 84 matches something derivable from the code.
  `grep -c "id: '" src/app/health/page.tsx` in the TABS block returns 4.

---

## P3

### P3-1. Thirty 16px buttons that do nothing, carry their only label in a `title`, and take thirty tab stops

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\HealthCharts.tsx` lines 307 to 316; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\health.css` lines 113 to 122; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\globals.css` lines 420 to 425 (`.strip > * { width: 16px; height: 16px; }`, shared with /french).
- Evidence: `<button type="button" className={...} title={label} aria-label={label} />` with no
  `onClick`, styled `cursor: default`. 16px against the 44px tap floor that
  `src/app/training.css` line 39 states and that every other control on this page meets
  (`.subtab` 44, `details.ladder-all > summary` 44, `.src.wk` 44, all verified). `title` never
  fires on touch, so on the phone the state of a given day is unreachable: the cell cannot be
  tapped for it and cannot be hovered for it. health.css's own comment at lines 114 to 116 names
  the hazard and stops there: "a padded 16px button is an accident waiting for the day one of them
  gets a label."
- Why it matters in his terms: it is 30 keyboard stops on the way past a picture, and the fourth
  and fifth cell states (logged-only, unknown) are exactly the ones whose meaning he would want to
  check on a specific day. Same class as /french's F6 activity strip, which 05-small-apps flagged.
- Exact fix: these are not controls, so stop declaring them as controls. Render `<span
  role="img" aria-label={label}>` and put the reachable version where the phone can get at it: the
  legend already exists below the strip, so add the three most recent non-obvious days as text
  ("2026-08-27 logged in the app, the watch missed it"). If a tappable cell is genuinely wanted, it
  needs 44px and a real disclosure, which does not fit 30 cells at 390px, which is the argument for
  the text.
- Verification step: at 390px, tab through the Attendance block and count stops (should be 1, the
  summary). Read one cell with a screen reader and confirm the label still arrives.

### P3-2. `getSyncLiveness` types `ran_at` as a string while Neon returns a Date, and the staleness check fails OPEN

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\health\db.ts` lines 132 and 139.
- Evidence: the row is cast as `{ ran_at: string; ok: boolean; error: string | null }[]` and then
  `Date.parse(lastOk.ran_at)`. `health_sync.ran_at` is `timestamptz` (`content/health/schema.sql`
  line 81) and the Neon driver returns it as a JS `Date`: measured, `typeof r.ran_at === 'object'`.
  It works today only because `Date.parse` stringifies the Date and V8 re-parses its own
  `toString`.
- Why it matters in his terms: if that ever returns `NaN` (a driver config change, a switch to
  `timestamp without time zone`, a `fullResults` option), then `hoursSince` is `NaN`, `NaN > 36` is
  **false**, and the banner never appears. A dead mirror would then render as a healthy page, which
  is the one direction this check must not fail. The same NaN would print "NaN days ago" in the
  banner if staleness ever did fire.
- Exact fix: type it `Date | string` and go through one coercion that cannot silently produce NaN:
  `const t = lastOk.ran_at instanceof Date ? lastOk.ran_at.getTime() : Date.parse(String(lastOk.ran_at)); if (!Number.isFinite(t)) return { ..., stale: true, lastError: 'health_sync.ran_at could not be read' };`
  Fail closed, and say why.
- Verification step: force `ran_at` to an unparseable value in a scratch row and confirm the page
  shows the banner rather than a clean page.

### P3-3. The Weight tab never says its charts cover 120 days, and they carry no time axis, beside a trend labelled 34

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\page.tsx` lines 257 to 301; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\HealthCharts.tsx` lines 142 to 152.
- Evidence: `LineChart` draws a value axis (three ticks) and one endpoint label, and no date
  anywhere: the only date is inside the `aria-label` and the hover tooltip. The section heading is
  "Weight & body fat" and the captions are "Weight, kg" and "Body fat, %". Live, the window holds
  **13 readings across 120 days** with gaps of up to two months, drawn beside a line reading "vs
  2026-07-21 (34 d)". Nothing tells the reader the picture and the number describe different
  periods. The "Where the weight went" paragraph is the only place a window is named, and it names
  a third one.
- Exact fix: put the window in the caption, derived not typed: "Weight, kg, {first} to {last}". The
  two dates are already in `weightSeries`. Two captions, one line each.
- Verification step: at 390px the Weight tab states three windows explicitly (the chart span, the
  trend span, the split span) and no reader has to infer any of them.

### P3-4. Computed-and-unrendered fields

- `smoothedKg` (`src/lib/health/types.ts` line 25, `src/lib/health/db.ts` line 110): returned, no
  consumer. P2-2 gives it a reader; do that rather than deleting it.
- `TrainingWeek['actual'].horizon` (`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\week.ts` lines 105 and 363) and `ActualDay.minutes` (line 241) and `recovery.daysSinceAny` (lines 113 and 369): computed on every `?s=now` and `?s=plan` render, read by nothing under `/health` and by nothing anywhere per grep. Cheap to keep (they ride on rows already fetched), listed so nobody counts them as evidence a feature exists. **Shared file, coordinate** with the /gym auditor before removing any of them.
- `AdherenceCell` (`src/app/health/HealthCharts.tsx` lines 256 to 261) is `AdherenceDay` (`src/lib/health/types.ts` lines 48 to 55) declared a second time, in a second file, with the incident notes on only one of them. P1-3's fix should leave exactly one.

### P3-5. The three-stylesheet cascade order is a load-bearing rule with no mechanism

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\health\layout.tsx` lines 2 to 13.
- Evidence, quoted: "Both `.training` and `.health` define `.wrap`, `h2`, `.divider` and `.stale`,
  at equal specificity, so whichever file loads LAST wins those four. health.css loads last on
  purpose." Nothing asserts that. The order is an import order in one file, and the thing that
  decides the served order is Turbopack's CSS chunking across a build where `training.css` is
  imported by five route layouts.
- Why it matters in his terms: four selectors silently swapping owners would change the page's
  measure, its heading size, and the colour of the staleness banner, and none of typecheck, lint or
  build would say a word. Per the meta-law, a rule without a mechanism is decoration.
- Exact fix, cheapest first: raise the four `.health` rules to `.health.training` (or scope them to
  `.health .wrap` inside a `@layer`), so the outcome does not depend on file order at all. That is
  the class eliminated rather than the instance checked. Failing that, add the four selectors to
  `scripts/verify.mjs` as a grep over the built CSS asserting `.health` comes after `.training`.
- Verification step: after the specificity change, reorder the three imports in `layout.tsx`
  deliberately and confirm the rendered page is pixel-identical.

---

## What was hunted and NOT found

**1. A prose sentence the numbers beside it disprove.** Found four (P1-1 through P1-4), so this hunt
did not come back empty. What DID hold: every figure on the Volume tab is returned from
`src/lib/gym/coverage.mts` and none is typed into a sentence, which is the discipline /swim/deep
learned. Verified the mechanism behind Volume.tsx's strongest claim ("The counting is done by
src/lib/gym/coverage.mts, the same code behind `node scripts/gym-coverage.mjs`, so this page and
that gate cannot disagree"): `scripts/gym-coverage.mjs` line 42 does
`import { computeCoverage, coverageState, diffCoverage, MIN_EFFECTIVE_DOSE, EFFICIENT_ZONE_TOP } from '../src/lib/gym/coverage.mts'`.
The claim executes. `MIN_EFFECTIVE_DOSE` and `EFFICIENT_ZONE_TOP` are interpolated into the prose at
Volume.tsx lines 97 to 101 rather than typed, so the legend cannot drift from the thresholds, which
is the /reading `tierMeaning` failure avoided by construction.

**2. A stale number presented as current.** Held, and it is the best-defended thing on the page.
Three separate conditions get three separate renderings: the mirror stopped (page.tsx lines 185 to
195, off `health_sync`, 36 hours), he has not weighed in (lines 247 to 255, 14 days, and gated on
`!sync.stale` so the two cannot both shout), and the watch export has not reached a day (the
`known` flag, the hatched cell, `RunStanding`'s "Counted to Aug 25, the last day the watch mirror
has reached"). Checked live: `health_sync` last ok 4 hours ago, `health_watch_session` horizon
2026-08-25 against today 2026-08-28, and the page correctly says the last three days are unknown
rather than rest, and correctly does not shout. The 14-day threshold is one constant
(`STALE_AFTER_DAYS`, db.ts line 24) sharing its meaning with `HealthOS/CURRENT.md`'s own self-flag.
The three defects found here (P2-4, P2-5, P3-2) are all in the liveness reader's edges, not in the
staleness logic itself.

**3. A timezone or day-boundary fault.** Held, and I looked at every date computation on the route.
`src/lib/day.ts` (America/Edmonton, `Intl`) is the source of `today()` and `daysAgo()` for all six
cutoffs; every date-only string is parsed at UTC midnight on both sides of every subtraction
(`daysBetween` in db.ts line 20 and week.ts line 125), so no offset can shift a difference;
`trendAt`'s lookback (db.ts line 90) goes through `toISOString()` on a UTC-midnight base, which is
DST-immune; `shortDate` and `logDate` parse at `T12:00:00Z` explicitly; `weekdayOf` does the same.
The one client-side date is now a prop (`AdherenceStrip`'s `today`, HealthCharts.tsx lines 263 to
276), which is the 05-small-apps H3 fix and it is correct: calling `today()` in the browser would
read the phone's zone, and the comment says so. **The one residual risk is not a date bug but a
type lie, P3-2.** Separately, P2-6 is the timezone comment that no longer scopes itself, which is
how the last four faults of this class survived.

**4. A restated body metric that should have been read from HealthOS.** Held, and verified against
the canonical file rather than by reading the code. /health prints no protein target, no lean-mass
target, no rate goal, no readiness figure: grepped page.tsx, HealthCharts.tsx, Week.tsx, Volume.tsx,
health.css for any typed number about his body and found none. Every figure is selected per render
from `health_body_comp`. The comment at page.tsx lines 311 to 314 states the rule correctly and the
code obeys it: "HealthOS computes the protein target FROM it, so it has been load-bearing and
invisible at the same time. The target itself stays in HealthOS/CURRENT.md: this draws the shape, it
does not restate the number." Cross-checked the overlap: `CURRENT.md` says weight 103.7 kg, body fat
28.91%, measured 2026-08-24, trend "vs 2026-07-21 (34 d): -3.3 kg, -0.7 kg/wk"; /health renders
103.7, 28.91%, 2026-08-24, "-3.3 kg, -0.68 kg/wk". The two surfaces agree, which means the smoothing
method claim in db.ts line 62 ("same method as HealthOS/server/publish-current.mjs: a median of the
last 5 Watch readings") is true rather than aspirational. P2-2 is about the page hiding a basis
CURRENT.md states, not about a disagreement.

**5. Un-batched Neon round trips.** Counted and reported: **9 on `?s=now`, 6 on `?s=weight`, 5 on
`?s=plan`, 1 on `?s=volume`** (P2-1). What held: the Volume tab genuinely does read two JSON files
off disk and issue no Neon query of its own, exactly as its comment claims, and the coverage
arithmetic is imported rather than reimplemented. `getWatchComposition` filters to Watch rows in the
query rather than in the page, so no caller can forget (db.ts lines 45 to 50). The Weight tab's four
charts come from ONE series read, which is the 05-small-apps H1 fix and it is done. For context and
not as a finding here: the hub's `healthRow()` (`src/app/page.tsx` lines 158 to 198, shared file,
coordinate) spends four more of the same round trips per hub regeneration and would fold into the
same bundle.

**6. Dead code.** Found `bmi` (mirrored on 203 of 203 rows, read by nothing, P2-8), `smoothedKg`
(P2-2) and four unrendered computed fields (P3-4). What was suspected and cleared: `BarChart`
(HealthCharts.tsx line 187) looks orphaned from /health but `src/app/swim/page.tsx` lines 9 and 466
import and draw it, and the `.chart-bar` rules in `src/app/charts.css` lines 50 to 51 are its paint,
so neither is dead. `.health .changes` (health.css line 52) is used by
`src/app/health/login/page.tsx` lines 31 and 33. `.health .eyebrow` is used by the same login page.
`trend90` is genuinely gone, with the removal argued in place (db.ts lines 104 to 108) including the
`git log -S` check that it had never had a reader. `getBodyCompSeries` is called once, not twice.

**7. 390px failures and the 44px tap floor.** One failure (P3-1, the 16px strip cells) and one
legibility gap (P3-3). Everything else measured clean by reading the declared values in
`src/app/training.css`, cited by selector because that file moved under this audit (see the
frontmatter warning): `.training .subtab` 44px, `.training details.ladder-all > summary` 44px,
`.training details.src.wk > summary` 44px, `.training .note-actions .btn` 44px. As of this read the
bare `.src > summary` was raised from 32px to 44px too, dated 2026-08-28 in its own comment, which
makes `.src.wk`'s min-height redundant and is somebody else's change in flight. The four sub-tab
chips fit 390px with room (four short mono words plus three 18px gaps against the five that took
/swim to 317px), though `.training .subtabs` still has neither wrap nor scroll, so four is near the
documented ceiling: a fifth tab on this route needs the measurement redone, not estimated. Both
`.table-scroll` tables on the Volume tab scroll inside their own box (`.training .table-scroll`,
line 506 as of this read) with the sideways scroll
announced in the prose (Volume.tsx line 105). The charts use a measured-width viewBox so a 10.5px
axis label is 10.5px on a phone, which is the fix documented at HealthCharts.tsx lines 19 to 38, and
`min-height: 160px` on `.chart-wrap` reserves the space against a hydration jump. The `.pair` grid
stacks below 1024px with `min-width: 0` on the figures, and the reason is written where the rule is.

**8. A rule stated in a comment that no mechanism enforces.** Found two (P2-6, the timezone comment
that no longer scopes itself, and P3-5, the stylesheet cascade order). Cleared: Volume's
"cannot disagree" claim executes (verified import, above); the `.live` and `--signal` convention is
enforced by `scripts/lint-tokens.mjs` for colour literals, and /health carries exactly one inline
colour and it is `var(--signal)` (HealthCharts.tsx line 312), plus one marked
`lint-tokens-allow` for the viewport themeColor; the auth comparison rule does not apply since
/health has no write path.

### The five items already fixed today, verified present at HEAD 5151558

- **Trend line hardcoded `down`**: fixed. `page.tsx` line 273 is
  `className={`stat-d${(bodySummary.trend30?.kg ?? 0) < 0 ? ' down' : ''}`}` with the incident
  written above it. Today `trend30.kg` is -3.3, so it earns the colour.
- **AdherenceStrip "today" ring in UTC**: fixed. `today` is a prop (HealthCharts.tsx lines 263 to
  276) passed the server-computed Calgary date (`page.tsx` line 240), and the comment explains why
  calling `today()` inside the client component would be wrong rather than just different.
- **Hub Health row not consulting `getSyncLiveness`**: fixed. `src/app/page.tsx` line 172 fetches
  both, and lines 177 to 192 give the dead-mirror case its own sentence and drop `.live`.
- **Unrendered `trend90` query**: fixed. One `trendAt` call, db.ts line 109.
- **Duplicate `getBodyCompSeries` call**: fixed. One call, `page.tsx` line 131, with the round-trip
  lesson written beside it.

## What is actually good

The staleness architecture on this page is the best on the site and it is better than the audit that
praised it knew: four conditions that most dashboards collapse into one word (mirror dead, no recent
measurement, day unknown to the export, genuine rest day) each get their own rendering, their own
threshold, and their own sentence, and the incident behind each distinction is written next to the
code that makes it. `getWatchComposition` puts the source filter in the query so no caller can
forget, and says that is why. The Volume tab is the one page on this site where a number he quoted
back three times is computed by the same file as the gate that guards it, and the tier names from
the paper are deliberately left off the screen with the reason written down. `RecentSessions` decides
what each discipline gets by counting populated rows in Neon first and prints how many points a
trend was drawn from, and it names its own chart's normalisation as a trap ("that shape is small
movement magnified, not a trend"), which is a component warning you about itself. Almost every
comment on this route carries a dated incident rather than an intention, which is the only reason
this audit could check anything.

## Severity counts

| Severity | Count | Ids |
|---|---|---|
| P0 | 0 | none |
| P1 | 4 | P1-1, P1-2, P1-3, P1-4 |
| P2 | 8 | P2-1 to P2-8 |
| P3 | 5 | P3-1 to P3-5 |

Single most important: **P1-1.** The Weight tab can print "233% of the change was fat", and it
prints 119% over the exact 34-day window the same tab already displays. The trigger is losing weight
while gaining lean mass, which is the outcome the whole programme exists to produce, so the sentence
is built to break at the moment it finally has good news to report.

Cheapest high-value pair: **P2-6** (name the tables in that timezone comment, five minutes, and it
is the sentence that hid four date faults) and **P1-2** (delete one clause).
