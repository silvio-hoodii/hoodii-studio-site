---
date: 2026-08-26
scope: /gym app of hoodii.studio. src/app/gym/**, src/lib/gym/**, content/gym/**, src/app/training.css (read only, shared with /swim), scripts/probe-gym.js, scripts/run-probe-gym.mjs, scripts/lint-probe-routes.mjs, scripts/check-ladder.mjs, scripts/gym-notes.mjs
for: executor agents. Each finding names the file, the evidence, the fix, and how to verify it. Read-only audit; nothing was edited, no API was POSTed, the only database access was SELECT.
method: static read of every file in scope, node scripts/lint-probe-routes.mjs (run, passed), two read-only Neon SELECTs (unhandled notes, duplicate session rows). No build, no dev server, no browser run.
---

# /gym audit, 2026-08-26

The adversarial brief: find the write that records the wrong thing, the write route outside the
net, the dishonest number, the ladder rung that cannot be reached, the unanswered note, the Vercel
cost, and the 390px regressions. Findings below by severity. Pending items from
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\docs\TRAINING-REDESIGN-PLAN-2026-08-26.md` are
listed as open work at the end, not as bugs.

## P0. Writes wrong data, or writes ungated

**None found.** The write net is intact, verified three ways:

- All three real writes (`/gym/api/set`, `/gym/api/finish`, `/gym/api/note`) are in `WRITE_ROUTES`
  in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\probe-gym.js` line 58, gated by the
  `/gym/api` prefix in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\proxy.ts` line 72, and
  covered by `'/gym/:path*'` in `config.matcher` at proxy.ts line 99.
- The three read-shaped POSTs (`plan`, `session`, `next`) are declared in `READ_ONLY_POSTS` in
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\lint-probe-routes.mjs` lines 37 to 46,
  and each genuinely only reads (verified by reading all three route bodies and the db.ts functions
  they call).
- `node scripts/lint-probe-routes.mjs` was run during this audit:
  `7 POST route(s) under /gym/api + /swim/api, 4 stubbed, 3 read-only by declaration, 0 failures`.

The id/name pairing on the set write is correct end to end: `autosave` in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 394 to 406 takes
`eff` (the exercise actually performed) and `slotId` separately, posts `exerciseId: eff.id,
exerciseName: eff.name, swappedFrom: swaps[slotId] ? slotId : null`, and never sees the original
exercise object. `swappedSetRecordsTheRightExercise` in probe-gym.js asserts exactly this.

## P1. Lies to him, or breaks mid-workout

### P1-1. The plan API drops `rangeWidth`, so the 2026-08-22 ladder fix never reaches a live suggestion

The rung-that-cannot-be-reached hunt found its rung, and it is the exact one the fix was for.

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 349 to 357
  sends `rangeWidth: eff.rangeWidth` in every `/gym/api/plan` request.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\api\plan\route.ts` lines 8 to 13
  declare `PlanExerciseIn` with `id, targetReps, type, increment` and **no `rangeWidth`**, and the
  `suggest(last, { type, targetReps, increment, today, recent })` call at lines 30 to 36 never
  passes it on.
- `suggest` in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\progression.ts` line
  101 therefore always computes `top = bottom + RANGE_WIDTH` (default 2). This is the ONLY caller
  of `suggest` in the codebase (grep confirmed).

`content/gym/program.json` carries `rangeWidth` on ten lifts (bulgarian-split-squat 6,
db-bench-press 3, db-overhead-press 4, db-overhead-tricep-extension 4 twice, db-hammer-curl 5
twice, reverse-lunge 6, single-leg-rdl 5, ez-preacher-curl 3). For every one of them the live app
still runs the default range of 2: db-overhead-press at 65 lb and 10/10/10 gets "Hit 10/10/10 at
65: +5 lb", the jump `scripts/check-ladder.mjs` proves demands an e1RM of 88.7 against 86.7 banked.
So the daily ladder gate reports every ladder closed (it reads program.json, which is correct)
while the engine the page runs asks for the unreachable jump anyway, and it also stamps that wrong
target into `gym_set.suggested_weight` on every set. This is why the fix can look shipped and the
overhead press can keep oscillating.

**Fix (one file):** in `src\app\gym\api\plan\route.ts`, add `rangeWidth?: number` to
`PlanExerciseIn` and pass `rangeWidth: ex.rangeWidth` into the `suggest` options.

**Verify:** `/gym/api/plan` is deliberately open and read-only, so a POST to it is safe. After
deploying, `curl -X POST https://hoodii.studio/gym/api/plan -H 'content-type: application/json'
-d '{"date":"<today>","exercises":[{"id":"db-overhead-press","targetReps":8,"type":"weighted","increment":5,"rangeWidth":4}]}'`
and assert the suggestion for a last session of 3x10 at one weight says hold and build to 12, not
+5 lb. Then add a probe test that reads the rendered `.ex-suggest` for a rangeWidth exercise whose
last session maxed the default range but not the widened one, so a regression cannot pass the
harness.

### P1-2. Nine unhandled notes are sitting in gym_note right now, and nothing surfaces them but memory

`node scripts/gym-notes.mjs` (run during this audit, read-only) returned **9 UNHANDLED notes**:
eight written during the 2026-08-25 Upper B session (#12 to #19) and one from 2026-08-23 (#11,
"Didn't have more time, about 40 min"). The 08-25 batch includes direct program-defect reports
("Why is famer carry reps", "Reps in farmers is secs", "Therea no kettlebell after 50 for
farmers"), a zone-route observation ("I could have done a lot of this in the same barbell station
that I started"), a duplicate-exercise question ("Why is the a single leg gluten bridge here"), and
a UX complaint ("Walls of text again why do I need all this, just leave the cue and thats it, it
can even be hidden").

This is the failure `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\gym-notes.mjs` line
12 warns about in its own header: a captured question nobody answers teaches him the box does
nothing. The rule "run gym-notes.mjs FIRST when touching /gym" lives in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` line 313 as prose. There is no
mechanism: no `.claude` directory exists in this repo, `scripts/verify.mjs` does not mention
gym-notes, `.githooks/pre-push` does not, and nothing on any page renders them (the redesign plan
already tracks the page half as open work item 5).

**Fix, two mechanisms, both cheap:**

1. Create `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\.claude\settings.json` with a
   `SessionStart` hook running `node scripts/gym-notes.mjs` (short timeout, tolerate offline), so
   every agent session in this repo opens with the unhandled list in context instead of relying on
   an agent remembering a sentence in AGENTS.md. The HOODII root already runs hooks this way
   (`C:\Users\sneyr\Desktop\HOODII\.claude\settings.json` has UserPromptSubmit and Stop hooks), so
   the pattern is established.
2. Render the unhandled count on `/gym` server-side (one `getNotes({ onlyUnhandled: true })` call,
   the helper already exists in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts`
   lines 209 to 215 with zero callers): "N notes not yet acted on" makes the backlog visible to the
   one person who can escalate it.

**Verify:** start a fresh session in this repo and confirm the note list appears without being
asked for; then mark one handled and confirm the count drops on the page.

**And act on the nine notes themselves** in the next executor session; several are program.json
edits (see P1-3, and note #13 duplicates the exerciseKey concern that validate.mjs already checks
for warmups, worth re-checking against the current files).

### P1-3. Farmer carry asks for "reps" that are seconds, so the logged number has the wrong unit in the record

Notes #17 and #19 report it in his own words ("Why is famer carry reps", "Reps in farmers is
secs"). In `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\program.json`:

- friday `farmer-carry`: `sets: 3, reps: "40", progression: "weight"`, no `timed` flag. The set
  row's reps input renders placeholder "reps" (GymClient.tsx line 702 keys the placeholder off
  `eff.timed`), the meta line reads "3×40", and a 40 he types means 40 seconds while every consumer
  of `gym_set.reps` treats it as a count.
- monday `suitcase-carry`: `reps: "30/side", progression: "weight"`, also untimed, same problem.
- Meanwhile the ALTS of these same movements (`farmer-carry` as monday's alt, `suitcase-carry` and
  `kb-farmer-carry` as friday's alts) ARE `timed: true, progression: "time"`. The same movement is
  modelled two different ways depending on which slot it sits in.

`content/gym/validate.mjs` cannot catch it: its timed check (line 330) only fires when `timed` is
already true, and `scripts/check-ladder.mjs` line 117 deliberately skips reps above 15, so the
mislabelled 40 sails past both gates. The row it produces is the same class as the id/name mismatch
this app already fixed once: a number whose recorded meaning is not the meaning he gave it.

**Fix:** make the main-slot carries agree with their own alts: `timed: true`,
`bodyweight: false`, `progression: "time"` on friday `farmer-carry` and monday `suitcase-carry`
(keep the load progression note in the cue or `why`; a carry progresses on load and time and the
app's three axes force a choice, which is a decision to put to Silvio, not to invent). Then decide
what the existing reps-that-were-seconds rows in `gym_set` mean before anything trends them.

**Verify:** `node content/gym/validate.mjs` (the timed-must-declare-bodyweight check now applies),
then on a dev build confirm the reps placeholder for those rows reads "s".

## P2. Cost, debt, drift

### P2-1. /gym/api/plan issues up to ~150 Neon round trips per page open

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\api\plan\route.ts` lines 22 to 39
runs, per logged exercise, `getLastSession` (2 queries) plus `getRecentSessions(id, date, 8)`
(1 distinct-dates query plus up to 8 sequential `setsForExDate` queries in a for loop,
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` lines 116 to 126). That is up
to 11 HTTP queries per exercise, and the days carry 10 to 14 logged exercises, so one open of /gym
costs roughly 110 to 154 Neon round trips, and again on every day-tab switch (the effect re-fires
per `planKey`). `AGENTS.md` line 458: "External API Requests on the billing page means Neon", and
"a Promise.all makes queries concurrent, not free".

**Fix:** one query for the whole day: `select ... from gym_set where exercise_id = any($ids) and
date < $date and done = true and reps is not null and reps > 0` with
`dense_rank() over (partition by exercise_id order by date desc) <= 9`, then group rows in JS into
last + recent per exercise. The `estimated=false` restriction applies only to picking `last` (see
P3-6), which the JS grouping can honour. One round trip replaces ~150.

**Verify:** `MSYS_NO_PATHCONV=1 vercel api /v2/observability/query` on
`vercel.external_api_request.count` grouped by `origin_route` before and after; `/gym/api/plan`
should fall by two orders of magnitude. The probe suite must still pass (suggestions and trends
render identically).

### P2-2. The /gym streak line has no horizon caveat, so a stalled mirror reads as a live streak

`getTrainingStreak` in `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\week.ts` lines
283 to 302 counts to the most recent KNOWN day, correctly. The conditioning overview prints the
honest companion line ("Counted to <date>, the last day the watch mirror has reached",
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\conditioning\page.tsx` lines 105 to
110). But `/gym` renders only `{streak.run}-day streak` plus the over-rule warning
(GymClient.tsx lines 574 to 578). If the 07:15 sync stalls for three days, /gym keeps asserting a
streak (or an over-rule warning) that ended at the horizon, with nothing marking it stale. That is
the exact direction week.ts's own comments say an error must never go. Otherwise the streak logic
is sound: it reads `health_watch_session` across all kinds, so swims and `other`/`other-auto` count
via the watch mirror, and app-logged days count via `gym_set` (week.ts lines 224 to 231).

**Fix:** add the last-known date to the `TrainingStreak` interface (week.ts already computes
`lastKnown` inside `actualBlock`), and have GymClient append ", counted to <shortDate>" whenever
that date is before yesterday, mirroring the conditioning page.

**Verify:** unit-style: call `getTrainingStreak` against a date window whose horizon is three days
back and assert the rendered string names the date. Screenshot /gym at 390px to confirm the line
still fits.

### P2-3. Two ways to read "today's session row" break down the day two rows exist for one date

The client stamps every set with `day: activeDay`, and `upsertSet` creates a `gym_session` row per
`(date, day)` (db.ts lines 51 to 58). One set ticked on the wrong day tab and unticked creates a
second session row for the date (the gym_set row becomes done=false and invisible to the queries,
the gym_session row stays forever, status 'active'). Then:

- `getLastTrainingRow` (db.ts lines 162 to 168) selects `from gym_session where date = (max date
  with done sets)` with **no order-by and no day filter**: two rows come back and `rows[0]` is
  arbitrary, so `nextDay`, `cutShort` and the layoff logic in
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\cycle.ts` read a coin flip.
- `getSessionDay` (db.ts lines 155 to 158) does `order by day limit 1`, which is **alphabetical**
  (friday < monday < thursday < tuesday), not "the day he is actually training", so `todayDay` can
  open the page on the phantom day with every box empty, which is the 2026-08-14 bug's shape again.

Verified against the live store (read-only): **zero dates currently have more than one session
row**, so this is latent, not live. It is one mistaken tap away.

**Fix:** make both queries deterministic and evidence-based: pick the session row whose day
actually has done sets for that date (join on gym_set), falling back to latest `started_at`.
Alternatively (Law 1 shape): only create the session row when a set is actually `done = true`, so
an unticked mistake never mints one.

**Verify:** the read-only duplicate check used in this audit
(`select date, count(*) from gym_session group by date having count(*) > 1`) stays empty after a
deliberate wrong-tab tick-untick in a probe run (writes stubbed, so assert on the queries' JS logic
with a two-row fixture instead: a unit test of the picker).

### P2-4. A stall deload on a cable exercise suggests a weight the stack does not have

`roundLoad` in progression.ts lines 73 to 76 keeps sub-5 increments "intact" by rounding to 0.1 lb.
The deload branch (line 159) computes `roundLoad(w * 0.9, increment)`: for `seated-cable-row`,
`tricep-pushdown`, `cable-pallof` or `straight-arm-pulldown` (all `increment: 2.5` in program.json)
a stall at 72.5 lb suggests **65.3 lb**, a pin position that does not exist. The +increment paths
are safe (a multiple plus 2.5 stays a multiple); only the 0.9 multiply misaligns.

**Fix:** when `increment < 5`, round to the nearest multiple of the increment
(`Math.round(w / increment) * increment`), not to 0.1.

**Verify:** the plan route again (open, read-only): post a 3-session stalled fixture shape or, more
simply, a one-line node test file exercising `suggest` through `tsx` in the repo's test pattern;
assert the deload for 72.5 at increment 2.5 is 65 not 65.3.

### P2-5. check-ladder.mjs never checks alts, and a swap inherits the parent's increment and rangeWidth

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\check-ladder.mjs` lines 103 to 135
iterate `block.exercises` only; `ex.alts` are never visited, yet a set logged under an alt is
stored under the ALT's id and progresses on the alt's own numbers. Worse, `effectiveExercise` in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\program-shared.ts` lines 148 to 150
is `{ ...ex, ...swap }`, so an alt that does not declare `increment` or `rangeWidth` silently
inherits the parent's, which was tuned for different equipment. Only 3 of the 110 alts in
program.json declare an increment; none declare rangeWidth. A regularly-trained alt (he swaps a
lot; see notes #15 and #16) can be an open rung the daily gate never sees.

**Fix:** in check-ladder.mjs, also iterate alts, resolving each alt's effective
increment/rangeWidth exactly as `effectiveExercise` would, and check any alt id that has logged
weights in the lookback window. Do it with the same working-weight rule so the check measures what
the engine uses.

**Verify:** run `node scripts/check-ladder.mjs` (it is read-only against Neon) and confirm the
checked-lifts list now includes alt ids that have rows in gym_set (e.g. any alt he has logged).

### P2-6. run-probe-gym.mjs clears localStorage in whatever browser it is pointed at, including his real Chrome profile

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\run-probe-gym.mjs` line 154 runs
`localStorage.clear()` on the target origin. The documented driver is the Chrome on CDP 9222,
which is Silvio's own logged-in browser (per HOODII/CLAUDE.md, "leave his tabs alone"). Pointed at
`https://hoodii.studio`, the clear wipes `gym:swaps:<today>` for the whole profile: a swap he
picked at the gym but has not lifted yet (the exact state localStorage exists to hold,
GymClient.tsx lines 123 to 129) is gone from the world. It also wipes every other origin-local
convenience. Writes stay stubbed; this is purely the localStorage half.

**Fix:** create an isolated browser context for the probe (`Target.createBrowserContext` plus
`Target.createTarget` with `browserContextId`) so the run starts clean without touching the
profile; or, minimally, remove only the keys the probe owns (`gym:swaps:*` for today plus
`__probeSwap`) and refuse `--base https://hoodii.studio` without an explicit flag.

**Verify:** set a sentinel key in the profile, run the probe against localhost, confirm the
sentinel survives in a normal tab.

## P3. Polish, dead code, stale prose

### P3-1. progression.ts claims a gate that lives somewhere else

`src\lib\gym\progression.ts` line 65: "content/gym/validate.mjs computes this for every logged
exercise and fails the build on a gap." False: validate.mjs is offline by design and the check is
`scripts/check-ladder.mjs`, run by the 07:15 task (check-ladder's own header, lines 33 to 35,
explains why it CANNOT be in validate.mjs). A stale claim about a mechanism is the corollary
ENGINEERING.md warns about. Fix the sentence.

### P3-2. The layout comment claims a login layout that does not exist

`src\app\gym\layout.tsx` lines 23 to 25: "The login page is deliberately the one exception and it
has its own layout." There is no `src/app/gym/login/layout.tsx` (glob confirmed: the only layout
under /gym is the one making the claim), so `/gym/login` renders SiteHeader and GymNav. Harmless
visually, but the comment describes a structure that is not there. Either add the layout or fix the
comment to say the nav intentionally renders on login.

### P3-3. /gym/api/next is dead and should be deleted

`src\app\gym\api\next\route.ts` has zero callers (computeNextUp is called server-side by
`src\app\gym\page.tsx` and `src\app\page.tsx`), and it is the one read-shaped POST proxy.ts does
NOT exempt, so any future client call 401s. `scripts/lint-probe-routes.mjs` lines 42 to 45 already
flag it as "dead ... a candidate for removal". Delete the route and its `READ_ONLY_POSTS` entry in
the same commit (the linter's stale-entry check will enforce the pairing).

### P3-4. finishSession with a null day matches nothing and still reports ok

`src\lib\gym\db.ts` lines 141 to 144: `where date = ${date} and day = ${opts.day ?? null}`; in SQL
`day = null` is never true, so a finish request without a day updates zero rows while
`src\app\gym\api\finish\route.ts` returns `{ ok: true }`. The client always sends `day`, so this is
latent, but the route reports intent, not outcome. Fix: require `day` in the route (400 without
it), or use `day is not distinct from ...`.

### P3-5. A typed note does not survive a reload, and a flushed queued note invites a duplicate

The note box (`GymClient.tsx` lines 167, 408 to 421, 764 to 810) holds the only unsaved copy of a
sentence: an accidental reload before Save loses it entirely, which is the one loss mode the
save-path design (keep the text unless the write landed) exists to prevent. And after a queued note
flushes via the banner, the box still shows the text and `notesSaved` does not increment, so a
third copy is one tap away (the double-post on flush is a documented trade; the box-not-clearing
after a successful flush is not). Fix: mirror the draft to sessionStorage on change, clear it and
the box when a `note:` key lands in `write()` (a small callback or a check in `retryAll`).

### P3-6. getRecentSessions does not filter `estimated`, getLastSession does

`src\lib\gym\db.ts`: line 97 restricts `last` to `coalesce(estimated, false) = false`; lines 117 to
120 apply no such filter to the stall-detection window. Once the `estimated` input ships (redesign
plan C5), a backfilled session would count toward "stalled 3 sessions" while being excluded from
`last`. Align the two before C5 lands.

### P3-7. localStorage swap keys accumulate forever

`swapKey(date)` (GymClient.tsx line 129) creates one key per date and only ever removes today's
when its map empties. Years of `gym:swaps:YYYY-MM-DD` keys build up. One line in the restore
effect can delete keys older than yesterday.

### P3-8. The overview's "Your last session" is specifically the last lift, and the label does not say so

`src\app\gym\conditioning\page.tsx` lines 309 to 312 map the week tab to kind `strength`, and
`src\components\training\LastSession.tsx` titles it "Your last session". On the one tab that is
about the whole week, the most recent session may be a swim while the panel shows an older lift.
Retitle per kind ("Your last lift") or pick the most recent session of any kind on that tab.

### P3-9. Set-row inputs compute to roughly 40px tall, under the repo's 44px floor

`src\app\training.css` lines 171 to 183: 16px font plus 9px vertical padding plus borders is about
40px, while the done-toggle in the same row was explicitly raised to 2.75rem (44px) for the tap
floor (line 168's comment) and every other control on the surface holds 44px. These are the two
most-tapped inputs in the app, mid-set, sweaty hands. This is computed from the CSS, not measured;
measure on a real 390px screenshot before changing anything, and any edit to training.css must be
coordinated with the swim agent, the file is shared with /swim.

### P3-10. The workout page's day tab is client state, not a URL

Every view of /gym/conditioning is a URL (`?p=&s=`, verified, including the `?p=swim` 307 to /swim
preserving `?s=`), but the day tabs on /gym (`GymClient.tsx` lines 531 to 537) are `useState`. A
reload lands on `todayDay ?? nextDay`, which is the right default and is data-derived, so this may
be deliberate; but a day he selected by hand does not survive a reload or make a shareable URL,
which is the exact idiom the conditioning page adopted for that reason. Decide, and if it stays
client state, say why in the comment above `activeDay`.

## What is actually good

- **The write net is real and layered.** Probe stubbing, the route linter (run clean today), the
  proxy prefix plus matcher pair with the 2026-08-26 two-edit lesson written at both sites, and
  read-only POSTs exempted by name with the reasoning attached. Nothing in scope writes outside the
  cookie gate.
- **The write path itself is honest.** `write()` in GymClient returns observed outcomes, queues
  keyed so retyped values collapse to one owed write, the finish cannot double-post
  (`finishLandedRef` set inside `write` itself), a refused finish changes the screen, and a refused
  note stays in the box. `SaveBlocked` counts only what it can name.
- **The swap system closes its loop.** Slot vs effective exercise separated in the DOM
  (`data-slot`/`data-eff`), the log's `swapped_from` re-derives swaps on any device, localStorage
  covers the picked-not-yet-lifted minute, and the probe drives every leg of it including a
  fixture-driven hydrate and a real reload pair.
- **The probe harness distrusts itself correctly.** `canBlur()` refuses to run rather than blame
  the app, the driver sets focus emulation and checks the served build id, and failing tests report
  what they observed.
- **The dishonest-number lesson holds on these pages.** Bike says HR-only in words
  (`sessionVerdict`, session.ts lines 135 to 137), lifting says what a wrist HR cannot judge, the
  swim panel splits "Pace swimming" from "Pace with rest", the week strip draws unknown days as
  unknown rather than rest, and the recovery notice refuses to let arithmetic impersonate a
  measurement.
- **One streak (redesign C1) is genuinely shipped**: `computeNextUp` returns none, the hub and /gym
  both read `getTrainingStreak`, and it counts app-logged days as well as watch days.
- **Time and dates are consolidated**: `lib/day.ts` Calgary formatter used by client and server
  alike.
- **validate.mjs earns its keep**: zone routing, pairing physics, header claims, progression axes,
  duplicate names against warmups, and the planned week checked against its own rest rule.
- **Costs are mostly sane already**: conditioning runs zero Neon queries on the plan/how tabs, the
  conditioning JSON never ships to the client (server component), and /gym's ~80KB program payload
  is the price of client-side day tabs, worth knowing (measured: program 76KB stripped, warmups
  2.1KB, cooldowns 2KB, rir 0.4KB per force-dynamic request), not worth changing today.

## Open work from the redesign plan (not bugs, do not re-file)

Per `docs\TRAINING-REDESIGN-PLAN-2026-08-26.md`: `getRecentSessions(kind)` in
`src\lib\gym\session.ts` still has zero page callers; run speed trace unrendered; `rir` and
`estimated` columns unfillable (C5, a decision, see the GymClient comment); notes unreadable on any
page (item 5, paired with P1-2 here); `/gym/conditioning` scheduled for deletion in Phase C with
its contents redistributed; the `bike_ride` write path (D2) must land with proxy, linter and
WRITE_ROUTES edits in one commit.

## Severity counts

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 3 |
| P2 | 6 |
| P3 | 10 |
