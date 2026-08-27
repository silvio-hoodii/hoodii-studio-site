# One pipeline, five pages: the training redesign

## SHIPPED SO FAR, 2026-08-26

- **C1, one streak.** `computeNextUp` no longer returns one. `getTrainingStreak` in
  `src\lib\gym\week.ts` is the only one left, and it now counts a day the APP logged as well as a
  day the WATCH saw, so it is more complete than either of the two it replaced. `getTrainingDates`
  deleted. `/gym` nudges at the rule's real ceiling of three rather than a separate five.
  Typechecks clean.
- **C6, body composition on a schedule.** `parse-body-metrics.js` and
  `server\migrate-body-comp.mjs` added to the 07:15 task as step 2b. They were never on it.
- **GATE 1, extraction.** `HealthOS\sync\run-health-sync.ps1` now stages, counts the archive's file
  entries against the files on disk, and refuses to promote a short extraction. It also re-checks an
  existing directory instead of trusting that it exists, which is what made the 2026-08-21 failure
  permanent. Not yet parse-checked under PowerShell.
- **GATE 2, regeneration.** `HealthOS\guard-regen.mjs`, wired into `parse-swim-laps.js` and
  `parse-swimming.js`. Refuses to write fewer records than the file already holds, keeps a `.prev`,
  overridable with `--force` and says so. 14 of 14 tests pass, including "file untouched after
  refusal" and the exact swim-laps case.
- **The export is whole again.** 89,186 of 89,186 files verified and promoted. Lap data regenerated:
  **19,327 lengths across 364 sessions**, up from 18,804 across 354.

### D2 SHIPPED, 2026-08-27, and the plan's letter was wrong about one column

Commit `9aae4d7`. `bike_ride`, `POST /bike/api/ride`, both halves of `src\proxy.ts`, and both halves
of the probe harness, in one commit as this document required.

**The deviation: four resistance levels, not one.** D2 below specifies a single `resistance` column.
`content\gym\conditioning.json` already tells him, in the cue "Do not touch the resistance before
2:00", to "write down the level you finished each effort on, so next week starts from real numbers".
That is four numbers, one per interval of the 4x4, and the across-weeks comparison the cue exists to
build is exactly what one column discards at the moment of entry. Silvio was asked directly and
chose the four. Stored as an `integer[]` rather than `r1..r4` because the session has two published
shapes, four intervals at 43 minutes and three at 31, and four columns cannot tell "that interval
did not happen" apart from "he did not write it down".

**The resistance scale is no longer an assumption.** 1 to 20, stated 2026-08-27.
`content\gym\equipment.json` said "No resistance scale recorded yet" until that day; it now carries
the scale, and the first of the "TWO ASSUMPTIONS THAT COULD BREAK THIS SET" in conditioning.json is
marked settled. The bound is enforced twice, in the route and in a table constraint, so a different
machine means changing both and the comment says where.

**Every gate broken on purpose before it was trusted**, against the real table and the running app:

- Twelve bad rows refused by the constraints. Two were traps: `array_length('{}', 1)` is NULL and a
  CHECK evaluating to NULL **passes**, so `cardinality()` is what refuses a ride with no intervals;
  and a containment test does not reliably reject a NULL element, so `array_position` with its
  IS NOT DISTINCT FROM semantics is what refuses `{13, null, 11}`.
- Thirteen bad bodies refused by the route, each naming the interval that is wrong.
- **The matcher half is load-bearing, demonstrated rather than asserted.** With `/bike/api` in the
  prefix list and `'/bike/api/:path*'` deleted from `config.matcher`, an unauthenticated POST
  reached the handler and came back **400 from the route**, not 401 from the gate. Restored, 401.
- The probe linter fails and names the route when `WRITE_ROUTES` is missing it.
- Two real rides posted through the live route, read back field for field, then deleted.
  `bike_ride` is empty.

`content\gympply-schema.mjs` confirmed its work with `like 'gym_%'`, which cannot match
`bike_ride`. It names the four tables explicitly now and exits 1 on a missing one.

**Not yet pushed**, so this is committed and not deployed.

### PHASE C SHIPPED, 2026-08-27

Commit `5c83177`. Five routes, one nav row in all five LAYOUTS, `/health` is the index, and
`/gym/conditioning` is deleted with every URL it ever had redirected in `next.config.ts`.

`/health` gained three sub-tabs on the same `?s=` idiom the disciplines use: Now, Weight, Plan.
Stacking the old Overview tab's nine blocks on top of the body charts would have been about six
phone screens.

**Two defects the pixels caught and the source could not.** The middle tab was labelled Body, one
row under a nav chip also labelled Body: two controls a row apart, same word, different scopes. And
`/bike` opened with a sentence `LastSession` already prints verbatim one paragraph below it, the two
living in different files. Both were found by screenshotting at 390 px, neither by reading the code.
**Read the rendered screen, not the data**, again.

**Measured at 390 px on the built server**, not estimated:

```
/run     1.28 screens   ?s=plan 3.63   ?s=how 1.27
/bike    1.18           ?s=plan 2.01   ?s=how 1.34
/health  2.61           ?s=weight 1.31 ?s=plan 2.34
0 horizontal overflows, 0 wrapped nav rows, 5 chips and exactly 1 active on all eleven views
```

`/gym` is 10.18 screens and Phase C did not change that. It is the workout runner with every
exercise of the day open, and it is the tallest thing on the site by a factor of three.

### PHASE D, FOUR ITEMS SHIPPED, 2026-08-27

Commits `cda7aae`, `2f0d767`, `e142cd3`. Items 1, 3, 4 and 5 of "What gets built, in order of
value". Item 2, the swim level page, is NOT started.

**1. `getRecentSessions` has callers.** All four disciplines draw the last ten beside the last one.
What each kind gets was decided by querying Neon first, not by assuming four equal disciplines:

```
strength   80 sessions, all with minutes, avg HR, percent under 110. Trend = percent under 110.
swimming   60 sessions, but only 8 of the last 10 carry lengths and SWOLF. Trend = SWOLF, from
           the 8, and the caption says it is 8 of 10.
treadmill  5 sessions ever, all with cadence. Trend = cadence, 80 to 142 spm since May.
cycling    ONE session, ever. It says so and draws nothing.
```

Each page also went from two reads to one: `getRecentSessions` returns newest first, so its head IS
the last session and the `getLastSession` call beside it was fetching the same row twice.

**A defect the screenshot caught.** `Trace` normalises min to max and fills its height, which is
right for a heart rate over one session and wrong across sessions: ten swims spanning SWOLF 35.5 to
37.7, a 6% spread, drawn as a mountain range. There is now a sentence, and it fires on ANY series
whose spread is under 8% rather than being a note about swimming.

**3. Body composition draws 8 of 8 columns.** `fat_kg` and `lean_kg` were in every row
`getBodyCompSeries` already returned. Between 2026-05-06 and 2026-08-24 his weight moved -8.2 kg, of
which **-8.0 fat and -0.2 lean: 98% of the loss was fat**, derivable and invisible the whole time.
Fat plus lean equals weight to the decimal, so it is arithmetic, and the page says so. It also
carries the caveat that outranks it: both are inferred from a bioimpedance reading and move with
hydration, so a kilo of lean movement may be water and the set log is the better witness.

Skeletal muscle, water and BMR are on 101 of 101 Watch rows and **0 of 102 Scale rows**, counted.
`getWatchComposition` filters at the read so no caller can draw a line through a scale day and
invent the value in between.

**4. Run gets its belt-speed trace.** `detail.speed` was stored on every run and drawn by nothing.
**The unit was checked, not assumed**: the series is metres per second on all five runs, matching
distance over duration and never the 3.6x figure. Rendered in km/h because that is what the console
shows and what conditioning.json tells him to dial.

**5. Notes are readable.** `gym_note` was write-only from the web since 2026-08-16. Eighteen notes,
**nine not acted on**, collapsed at the bottom of /gym with the unanswered count in the summary.

### THE THING WORTH CARRYING FORWARD FROM PHASE D

**A test can pass while measuring the wrong thing, and a count compared against itself never
notices.** The notes block first shipped using `.ex`, the class the probe harness selects to find
the day's exercises. All 22 tests passed. `cardNames()` silently went from 10 entries to 28, and
`wholeDayIsShown` compared that inflated number against itself, saw no change, and reported green.

Third borrow on this surface. `.tab` versus `.surf-tab` cost 17 failing tests, then swap-revert
versus swap-toggle, now this. Each previous time the fix was a rename plus a comment saying not to
do it again. **The comment does not execute.** This one has `exSelectorMeansExercise`: every `.ex`
on /gym must carry `data-slot`, which real cards have and nothing else does. Broken on purpose
before it was trusted, 23 ran and 1 failed and it was the right one.

### STILL OPEN in Phase D

- **Item 2, the swim level page.** The biggest remaining body of work and the richest material:
  SWOLF per piece, PB progression from `standingFor()`'s unused `history` array, pace against body
  weight on the same date, the gym-proximity effect, work-to-rest ratio, stroke type per length,
  season gaps. All recovered and specified, none built.
- **Lift, run and bike depth beyond the trend.** The `now` tabs are wired; the disciplines have no
  level or progression view of their own.

### OPEN after Phase C, none of it blocking

- **The hub has no row for `/run` or `/bike`.** Both are reachable from the nav on any training
  route, so nothing is stranded, but the front door still lists eight apps and not ten. A hub row
  shows real state rather than a label, and `/bike` has no state until the ride form exists.
- **`?p=` rides along on every redirect**, so an old bookmark lands on `/run?p=run&s=plan`. Next
  forwards query params the destination does not consume; the pages ignore `p`. Cosmetic.
- **`/swim` is indexable and `/gym`, `/health`, `/run` and `/bike` are not.** The two new routes
  deliberately copied the noindex majority rather than the sibling they were modelled on. Four
  routes holding the same kind of thing should not disagree about this. His call, one line either
  way.
- **Nine unhandled rows in `gym_note`**, 2026-08-23 and 2026-08-25, read at the start of this
  session and not acted on because they are programme content rather than Phase C. One of them,
  #12, is the same complaint this redesign answers: "Walls of text again why do I need all this,
  just leave the cue and thats it, it can even be hidden."

### C4 was not a defect

`/health` already showed the 5,000 m: `getSwimSummary` takes `max(distance_m)` with no date filter.
Checking it surfaced a real defect on the same line instead, now tracked as C3b below.

### C3b, NEW: one column holding two different metrics

`parse-swimming.js:148-152` computes `pacePer100mMs` two ways. With per-length detail it is
`total_duration / total_distance`, which is **moving** pace, rest excluded. Without detail it is
`durationMs / distanceM`, which is **wall clock**. One column, two meanings, so `min()` over it
always selects a moving-pace row. That is why `/health` shows "Best pace / 100m 1:31" while the
official 100 m PB is 1:38.71: the 1:31 is a 300 m session from 2025-01-22 that was 82% rest.

Fixed. Two fields: `pace_per_100m_ms` always wall clock, `moving_pace_per_100m_ms` only where detail
exists, null otherwise and never a fallback. Parser, `content\health\schema.sql` (an idempotent
`add column if not exists`, the table was live with 463 rows), `content\health\sync.mjs`,
`src\lib\health\types.ts`, `src\lib\health\db.ts`, `src\app\health\page.tsx`, and the parser's own
terminal output, which had the same single mislabelled line.

`bestPacePer100mMs` was RENAMED to `bestWallPacePer100mMs` rather than kept, so no caller can carry
the old meaning forward by accident.

**Verified against Neon after the sync**, not inferred:

```
sessions           475
with wall pace     366
with moving pace   364
best wall pace     1:47.7   rest included
best moving pace   1:30.7   rest excluded
official 100 m PB  1:38.7   -> wall-clock best is correctly SLOWER
```

The row that produced the false headline, now legible: **2025-01-22, 300 m, moving 1:30.7 against
wall-clock 8:31.3, 1,534 seconds elapsed.** Four minutes of swimming inside twenty-five minutes.

### The export was broken, and that is the real story of 2026-08-26

Written up in full in `hoodii-studio-site\AGENTS.md` under the gym data pipeline. Short version: the
2026-08-21 export extracted 244 of its 88,838 entries, all 80 CSVs and 164 of 88,757 JSON blobs.
Nothing crashed. Attendance, body composition and swim PBs stayed correct because they come from
CSVs. Only per-session detail was starved, and two research agents then concluded in writing that
Samsung had stopped shipping HRV, GPS and per-length swim data. All of it was in the .zip.

`if (Test-Path $dest) { "already unpacked" }` is why it lasted five days: the half-empty directory
satisfied every later run. **A partial state that satisfies its own check is permanent.**

Re-extracted and verified at 89,186 of 89,186. Lap data regenerated to **19,327 lengths across 364
sessions**, up from 18,804 across 354.

### What the recovery data actually is, corrected

An earlier draft of this plan repeated an agent's conclusion that per-reading HRV was unreachable.
It is not: 1,451 HRV blobs are in the archive, along with 4,641 GPS location files and 649
heart-rate-recovery files. They have been on disk since at least the complete 2026-08-10 extraction
and were simply never imported. Sleep is likewise real and rich: 791 sessions to 2026-08-15 with
score, efficiency, cycles and separate physical and mental recovery figures, plus 24,799
minute-level stage segments, and `vitality_score` carries a fully populated daily composite with
daily resting HR and HRV.

So **recovery is a dimension this system can have**, and it has no home in the five-page map above.
It belongs on `/health`, which is now the index: Body, Recovery, and the Week.


**Written** 2026-08-26. **Status** PROPOSAL. Supersedes the scope of
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\docs\SWIM-MIGRATION-PLAN-2026-08-26.md`, which
becomes one phase of this.

Built on three audits run this session: the data layer, the existing surfaces, and archaeology on
the swim analysis scripts in `C:\Users\sneyr\Desktop\HOODII\HealthOS\`. Every claim below traces to
a file and line. Nothing here is recalled.

---

## The one fact that decides the architecture

There is exactly **one** data source. The scale reports into the watch, the watch reports into the
Samsung Health export, the export lands on the laptop in `healthos.db`, and
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\health\sync.mjs` mirrors it into Neon at
07:15 on a scheduled task. The only exception is lifting, where the app itself owns the numbers he
types into `gym_set`.

So the split between pages is **not** about provenance. It is about which question each page
answers. That is the whole design brief.

## What the data can actually pay for, per discipline

This is the constraint, and it is uneven enough that four identical pages would be dishonest.

| Discipline | What the export carries | Depth available |
|---|---|---|
| **Swim** | Per **length**: duration, stroke cycles, rest, stroke type. Per session: distance, pool length, SWOLF, stroke rate, pace. Plus a PB history at 100/200/400/1500 m. Plus 18,804 individual lengths back to 2018 sitting in a JSON file. | Deep. By a wide margin the richest thing in the whole system. |
| **Lift** | Watch gives heart rate only and "cannot judge a lift" (`src\lib\gym\session.ts:131`). The real data is typed: weight, reps, done, per set, 396 sets logged. | Deep, but from the app rather than the watch. **There is no join between the HR trace and the sets.** |
| **Run** | HR, cadence and speed per second. Cadence is drawn; **speed is captured and never rendered**. | Moderate, and thin on history because he is just starting. |
| **Bike** | Heart rate. Nothing else. "No rpm, no power, no resistance" (`src\lib\gym\session.ts:135`). | Almost none. |
| **Body** | `health_body_comp` carries kg, bf_pct, fat_kg, lean_kg, skm_kg, water_kg, bmr_cal, bmi. **Only kg and bf_pct are ever plotted.** | Moderate, and six of eight columns are unused. |

## The route map

Five routes, one nav row, present on all of them via the layout (house rule: navigation belongs in
the layout so a new sub-route inherits it, per the header comment in
`src\components\SiteHeader.tsx`).

```
/health     Body + the week.  THE INDEX.
/gym        Lift.   The workout runner, plus history.
/swim       Swim.   The deep one.
/run        Run.
/bike       Bike.
```

Nav labels, five items, short enough for a 390 px phone at a 44 px tap floor:
**Lift · Swim · Run · Bike · Body**.

`/gym/conditioning` is **deleted** and its contents redistributed. Its Overview tab becomes
`/health`. Its run, bike and swim tabs become the three new routes. Its "How it fits" and "When
things happen" blocks belong with the week, so they go to `/health`.

### Why `/health` is the index rather than a sixth `/training` route

The four disciplines share exactly one thing: whether he trained, and what his body did about it.
That is attendance, the streak, and body composition, and it is already what `/health` is for.
Making it the index puts the connective tissue in one place instead of inventing a route to hold it,
and it fixes the current situation where `/health` is a dead end nothing links to and which links
to nothing (confirmed: no link exists in either direction between `/health` and `/gym`,
`/gym/conditioning`, or `/swim`).

### The spine inside each discipline

Reuse the idiom that already worked. Query-param tabs as plain `<Link>`s, never client state,
because "it works before hydration, it survives a reload at the side of a pool, and
/gym/conditioning?p=swim is a thing he can bookmark" (`src\app\gym\conditioning\page.tsx:23`). That
split took the worst view from 7.9 phone screens to 2.2 and it is not being reinvented.

| Tab | Question | Swim | Run | Bike | Lift |
|---|---|---|---|---|---|
| `now` (default) | What just happened, and what do the last few say? | yes | yes | yes | yes |
| `plan` | What am I doing over the coming weeks? | yes | yes | yes | the day tabs already are this |
| `how` | How do I actually do it? | yes | yes | yes | RIR guide, warmups |
| `level` | Where do I stand? | yes | later | no | later |
| `coach` | Coaching me, and coaching someone else | yes | no | no | no |

`/gym` is the one exception in shape, because it is the only route where a session is **in
progress**. Its day tabs stay exactly as they are and remain the default view. The deep dive lives
behind the nav as a second surface, the same two-surface pattern `GymNav` already implements.

---

## What gets built, in order of value

### 1. `getRecentSessions` — the biggest single unlock, and it is already written

`src\lib\gym\session.ts:99` exports `getRecentSessions(kind, limit)`, a multi-session history for
exactly these four disciplines. **Zero pages import it.** Only the single-session `getLastSession`
is wired up.

This is the feature he asked for, already built and never connected. Every discipline's `now` tab
gets last-N-sessions trended, not just the most recent one drawn.

### 2. Swim gets its level page, and the analysis stops being a dead artifact

Recovered from `C:\Users\sneyr\Desktop\HOODII\HealthOS\analyze-swimming.js`,
`analyze-splits.js`, `parse-swim-laps.js` and `analyze-sessions.mjs`, all of which still run. What
exists in those scripts and nowhere on the web:

- **SWOLF** per session and per piece. All-time best 34.6 in Aug 2025, currently around 40 to 41.
  The formula is seconds-per-length plus strokes-per-length (`parse-swimming.js:146`).
- **Pace against body weight on the same date.** This produced the most interesting conclusion in
  the whole set: fastest swimming happened at 116 to 120 kg, not at his lowest weight of 98 kg.
  "Weight is not the limiting factor. Fitness is." That is a cross-page finding and it is the
  strongest argument for `/health` being the index.
- **The gym-proximity effect.** Swims within 45 minutes after lifting are about 7% faster with
  better SWOLF and higher heart rate. Three cohorts, computed, never surfaced.
- **PB progression per distance.** `standingFor()` already returns a full `history` array and the
  page renders only `best` (`src\lib\gym\swim-level.ts:146`).
- **Verified versus raw-fastest PBs**, with a corroboration rule: a candidate counts only if
  another lap within 4% exists within 60 days. Good methodology, worth keeping.
- **Work-to-rest ratio** and **piece-level breakdown** within a session, from `analyze-sessions.mjs`.
- **Stroke type per length**, captured in `detail.lengths[].stroke`, currently unused by
  `LengthBars` which draws only duration and a before-rest flag.
- **Season gaps**: every break of 14 days or more, flagged over 90.

### 3. Body composition stops showing two columns out of eight

Fat mass, lean mass, skeletal muscle, water and BMR are all mirrored on every sync and never
plotted. Lean mass in particular is what the protein target is computed from, so it is already
load-bearing and invisible.

### 4. Run gets a speed trace

`detail.speed` is stored per second and never rendered. `analyze-sessions.mjs` already prototypes
run and walk block reconstruction from belt speed. That is a real page even with few sessions.

### 5. Notes become readable

`gym_note` is write-only from the web. Nothing on any page ever shows a past note back. Only the
CLI at `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\gym-notes.mjs` reads them.

---

## Correctness work this redesign must include

Not optional. Each of these is a wrong or duplicated number a reader can currently see.

### C1. The streak exists twice and the two disagree by design

`computeNextUp` in `src\lib\gym\cycle.ts` counts the **app's own log** and its comment says so.
`getTrainingWeek` in `src\lib\gym\week.ts` counts **watch-detected sessions**. The first is on the
hub and on `/gym`, the second is on `/gym/conditioning`, and neither page mentions the other. Train
without logging and they diverge.

**Decision:** the watch number is the streak, because it answers "did you train" honestly. The
app-log number answers "did you log a lift", which is a different and narrower thing.

**Mechanism, not a rule:** `computeNextUp` stops returning `streak` at all. Then there is exactly
one streak in the codebase and the disagreement becomes unrepresentable rather than something a
future edit has to remember. Law 1.

### C2. Swim exists as three unrelated data pools on three routes

The pool schedule (`swim_*` tables), the training history (`health_swim_session`), and the rated
PBs (`health_swim_pb`). Two of those independently answer "how fast has he swum" from different
tables with different derivations, and neither links to the other. The schedule is being deleted
outright per the earlier decision, and the remaining two both land on `/swim` where they can be
reconciled on one screen.

### C3. The 100 m personal best is contested by 10 seconds and nothing resolved it

Samsung's own accepted PB is **1:38.71**, set 2026-08-09, read directly from
`com.samsung.shealth.best_records.20260821101890.csv` in the newest export. The lap-chaining
reconstruction in `analyze-splits.js` claims **1:31.2** and marks it "verified" by its own
corroboration rule. The scripts left a comment saying trust Samsung and never reconciled the two.

The site currently uses `health_swim_pb`, which comes from Samsung's own records, so **the live
number is the trustworthy one**. The reconstruction is the thing to either fix or retire, and the
level page must not show both without saying which is which.

Also settled this session: `C:\Users\sneyr\Desktop\HOODII\HealthOS\official-pbs.js` is **wrong**
about two of the four type codes. It claims type 15 is best calorie burn and type 16 is longest
session duration. Both values *decrease* across successive PB events, which a longest-anything
record cannot do, and type 15's values run 443,000 to 520,000, which is not a calorie count. The
importer's mapping of 13/14/15/16 to 100/200/400/1500 m is correct, and the four paces rise
smoothly at 98.7, 104.9, 110.9 and 123.9 seconds per 100 m. That script should be retired rather
than trusted.

### C4. His longest swim ever is not on the site

Type 3 in the same PB file is longest distance in metres, topping out at **5,000 m on 2025-07-07**.
`SWIM_PB_TYPES` in `C:\Users\sneyr\Desktop\HOODII\HealthOS\server\import-watch-sessions.mjs:287`
skips it because it is a distance rather than a time. One line to import, and it belongs on the
level page.

### C5. Two `gym_set` columns that cannot ever hold data

`rir` is "396 logged sets, 0 with a value, because no input for it was ever built"
(`src\app\gym\GymClient.tsx:22`). `estimated` is accepted by the API and gated on by the
progression engine, but nothing in the client ever sends it. Either build the input or drop the
column. A column that cannot be filled is the same class of thing as the time budget that was
deleted rather than patched.

### C6. Body composition refreshes only when someone remembers

**Checked against the data, 2026-08-26.** `body_comp` holds 202 rows from 2022-12-08 to
2026-08-16, and the newest export contains **zero** readings the database has missed. The data is
current and the first draft of this document was wrong to imply otherwise.

The real defect is the schedule. `C:\Users\sneyr\Desktop\HOODII\HealthOS\sync\run-health-sync.ps1`
runs the export pull, the unzip, `import-watch-sessions.mjs`, `import-session-detail.mjs`, the Neon
mirror and the ladder check. It **never runs `server\migrate-body-comp.mjs`**, so body composition
moves only when somebody runs it by hand. It happens to have been run around 2026-08-16, which is
why the numbers look fine.

That is precisely the failure the same file's own header describes one layer up: "nothing on any
schedule ever refreshed healthos.db itself, so the mirror was faithfully copying a database that
only moved when somebody remembered to unzip an export and run the import by hand." The fix is one
line in that task, and it belongs in Phase B.

Two related facts found in the same check:

- **`vfa_level` is present in the export and empty.** There is no visceral fat data, so no page can
  show it. Worth knowing before it gets designed in.
- **Scale readings and watch readings are not the same shape.** A `source = 'Scale'` row carries
  weight and body fat only; a `source = 'Watch'` row also carries skeletal muscle and total body
  water. Any chart of muscle or water has gaps on scale days and must not interpolate across them.
- Height remains a hand-derived constant, back-computed from one weight and one BMI
  (`server\migrate-body-comp.mjs:24`). Low stakes, but it feeds BMI, so it should be measured once
  and typed in rather than left derived.

---

## Decisions taken, 2026-08-26

**D1. Route shape: five siblings, `/health` is the index.** Decided. Nav is
**Lift · Swim · Run · Bike · Body** on every one of them, mounted in the layouts. No sixth
`/training` route: inventing a route to hold shared state is how the current duplication happened.

**D2. Bike gets a manual input.** Decided, and it is the choice with the most engineering behind it.
The watch gives a heart rate and nothing else, so the app starts owning what the watch cannot see.
This is the only new **write path** in the whole redesign, which means all four of these land in one
commit or none of them do:

1. A new table. `bike_ride`, in `content\gym\schema.sql` alongside the other app-owned tables:
   `date`, `minutes`, `resistance`, `effort`, `note`, and an `id`. Same shape rationale as
   `gym_swim_baseline`, a history rather than a value.
2. `POST /bike/api/ride`, with server-side validation that refuses in its own words rather than
   returning a generic error, the way `/gym/api/swim-baseline` does.
3. `src\proxy.ts` gains `/bike/api` in the write-gate prefix list. Without it the route is open to
   anyone, because pages here are public by design and only writes are gated.
4. `scripts\lint-probe-routes.mjs` learns the new directory, and `scripts\probe-gym.js` gains
   `/bike/api/ride` in `WRITE_ROUTES`. The linter currently scans `src\app\gym\api` **only**, so a
   write route anywhere else silently escapes the harness that stops a test writing into the real
   store. This is the mechanism that already failed once, in 2026-08-16, when `/gym/api/note`
   shipped without being added to the list.

   The same extension covers `/swim/api/baseline` when swim moves. Do it once, for both.

**D3. Sync all 18,804 lengths.** Decided.
`C:\Users\sneyr\Desktop\HOODII\HealthOS\swim-laps.json` holds every individual length back to
2018-01-03 and has never reached the database, while `health_session_detail` backfills about 120
days. New table `health_swim_length`, one-way from the laptop, same pattern as every other mirror.
Roughly 19,000 small rows.

Two things to get right, both learned from existing mirrors in this repo:

- **The key must not silently discard rows.** `swim_session` lost two real sessions to a key that
  looked sufficient, and nothing said so. A length's identity is
  `(sessionUuid, lengthIndex)`, which is genuinely unique, so use exactly that.
- **The sync needs its own liveness row**, like `swim_sync` and `health_sync` have, so the page can
  tell "no lengths that week" from "the mirror stopped".

`parse-swim-laps.js` already produces the JSON and auto-picks the newest export, so the only new
code is the push. Its own header explains why it exists and the reason still holds: Samsung's PB
records never surface a 25 m time, and the per-session detail is the only source for one.

---

## Sequencing

Phase A and Phase B are independent and can land in either order.

- **Phase A. Kill the schedule.** Exactly as written in
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\docs\SWIM-MIGRATION-PLAN-2026-08-26.md`, Phases
  0 and 1 only. Task first, then files, then tables. The DNS record stays his to remove.
- **Phase B. Correctness, and it should not wait behind a redesign.** Each item is small and each is
  a wrong, duplicated or silently frozen number a reader can see today.
  - C1, delete `streak` from `computeNextUp` so only one streak can exist.
  - C3, retire `official-pbs.js` and decide what happens to the contested 100 m reconstruction.
  - C4, add type 3 to `SWIM_PB_TYPES` so the 5,000 m exists.
  - C6, add `server\migrate-body-comp.mjs` to the 07:15 task. One line.
- **Phase B2. The two new mirrors.** `health_swim_length` (D3) and the `bike_ride` write path (D2).
  Both are plumbing, both are prerequisites for the pages that show them, and the four-part gate
  work in D2 lands here rather than being remembered later.
- **Phase C. The shell.** Five routes, the shared nav in the layouts, `/health` becomes the index,
  `/gym/conditioning` redistributed and deleted, redirects for every old query-param URL so existing
  bookmarks land somewhere real.
- **Phase D. Depth, one discipline at a time.** Swim first: it has the most to show, the recovered
  analysis is the material, and it now has eight years of lengths behind it. Then lift, then run,
  then bike.
  - Every discipline's `now` tab wires `getRecentSessions`, which is the single change that turns
    four shallow pages into four deep ones.
- **Phase E. Verify.** `pnpm build` runs prose lint, classname lint, three content validators and
  the probe-route linter. Then the probe harness. Then poll each of the five live URLs and grep for
  a real number. Then screenshot each at 390 px and count screens, measured rather than estimated.

## Mechanisms that must not break

Carried forward from the audit, each with its own incident behind it.

- **Class names are an API, not a style.** `.tab` versus `.surf-tab` cost 17 failing tests when a
  new component answered to a selector the probe harness uses. Same lesson again with
  `swap-revert` and `swap-toggle`.
- **`lint-probe-routes.mjs` only scans `src\app\gym\api`.** Any write route on a new discipline
  page escapes the harness that stops a test writing into the real training log. The linter must
  learn the new paths in the same commit as the routes, and `src\proxy.ts` must gain the new API
  prefixes or the writes are open to anyone.
- **The swim content validator lives inside the gym validator.** Moving swim JSON out of
  `content\gym\` without moving those checks silently drops quote-must-be-verbatim,
  source-must-resolve, tiers-must-get-slower, and the teaching safety block.
- **No text inside an SVG viewBox.** "/health spent a week rendering its axis labels at 6.1px on a
  phone before anyone measured it."
- **One chromatic colour, reserved for a number that is true right now.** Never decoration.
- **Never estimate phone-screen height from source.** Screenshot and measure.
- **Collapsing is not free.** Rendering all seven run cues open took that tab to 8,536 px, taller
  than the 6,287 px page that started the whole complaint. Fixing a wall of text by building a
  bigger one is not a fix.
