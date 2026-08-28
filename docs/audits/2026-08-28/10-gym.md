---
audit: /gym, hoodii.studio, the surface as it stands after the 2026-08-27 rebuild
date: 2026-08-28
repo: hoodii-studio-site @ 5151558 (main)
mode: adversarial, read-only. No file edited, no build run, no server started, no POST issued, no browser driven. Every database access was a SELECT.
concurrent-work: another agent was editing this tree during the audit. At 11:36 MDT it added 58 lines to `content/gym/validate.mjs` (a `{PEAK_*}` placeholder gate), 58 to `src/lib/gym/session.ts`, and created `src/lib/gym/hr-anchor.ts`; `content/gym/conditioning.json` also moved. All of it lands BELOW line 773 of validate.mjs, so every line number cited here was re-checked against the file as it stands at 11:39 and all of them hold. `node content/gym/validate.mjs` still exits 0 with their addition in place. `src/lib/gym/session.ts` is a shared file and their edit is in it: coordinate.
read-first: docs/audits/2026-08-26/03-gym.md (the PRE-rebuild audit, every finding of it re-verified below), AGENTS.md in full, .agents/ENGINEERING.md, next-session-handoff-2026-08-27-the-volume-is-on-screen-and-four-rulings-are-parked.md
scope: src/app/gym/** (page, GymClient, log, login, layout, api/*), src/lib/gym/**, src/app/training.css (SHARED, five routes), content/gym/** (program, movements, equipment, validate, validate.test, coverage-baseline), scripts/{gym-notes,gym-catalogue,gym-coverage,check-ladder,guard-live-session,probe-gym,run-probe-gym,probe-taps,verify,lint-probe-routes}
data-checked: gym_set (592 rows, 500 done, 2026-05-25 to 2026-08-27, 62 exercise ids), gym_session (34 rows, all status finished, 1 carrying sets_prescribed), gym_note (23 rows, 0 unhandled), health_watch_session, information_schema for both gym tables. Scripts RUN read-only: gym-notes.mjs (and --all), gym-coverage.mjs, gym-catalogue.mjs --pairing and --fill, check-ladder.mjs, guard-live-session.mjs, validate.mjs, validate.test.mjs, lint-probe-routes.mjs. NOT run: pnpm build, probe-gym, probe-taps, shoot.mjs.
severity-key: P0 data loss/leak/cost blowup; P1 lies to him or breaks mid-workout; P2 cost/debt/drift; P3 polish
---

# /gym audit, 2026-08-28

The hunt: a number the app puts in front of him at the rack that is wrong, a gate that matches
nothing, a tool that disagrees with its own gate, the day the page opens on, a day-boundary fault,
the round-trip count, a fix that shipped and did not reach him, an unanswered note, a rule stated in
a comment with no mechanism, and the 390px and 44px floors.

**The headline.** The note backlog is clear and the four rulings are genuinely parked, so the
co-build machinery is working. What the 2026-08-27 slot rewrite left behind is not. Six slot ids
were replaced to satisfy the new one-station placement gate, and the gate checks the `station`
field only: it does not read the `name`, the `cue`, the `why`, or the logged history. So seven cards
now carry a cue describing an implement the card is not, seven slots tell him "First time: log your
working weight" for lifts he did on 2026-08-25, the calf raise offers **5 lb** for a machine he
loaded to **210 lb** three days ago, and four of the nineteen parked questions state something false
about the card they will be read next to. Every one of those passes `validate.mjs`, `validate.test.mjs`,
`gym-coverage`, `gym-catalogue --pairing` and `check-ladder`. The data stopped lying in the one field
the gate reads.

---

## P0. Data loss

### P0-1. The off-plan capture box overwrites a set it already wrote, silently, and its own autocomplete makes the collision likely

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 444 to 459 (`logExtra`), line 178 (`extraLog` state), lines 890 to 900 (the datalist); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` lines 131 to 149 (`upsertSet`); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\program.ts` lines 68 to 73 (`loadExtraSuggestions`).
- Evidence, three parts.

  One, the set index is derived from client state that does not survive a reload:

  ```
  const idx = extraLog.filter((e) => e.id === id).length + 1;
  void write(`extra:${date}:${id}:${idx}`, '/gym/api/set', { ... setIdx: idx, ... });
  ```

  `const [extraLog, setExtraLog] = useState<...>([]);` (line 178) is never rehydrated. The hydrate
  effect at lines 314 to 367 reads `/gym/api/session` and writes only into `sets`, never into
  `extraLog`.

  Two, the write is an unconditional upsert on exactly that key:

  ```
  on conflict (date, exercise_id, set_idx) do update set
    exercise_name = excluded.exercise_name, ... weight = excluded.weight, reps = excluded.reps,
  ```

  So: log an off-plan set, reload the page (or let the phone drop the tab, which is the documented
  reason the whole queue-and-retry machinery exists), log a second set of the same movement, and the
  first row is replaced. `write()` returns true, the banner stays clean, and the extra-list on screen
  shows one item because it also restarted empty.

  Three, off-plan rows share the `(date, exercise_id, set_idx)` key space with PRESCRIBED rows and
  nothing checks it, while `loadExtraSuggestions` feeds the datalist every variant name in the
  catalogue, including the names of exercises prescribed that very day. On Tuesday, typing or picking
  "Dead Bug" in the off-plan box writes `exercise_id: dead-bug, set_idx: 1` and overwrites the first
  prescribed dead-bug set of the day, with no reload needed.
- Why it matters in his terms: this box exists because of what he said walking out the door, quoted
  in the file at lines 159 to 174: *"there are no knee raises here, I'm going to do them and you're
  not going to see it."* The comment calls it "the most load-bearing thing on this page". It is the
  only record of substituted work, and it is the one write path on the surface that can destroy a row
  it already wrote. Every analysis of completion percentage, including the one that cut the programme
  from 148 sets to 110, is built on these rows.
- Fix (eliminate the class, do not count in the client): stop deriving `set_idx` from client state.
  Two changes, both mechanical.
  1. Give off-plan rows their own key space. Either prefix the id (`offplan:<slug>`) so a collision
     with a prescribed slot is unrepresentable, or add `off_plan boolean` to the conflict target. The
     first is cheaper and needs no migration, but it splits history from the catalogue id, which is
     the opposite of what `logExtra`'s comment wants. Prefer the second only if that history join
     matters.
  2. Compute the index on the SERVER: in `/gym/api/set`, when the request carries an `offPlan: true`
     flag, `set_idx = coalesce(max(set_idx), 0) + 1` for that `(date, exercise_id)` inside the same
     statement. The client then never names an index it cannot know.
  Also rehydrate `extraLog` from `/gym/api/session` so the on-screen list is not silently empty after
  a reload: the rows are already returned by `getSessionForHydrate`, they are simply the ones whose
  `exercise_id` matches no card.
- Verify: read-only reproduction first, no writes needed. `select date, exercise_id, set_idx,
  count(*) from gym_set group by 1,2,3 having count(*) > 1` is empty today and will stay empty,
  because the upsert is what hides this: the evidence of the loss is that the row's `logged_at` moves
  while its values change. After the fix, add a probe case (writes are stubbed, so this is safe) that
  posts two off-plan sets of one name across a simulated reload and asserts two distinct `setIdx`
  values in the captured request bodies.

---

## P1. Lies to him, or breaks mid-workout

### P1-1. The calf raise card offers 5 lb for a machine he worked at 210 lb three days ago

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\program.json` lines 406 to 414 (Monday) and 1292 to 1300 (Thursday); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` lines 156 to 167 (`getLastSession`); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\progression.ts` lines 108 to 123 (the gap branch).
- Evidence, recomputed against live Neon and stated as arithmetic, not as an impression.

  Both calf slots are `"id": "standing-calf-raise"`. Every real row under that id in `gym_set`:

  ```
  standing-calf-raise  2026-06-09  set 1  weight 0  reps 12  done true  estimated false
  standing-calf-raise  2026-06-09  set 2  weight 0  reps 12  done true  estimated false
  standing-calf-raise  2026-06-09  set 3  weight 0  reps 12  done true  estimated false
  standing-calf-raise  2026-07-15 / 2026-08-02 / 2026-08-08   weight NULL  reps NULL  done false
  ```

  His actual calf work sits under a different id:

  ```
  machine-calf-raise  2026-08-27  set 1  weight 180  reps 9   swapped_from db-calf-raise
  machine-calf-raise  2026-08-27  set 2  weight 180  reps 9   swapped_from db-calf-raise
  machine-calf-raise  2026-08-27  set 3  weight 210  reps 8   swapped_from db-calf-raise
  ```

  `getLastSession('standing-calf-raise', '2026-08-28')` therefore returns 2026-06-09 at weight 0.
  `suggest()` takes the long-gap branch (gap 80 days, `GAP_DAYS = 21`), `workingWeight` returns 0, and
  `roundLoad(0 + 5, 5)` returns 5. The card renders, from GymClient line 794:

  ```
  5 lb x 12    Last log 80d ago, probe: old weight +5 lb, adjust live.
  ```

  And the swap is not recoverable either: `swapped_from` says `db-calf-raise`, a slot id that no
  longer exists in `program.json`, so the rehydrate at GymClient lines 356 to 361
  (`findExercise(day, s.swapped_from)`) returns null and restores nothing.
- Why it matters in his terms: he is standing at a machine he has loaded to 210 lb and the app says
  5. It is the single most wrong number on the surface, it is on two of the four days, and one of the
  nineteen parked questions already tells him the app knows he worked 180 to 210 lb here. The app
  knows and the card does not.
- Fix, and note which half is his: the DATA question ("does the calf raise live on the machine or at
  the dumbbells") is question 4 in the handoff and stays parked. The MECHANISM defect is separate and
  is an agent's to fix: a slot whose id was renamed orphans its history and nothing notices.
  1. Add a gate. `scripts/check-ladder.mjs` already reads Neon and already prints "not yet logged,
     nothing to check against" for nine slots. Make it exit non-zero, or print a distinct warning
     line, when a slot has NO history under its own id while an id it was renamed FROM does have
     history. The rename evidence is free: `select distinct swapped_from from gym_set where
     swapped_from is not null` returns ids that no longer exist in `program.json`, which is exactly
     the orphan set.
  2. For this instance specifically, do not repoint the slot id by hand until he answers question 4.
     The reversible move meanwhile is to make the ABSENCE visible: the three `weight: 0` rows from
     2026-06-09 are the whole cause of the "5 lb" number, and `getLastSession` should not treat a
     weighted exercise logged at zero as a working weight. `and (weight is null or weight > 0)` on
     line 160, alongside the existing `estimated` filter, turns "5 lb x 12" into "First time: log
     your working weight", which is false-but-harmless rather than false-and-actionable. That is the
     reversible fix under uncertainty.
- Verify: `/gym/api/plan` is deliberately open and read-only (`src/proxy.ts` line 69), so this is
  checkable without touching his log: `curl -X POST https://hoodii.studio/gym/api/plan -H
  'content-type: application/json' -d '{"date":"2026-08-29","exercises":[{"id":"standing-calf-raise","targetReps":12,"type":"weighted"}]}'`
  and read `exercises[0].suggestion`. It says `weight: 5` today.

### P1-2. Seven slots say "First time: log your working weight" for lifts he did on 2026-08-25, because the 2026-08-27 rewrite changed their ids and left the history behind

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\program.json` lines 237 (`db-rdl`), 645 and 1576 (`cable-overhead-tricep-extension`), 885 (`cable-reverse-fly`), 1623 (`incline-db-curl`), plus `cable-pallof`, `leg-curl`, `suitcase-carry`; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\progression.ts` lines 104 to 106.
- Evidence. `check-ladder.mjs`, run today, prints the set itself:

  ```
  not yet logged, nothing to check against: monday/db-rdl, monday/standing-calf-raise,
  tuesday/cable-overhead-tricep-extension, tuesday/cable-pallof, tuesday/cable-reverse-fly,
  thursday/leg-curl, thursday/standing-calf-raise, friday/cable-overhead-tricep-extension,
  friday/incline-db-curl
  ```

  Two of those have three-day-old history under the id they replaced:

  ```
  db-overhead-tricep-extension  2026-08-25  42.5x10, 50x10, 50x10   (2 dates, 6 rows)
  ez-preacher-curl              2026-08-25  90x6, 90x5              (2 dates, 5 rows)
  ```

  `suggest()` with no last session returns
  `{ weight: null, reps: bottom, reason: 'First time: log your working weight.' }`, so nine of the
  week's 36 logged slots render that sentence, and for `cable-overhead-tricep-extension` (twice) and
  `incline-db-curl` it is false: he did the movement on 2026-08-25.
- Why it matters in his terms: the progression engine is the reason to open the page. On Friday it
  will ask him to establish a working weight for the overhead extension he did at 50 lb on Tuesday
  the 25th, and for the curl he did at 90 lb the same evening. The trend line disappears with it
  (`Trend` needs three points, GymClient line 85).
- Fix, and the judgment split matters here. Whether a cable overhead extension inherits a dumbbell
  overhead extension's LOAD is a real question with a real answer of "no" for some pairs
  (`db-overhead-tricep-extension` at 50 lb of dumbbell is not 50 lb of cable) and "probably" for
  others (`ez-preacher-curl` to `incline-db-curl` is a different angle at a similar load). **Put it
  to him as an option set, do not pick.** The two options, with costs:
  - Option A, leave the ids split. Cost: the app says "first time" on three cards on his next two
    sessions and the old rows never trend again. Zero work.
  - Option B, carry the history across with a one-time id remap in `gym_set` (a script, reviewed,
    with the old ids recorded). Cost: the trend line then mixes a dumbbell load with a cable load on
    one axis, which is the two-metrics-in-one-column fault `pace_per_100m_ms` was split to avoid.
  The MECHANISM half, which is an agent's: nothing warned that a slot id changed and its history did
  not follow. Same gate as P1-1 fix (1).
- Verify: after the gate lands, `node scripts/check-ladder.mjs` must name the orphan pairs
  explicitly, not merely list the slots as unlogged. Its current line cannot distinguish "new
  exercise" from "renamed exercise whose history is stranded", and those have opposite fixes.

### P1-3. Bodyweight and timed suggestions are capped at the top of the rep range, so the app asked for 5 box jumps after he did 10 and 42 seconds of carry after he did 130

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\progression.ts` lines 127 to 134.
- Evidence, the code:

  ```
  if (type === 'bodyweight' || type === 'timed') {
    const repsList = sets.map((s) => s.reps ?? 0);
    const minReps = Math.min(...repsList);
    if (minReps >= top) {
      return { weight: null, reps: top, reason: `Hit ${repsList.join('/')}: add load or progress the movement.` };
    }
  ```

  `reps: top` where `top = bottom + (rangeWidth ?? 2)`. It is not a suggestion to hold, it is a
  suggestion to do fewer, and the app already wrote it into his log. Straight from `gym_set`:

  ```
  box-jump      2026-08-27  set 1  reps 10   suggested_reps 5
  box-jump      2026-08-27  set 2  reps 10   suggested_reps 5
  box-jump      2026-08-27  set 3  reps 10   suggested_reps 5
  farmer-carry  2026-08-25  set 1  reps 130  suggested_reps 40   suggested_weight 55
  pushup        2026-08-25  set 1  reps 20   suggested_reps 8
  ```

  Recomputed for today: farmer carry is `timed: true, reps: "40s"` since the 2026-08-27 unit fix, so
  `bottom = 40, top = 42`, `minReps = 130 >= 42`, and the card now reads **`x 42`** with
  "Hit 130/130: add load or progress the movement." Box jump is `bodyweight: true, reps: "3"`, so
  `bottom = 3, top = 5` and the card reads **`x 5`** after three sessions of 10.
- Why it matters in his terms: this is the same defect class as 03-gym's P1-3 (the carry's unit), and
  fixing the unit exposed it rather than removing it. The carry now progresses on time only, so the
  engine can no longer suggest more load, and the number it does suggest is a third of what he just
  did. Open question `program.json` line 166 asks him "How many did you mean to do?" about the box
  jump card, which is the right question, but while it is parked the app keeps printing 5.
- Fix, and the honest split. The MECHANISM half: never suggest fewer than the last session's own
  floor. Replace `reps: top` with `reps: Math.max(top, minReps)` and change the reason to name what
  it is telling him, for example `Hit ${repsList.join('/')} at the top of the range: hold here, or
  add load and drop back to ${bottom}.` That is arithmetic and unit consistency, which the co-build
  table puts squarely on the agent side. The JUDGMENT half stays his: what a box jump or a lateral
  bound should actually progress on is open question `program.json` lines 166 and 987, parked and due
  2026-09-10. Do not answer it.
- Verify: a one-line node exercise of `suggest` through the plan route, which is safe to POST:
  `-d '{"date":"2026-08-29","exercises":[{"id":"farmer-carry","targetReps":40,"type":"timed"}]}'`
  must return `reps` at or above 130, never 42.

### P1-4. The front squat currently reads "deload to 105", and the stall it is deloading for is two sessions in which he logged one set each

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\progression.ts` lines 145 to 161; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` lines 179 to 189 (`getRecentSessions`).
- Evidence. The three most recent front-squat sessions in `gym_set`, done and with real reps:

  ```
  2026-08-27   115x8  115x8  115x8      (3 sets, against a prescription of 2)
  2026-08-23   115x8                    (1 set)
  2026-08-18   115x8                    (1 set)
  ```

  `sameW` is true (115 three times), `noProgress` is true (`8 <= 8 && 8 <= 8`), `last3[0].min` is 8
  and `top` is 10, so the stall branch fires and `roundLoad(115 * 0.9, 5)` is 105. The card reads:

  ```
  105 lb x 8    Stalled 3 sessions at 115: deload to 105, build back up.
  ```

  The stall detector counts a session by DATE and takes whatever sets that date holds. A date with one
  logged set weighs the same as a date with three. `getRecentSessions` line 182 filters only
  `done = true and reps is not null and reps > 0`; there is no minimum-sets condition anywhere.
- Why it matters in his terms: two days ago he did three sets of eight at 115 against a prescription
  of two sets, which is more work than the day asked for, and the app's answer is to take 10 lb off.
  Its own header (lines 10 to 11) says "a deload is a MULTI-session stall signal ... and one bad day
  never triggers it". The whole point of `/gym/log` is that his sessions are systematically
  under-logged: 31 lifting sessions in June and July have no app rows at all. A detector that treats
  a partial log as a full session is guaranteed to misfire on this user.
- Fix: require evidence, not a date. In the `rec` window, keep only sessions whose logged set count is
  at least half the prescribed count for that exercise, or, simpler and needing no programme lookup,
  at least 2. One line inside the `last3` map, or a filter on `plan.recent` before it. Say in the
  reason how many sessions were actually counted, so the claim carries its own evidence:
  `Stalled 3 sessions (3, 1 and 1 sets logged) at 115` is a sentence he can judge, and "3 sessions"
  is not.
- Verify: post the front squat to `/gym/api/plan` before and after. Before returns
  `weight: 105, reason: "Stalled 3 sessions at 115..."`; after it must return
  `weight: 115, reps: 10, reason: "Got 8/8/8 at 115: hold, build to 10."`

### P1-5. The assisted pull-up progresses the wrong way, and its own cue says so on the same card

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\program.json` line 1438 and the cue below it; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\progression.ts` lines 163 to 166; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\check-ladder.mjs`.
- Evidence. The slot: `"increment": 10, "progression": "weight"`. The cue, on the same card:

  > "Log the COUNTERWEIGHT, and remember it is the one number here that should go DOWN over time.
  > When 6 feels easy, take 10 lb of assistance off"

  `suggest`'s weighted branch, when he hits the top of the range:

  ```
  const next = roundLoad(ww + increment, increment);
  return { weight: next, reps: bottom, reason: `Hit ${wd} at ${ww}: +${increment} lb.` };
  ```

  So the first time he gets 8/8/8 at 40 lb of counterweight the card will read "50 lb x 6, Hit
  8/8/8 at 40: +10 lb", which is 10 lb MORE assistance and an easier set. There is no `inverse`,
  `assistance` or `counterweight` flag anywhere in `src/`, `scripts/` or `content/gym/*.json`
  (grepped). `check-ladder.mjs` inherits the same assumption and produces a finding from it:

  ```
  friday/assisted-pullup at 40 lb: 6-8 banks 50.7 but +10 lb demands 60.0.
  ```

  Epley on a counterweight is not a strength estimate at all, so that row is a false finding, and it
  is one of the five that the handoff parks as a single question to him ("Widen the rep range ... or
  accept the stall").
- Why it matters in his terms: he is not stalled on the assisted pull-up and there is no rep range to
  widen. Asking him to rule on it wastes one of the four parked questions and teaches him that
  `check-ladder`'s output needs discounting, which is exactly what happened with `--pairing`.
- Fix, two mechanical steps and one thing to leave alone.
  1. Model the axis. Add `"inverse": true` to the assisted pull-up slot (and to `assisted-dip`, which
     has the same fixture), have `suggest` subtract the increment where it currently adds, and have
     `validate.mjs` refuse `inverse: true` on an exercise whose station is not one of the assistance
     machines in `equipment.json`. Two regression cases in `validate.test.mjs`, both directions.
  2. Have `check-ladder.mjs` SKIP inverse exercises and print them under a separate heading, the way
     it already prints "not yet logged, nothing to check against".
  3. Do not rewrite the cue. It is already correct and it is his text.
- Verify: `node scripts/check-ladder.mjs` must drop from 5 findings to 4 and list the assisted
  pull-up as skipped. Then POST a fixture of 8/8/8 at 40 to `/gym/api/plan` and confirm the
  suggestion is 30, not 50.

### P1-6. Four of the nineteen parked questions state something false about the card they sit on

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\program.json` lines 747, 834, 1525 and 987.
- Evidence, each paired with the slot it is attached to.

  Line 747, on the slot whose `id` is `db-lateral-raise` (line 717) and whose cue reads "A dumbbell in
  each hand hanging at your sides":

  > "This slot moved from db-lateral-raise to cable-lateral-raise on 2026-08-27 so the partner sits at
  > the lead lift's own station. THE CUE BELOW STILL DESCRIBES THE OLD IMPLEMENT."

  The very next `open` row on the same exercise, line 752, says it moved back: "Moved to the cable on
  2026-08-27 and moved back the same hour". The slot is a dumbbell and the cue is correct.

  Line 834, on `db-hammer-curl` (line 803), cue "A dumbbell in each hand hanging by your sides": same
  false claim, and line 839 on the same exercise says why it moved back.

  Line 1525, on `db-reverse-fly` (line 1495), cue "A dumbbell in each hand": same false claim, and
  line 1530 says why it moved back.

  Line 987, on `lateral-bound` (line 948, `"reps": "4/side"`):

  > "The card says 3 sets of 3 and on 2026-08-27 you logged 10 reps a set."

  The card says 3 sets of 4 per side. And `lateral-bound` has exactly one date in `gym_set`,
  2026-08-18, at bodyweight for 6 reps: there are no 2026-08-27 rows for it at all. Both factual
  claims are false; the row is a copy of the box-jump row at line 166, where both claims are true.
- Why it matters in his terms: rule 3 of the co-build protocol is "he is never asked twice", and its
  mechanism is `gym-notes.mjs`. `node scripts/gym-notes.mjs` prints all nineteen, so the next time he
  is handed the list he will be asked to rule on three cues that are already right and on a card that
  says something other than what the question quotes. Note #21, written 2026-08-27, is already
  *"There's still old text in the why is here things"*. This is the same complaint one layer down, in
  the mechanism built to answer it.
- Fix: delete lines 747 to 751, 834 to 838 and 1525 to 1529 (the three reverted moves; the surviving
  `open` row on each exercise already records the reversal and its reason). Rewrite line 987 against
  the lateral bound's own card and its own history, or delete it and leave the box-jump row at 166 to
  carry the question, since it is one ruling covering both primers.
  **Then gate the class**, because this will recur on the next rebuild: `validate.mjs` already parses
  every `open` row's shape. Have it refuse an `open` question that names an exercise id which is not
  the id it is attached to and is not present anywhere in `program.json` (that catches
  `cable-lateral-raise`, `cable-curl` and `pec-deck-reverse`, all three of which appear in a live
  question and in no slot). Add a regression case in
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\validate.test.mjs` that mutates an
  `open.q` to name a non-existent id and asserts the refusal.
- Verify: `node scripts/gym-notes.mjs` drops from 19 to 16 open questions, and no printed question
  names an exercise id absent from `program.json`.

### P1-7. Seven cards carry a cue describing an implement the card is not, and one of them asserts the exact falsehood the new placement gate was built to make unrepresentable

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\program.json`.
- Evidence, card by card, name and station against the cue that renders under "How to do it"
  (GymClient lines 777 to 780).

  | Slot | Line | Card says | Cue says |
  |---|---|---|---|
  | `cable-overhead-tricep-extension` (Tue) | 645 | "Cable Overhead Tricep Extension", station `cable-pulldown` | "ONE dumbbell held in both hands, cupping the top end like a mug" |
  | `cable-overhead-tricep-extension` (Fri) | 1576 | same | same |
  | `cable-reverse-fly` | 885 | "Cable Reverse Fly", station `cable-adjustable` | "A dumbbell in each hand. Push your hips back and lean your chest forward to about 45 degrees" |
  | `incline-db-curl` | 1623 | "Incline DB Curl", station `bench` | "The zed bar with the seat ... Grip the angled part of the bar" |
  | `db-rdl` | 237 | "DB Romanian Deadlift", station null | "Bar stays touching your legs the whole way" |
  | `standing-calf-raise` (Mon) | 406 | "DB Standing Calf Raise", station `calf-raise` | "Done holding dumbbells on the floor by the bench, NOT on the calf machine" |
  | `standing-calf-raise` (Thu) | 1292 | "DB Standing Calf Raise", station `calf-raise` | "Done holding dumbbells at the machine bank, standing, so it needs no fixture of its own" |

  The last one is the sharpest. The slot DECLARES `"station": "calf-raise"` and its cue says it
  "needs no fixture of its own". The 2026-08-27 gate exists because that slot used to carry
  `station: null`, and the handoff's own words are *"The block passed because the data lied"*. The
  field was corrected and the identical claim survived in the cue, where no gate reads it. Monday's
  card is worse still: its cue says "NOT on the calf machine" while its own block `why` (line 443)
  says the opposite, *"it is a machine across the floor, so sharing one rest window would mean walking
  between them every set"*, and the block is a `sequence` for precisely that reason. The cue, the
  name, the station and the why are four statements about one exercise and two of them are wrong.
- Why it matters in his terms: the cue is the one thing on the card that tells him what to pick up. He
  is at a cable column being told to cup the end of a dumbbell like a mug. Four of these seven are
  covered by an `open` question that says the cue is stale, but **the open question does not render
  on the page** (see P1-8): on the phone there is nothing but the wrong instruction.
- Fix. **Do not write the cue text.** Eight of the nineteen parked questions are cue text and the
  handoff's WHAT NOT TO DO names it. What is an agent's:
  1. **Make the staleness visible on the card.** An exercise carrying an `open` row whose question
     mentions the cue currently shows nothing about it. Render one short line, derived, not authored:
     the count of open questions on that exercise, as a link or a folded row. Cost, measured against
     the 390px budget already in the file (4 to 6 clauses a day, 164 to 246px): nine slots carry open
     rows, one line each, roughly 17px per line. Put the size to him before shipping it, because
     "how much text is too much" is his column in the co-build table.
  2. **Gate the class.** The name and the cue are prose, but the IMPLEMENT nouns in them are
     checkable. `validate.mjs` already owns `TAG_EQUIPMENT` and already refuses a block tag naming
     kit no exercise uses (line 596). Extend the same table: refuse a cue containing "dumbbell" on a
     slot whose station is a cable or machine fixture, refuse "bar" or "barbell" on a slot whose id
     begins `db-`, refuse "NOT on the <fixture>" or "needs no fixture" on a slot that declares one.
     This is a keyword gate and the kitchen validator's bare-colour-endpoint gate got four out of
     four wrong on its first live run by being one, so **write the regression cases first and include
     the passing direction**: the correct dumbbell cues on `db-lateral-raise`, `db-hammer-curl` and
     `db-reverse-fly` must survive it. Five cases minimum, three of them assertions that correct data
     passes.
- Verify: `node content/gym/validate.mjs` must fail on the current file at all seven rows above and
  pass once each cue is his. `node content/gym/validate.test.mjs` must show the new cases refusing
  and the three correct dumbbell cues passing.

### P1-8. Seven of the thirteen partner cards render no reason at all, because the gate accepts an alternative he cannot see

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\validate.mjs` lines 514 to 519; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` line 762.
- Evidence. The gate:

  ```
  fail(where, `partner "${partner.id}" has no "whyHere" and no "open" question. It sits at position 2
  and every "why is this here" note he has written names a position-2 exercise. ...`);
  ```

  The page renders one of those two:

  ```
  {ex.whyHere && <div className="ex-why">{ex.whyHere}</div>}
  ```

  There is no reader for `ex.open` anywhere in `src/` (grepped). Counted across the live file, of the
  13 blocks with two exercises:

  | Day | Partners | With a rendered `whyHere` | Showing nothing |
  |---|---|---|---|
  | Monday | 2 | 1 (`suitcase-carry`) | 1 |
  | Tuesday | 5 | 1 (`dead-bug`) | 4 |
  | Thursday | 3 | 3 | 0 |
  | Friday | 3 | 1 (`farmer-carry`) | 2 |

  Seven of thirteen. On Tuesday, four of five partner cards show no reason, and Tuesday is the day
  notes #5 and #6 were written on (*"Why is there db standing calf here"*).

  The same exercise contradicts itself across two days: `standing-calf-raise` carries a `whyHere` on
  Thursday (line 1292 block) and nothing on Monday (line 406 block).
- Why it matters in his terms: AGENTS.md's own account of this feature is that the reasoning shipped,
  validated, rendered, named the questioned partner in 10 of 11 cases, and *"he asked the same
  question five more times over nine days"* because the tap was labelled for a different question. The
  `whyHere` field was the fix for that. The 2026-08-27 rewrite removed it from seven of thirteen
  partners and the gate stayed green, because the escape hatch it accepts renders nowhere. **A gate
  that accepts an invisible alternative cannot measure reach.** This is adversarial goal 7 in its
  purest form: nothing is broken, every check passes, and the majority of partner cards are back to
  saying nothing.
- Fix: the `open` branch of that gate must produce something on the page, or it is not an alternative
  to `whyHere`, it is an exemption. Two options, and the choice between them is his because it is
  text volume:
  - Option A, render the open questions on the card (P1-7's fix 1). Cost: roughly 17px per affected
    card, nine cards, and it puts a question in front of him mid-set.
  - Option B, render a single derived line where a `whyHere` would be: "No reason recorded yet, one
    question is open on this". Cost: one line, says less, but names the honest state, which is what
    the `open` mechanism was chosen for.
  Either way, add a regression case in `validate.test.mjs` asserting the gate still refuses a partner
  with neither, and a probe case (safe, read-only) asserting that every `.ex[data-slot]` at position 2
  of a paired block renders either `.ex-why` or the new element. That second one is the part that
  makes this not recur: the current gate checks the FILE and the failure is on the SCREEN.
- Verify: `node scripts/run-probe-gym.mjs <base>` with the new case must fail on the current build and
  pass after. Count on screen, not in the JSON.

### P1-9. Two `why` texts still describe a partner that is no longer there, which is note #21 unclosed

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\program.json` lines 683 and 1022 to 1025.
- Evidence. Line 683, the `why` of Tuesday's "Second Pattern: Vertical Pull", whose partner is now
  `cable-overhead-tricep-extension` at station `cable-pulldown`:

  > "The triceps do nothing during a pulldown, so they are what goes in its rest. **A dumbbell comes
  > to the cable stack with you**; nothing that needs the floor can, which is why this is not a plank."

  The clause justifying the partner describes a dumbbell that was removed from the slot on 2026-08-27.

  Line 1022, the `whyHere` on Thursday's `db-lateral-raise`, and line 1025, the `why` it is a span of:

  > "The lateral raise rides in the rest **for the same reason as Monday**: it is upper body, so the
  > bound stays fresh."

  Monday has no lateral raise. Monday's blocks are Power Primer (box jump alone), Main Lift: Back
  Squat (alone), Second Pattern: Hinge (alone), Single Leg + Anti-Lean (split squat plus suitcase
  carry) and Sideways, then Calves (lateral lunge plus calf raise).
- Why it matters in his terms: gym_note #24 through #20 were all written on 2026-08-27 and #21 is
  *"There's still old text in the why is here things"*. It is marked handled in `gym_note`. It is not
  fixed. The verbatim-span gate guarantees the `whyHere` matches the `why`; it cannot see that the
  `why` is stale, and here it faithfully propagated a stale sentence onto the card.
- Fix: the `why` is reasoning and reasoning is sourced, so this is a rewrite against
  `HealthOS/knowledge/training-programme-evidence.md`, not an invention. Line 683's dumbbell clause is
  simply false now and should be cut or replaced with the real reason (the extension is at the lead's
  own column). Line 1025's cross-reference should name what it actually points at or be cut; the gate
  will then force line 1022 to follow.
  **Gate:** `validate.mjs` line 436 already refuses a `why` that NAMES an exercise not in the block.
  Extend it to cross-references: a `why` containing a weekday word ("Monday", "Tuesday", "Thursday",
  "Friday") must name something that is actually on that day. Note the invisible-character lesson in
  `scripts/lint-prose.mjs`: two BACKSPACE bytes once made `/friday/i` unable to match "Friday", so
  write the regression case before the gate.
- Verify: `node content/gym/validate.mjs` must fail on line 1025 today. Then re-read the rendered
  Tuesday and Thursday cards at 390px (`node scripts/shoot.mjs`), because a `why` is prose and this
  repo's rule is to read the screen.

---

## P2. Cost, debt, drift

### P2-1. /gym/api/plan is 44 to 68 Neon round trips per call, and a page open is 52 to 76. 03-gym's "~150" was too high

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\api\plan\route.ts` lines 36 to 54; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` lines 156 to 189.
- Evidence, counted per exercise against the real number of dates each one has in `gym_set`, not
  estimated from the maximum. `getLastSession` is 1 query plus 1 if a session is found;
  `getRecentSessions(id, date, 8)` is 1 distinct-dates query plus one `setsForExDate` per date
  returned, capped at 8.

  | Day | Logged exercises | Round trips per `/gym/api/plan` |
  |---|---|---|
  | Monday | 7 | 44 |
  | Tuesday | 11 | 68 |
  | Thursday | 9 | 53 |
  | Friday | 9 | 46 |

  Server render of `/gym` is exactly 6 more: `getLastTrainingRow`, `getSessionDay` (both inside
  `computeNextUp`), `getNotes`, `getGymLog`, `countGymLog`, `countNotes`. Every content load is
  filesystem (`src/lib/gym/program.ts`), and `SiteHeader` and `TrainingNav` touch no database. The
  client's `/gym/api/session` is 2 more. So a page open is **52 (Monday) to 76 (Tuesday)**.

  It re-fires. The plan effect keys on `planKey` (GymClient lines 385 to 402), so **every day-tab tap
  costs another 46 to 70** (the session effect keyed on `activeDay` adds 2), and **every swap costs
  another 44 to 68**, because the swapped exercise changes `planKey`.

  03-gym P2-1 said "roughly 110 to 154". It assumed 10 to 14 logged exercises each with 8 dates of
  history. Most do not: `cable-overhead-tricep-extension`, `cable-pallof`, `cable-reverse-fly`,
  `db-rdl`, `incline-db-curl`, `leg-curl` and `suitcase-carry` have zero dates and cost 2 each.
  Correcting the number matters because the fix is the same and the priority is not: AGENTS.md's
  billing note is that Provisioned Memory is charged for the whole instance lifetime including time
  spent waiting on I/O, and 68 sequential round trips is a long wait.
- Fix, unchanged from 03-gym and still the right one: one query for the whole day. Send every id at
  once, `where exercise_id = any($ids) and date < $date and done = true and reps is not null and reps
  > 0`, rank dates per exercise with `dense_rank() over (partition by exercise_id order by date desc)
  <= 9`, and group in JS. The `coalesce(estimated, false) = false` restriction applies only to picking
  `last` (see P2-2), which the JS grouping can honour. One round trip replaces 68.
- Verify: `MSYS_NO_PATHCONV=1 vercel api /v2/observability/query -X POST --input body.json` on
  `vercel.external_api_request.count` grouped by `origin_route`, before and after. Remember
  `aggregation: "sum"` explicitly, per AGENTS.md: the default is `avg` and reading a `_sum` key that
  is not there scores as zero. The probe must still pass: suggestions and trends must render
  identically.

### P2-2. The trend line draws recalled sets as measured, on 14 exercises, and 8 of those have a recalled session inside the stall window

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` line 160 against line 182; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 80 to 127.
- Evidence. `getLastSession` filters recalled sets out, deliberately, with the reason written above it:

  ```
  and reps > 0 and coalesce(estimated, false) = false
  ```

  `getRecentSessions`, seven lines below, does not:

  ```
  where exercise_id = ${exerciseId} and date < ${beforeDate} and done = true and reps is not null and reps > 0
  ```

  `gym_set` holds 54 rows with `estimated = true`, all between 2026-05-25 and 2026-05-30. Counted per
  exercise against the 8-session window the route asks for: 14 exercises have at least one recalled
  session inside it (`bb-row`, `bench-press`, `bulgarian-split-squat`, `db-bench-press`,
  `db-overhead-press`, `db-single-arm-row`, `dead-hang`, `face-pull`, `front-squat`, `good-morning`,
  `lat-pulldown`, `overhead-press`, `paused-back-squat`, `single-leg-rdl`), and 8 of them have one
  inside the top 3 that the stall detector reads. `lat-pulldown` has two, and they are the two oldest
  of its six points, so the trend caption's "from" value is taken from a session nobody measured.
- Why it matters in his terms: 03-gym filed this as P3-6 and called it latent, pending an `estimated`
  input that has since been ruled out. It is not latent: the trend is on screen now and the caption
  reads "180 to 200 over the last 6" with 180 coming from a recalled May session. The module's own
  comment explains why recalled numbers must not reach progression, and then the same rows reach the
  chart beside it.
- Fix: apply the same filter in `getRecentSessions`, or, better, resolve it inside the single query of
  P2-1, where `last` and `recent` are two projections of one result set and the difference between
  them is explicit in one place. If a recalled session is deliberately kept in the chart, the chart
  must mark it, which is a design decision to put to him rather than a default to pick.
- Verify: `select count(*) from gym_set where estimated = true` is 54; after the fix, POST
  `lat-pulldown` to `/gym/api/plan` and assert `recent` holds 4 dates, not 6, none of them in May.

### P2-3. On a weighted lift the trend plots weight only, so the entire rep-building half of double progression reads "held at X"

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 56 to 69 and 120 to 124.
- Evidence. The comment claims a tie-break the code does not have:

  > "Weight first, reps as the tie-break, and reps alone when there is no weight"

  ```
  const weighted = sets.some((s) => s.weight != null && s.weight > 0);
  for (const s of sets) {
    const v = weighted ? s.weight : s.reps;
  ```

  No reps are consulted for a weighted exercise, ever. The caption then says:

  ```
  {points.every((v) => v === points[0]) ? `held at ${latest}` : `${first} to ${latest}`} over the last {points.length}
  ```

  Front squat's five sessions are all at 115 lb, so the card reads **"held at 115 over the last 5"**.
  His reps over those five went 5, 5/6, 8, 8, 8x3. Under double progression that IS the progression:
  the weight is supposed to sit still until the top of the range is reached.
- Why it matters in his terms: on the same card he sees "held at 115" and "Stalled 3 sessions at 115:
  deload to 105" (P1-4), on a lift where he added three reps and a third set. The programme's own
  engine says hold the weight and build reps, and the only visualisation of it is blind to reps.
- Fix: plot the estimated max rather than the load, using the Epley expression already written into
  `progression.ts` lines 48 to 51 (`w * (1 + reps / 30)`) so there is one definition of "did this get
  stronger" in the codebase and not two. Then "held" means held. Fix the `topSet` comment either way:
  a comment describing a tie-break that does not exist is the class ENGINEERING.md's corollary names.
- Verify: `select date, weight, reps from gym_set where exercise_id = 'front-squat' and done order by
  date` and confirm the rendered caption stops saying "held" once the series is drawn on e1RM. Read
  the caption on a 390px screenshot, do not infer it.

### P2-4. A stall deload on a 2.5 lb cable stack still suggests a pin position that does not exist

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\progression.ts` lines 72 to 75 and 158.
- Evidence, unchanged since 03-gym P2-4:

  ```
  function roundLoad(w: number, increment: number): number {
    if (increment && increment < 5) return r1(w);
    return Math.round(w / 5) * 5;
  }
  ```

  `r1` rounds to 0.1. The deload path is `roundLoad(last3[0].w * 0.9, increment)`. Four slots carry
  `increment: 2.5` (`seated-cable-row`, `tricep-pushdown`, `cable-pallof`, `straight-arm-pulldown`),
  and his logged pushdown weights are 72.5, 80, 85 and 87.5, so a stall at 72.5 yields
  `r1(65.25) = 65.3 lb`.
  Verified still latent, not live: no cable exercise satisfies the stall condition today
  (`tricep-pushdown`'s last three working weights are 72.5, 87.5 and 85, so `sameW` is false).
- Why it matters in his terms: it is one identical session away, on the four cable lifts, and a
  suggestion he cannot set on the machine is a suggestion he ignores, which is how the whole
  suggestion column loses its authority.
- Fix: when `increment < 5`, round to the nearest multiple of the increment,
  `Math.round(w / increment) * increment`, not to 0.1. The plus-increment paths are already safe: a
  multiple of 2.5 plus 2.5 is a multiple of 2.5.
- Verify: POST a three-session stalled fixture for `tricep-pushdown` to `/gym/api/plan` and assert
  the deload is 65, not 65.3.

### P2-5. The off-plan box's autocomplete offers 26 names whose slug does not match the catalogue id, so the row it writes has no history and never will

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 439 to 447; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\program.ts` lines 65 to 73.
- Evidence. The comment states the invariant:

  > "The id is slugified from what he typed. If it matches a catalogue exercise the history lines up
  > with every other set of that lift"

  the code:

  ```
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  ```

  and the datalist is fed every variant NAME in `movements.json`. Counted across all 106 variants,
  **26 have a name whose slug is not the variant's id**, including several he would plausibly type:

  ```
  Standing DB Overhead Press  -> standing-db-overhead-press   (catalogue id: db-overhead-press)
  BB Romanian Deadlift        -> bb-romanian-deadlift         (catalogue id: romanian-deadlift)
  DB Romanian Deadlift        -> db-romanian-deadlift         (catalogue id: db-rdl)
  Leg Curl Machine            -> leg-curl-machine             (catalogue id: leg-curl)
  Assisted Pull-Up            -> assisted-pull-up             (catalogue id: assisted-pullup)
  EZ Bar Preacher Curl        -> ez-bar-preacher-curl         (catalogue id: ez-preacher-curl)
  Cable Pallof Press          -> cable-pallof-press           (catalogue id: cable-pallof)
  ```

  Pick "Standing DB Overhead Press" from the list the app itself offers and the set is filed under
  `standing-db-overhead-press`, invisible to the 20 sets of `db-overhead-press` and to every
  suggestion, trend, coverage count and `--fill` price.
- Why it matters in his terms: the box exists so substituted work stops being invisible. A row under a
  novel id is captured and still invisible to everything downstream. The autocomplete makes it more
  likely, not less, which is the opposite of what it was added for.
- Fix: resolve the picked name to its variant id. `loadExtraSuggestions` already walks
  `movements.json`; have it return `{name, id}` pairs, pass them to the client, and in `logExtra`
  prefer an exact name match's catalogue id over the slug, falling back to the slug for anything he
  types freehand. Never block the capture on recognition: the fallback stays. This composes with the
  P0-1 fix, so do them in one commit.
- Verify: `node -e` over `movements.json` asserting `slug(name) === id` is not required once the id
  is looked up rather than derived; instead assert that for all 106 variants, resolving the name
  returns the catalogue id. Add that as a case in `validate.test.mjs` or a two-line self-test in
  `program.ts`'s loader.

### P2-6. `gym-catalogue --fill` will recommend moving a main pattern lift to another day and putting a barbell partner inside a barbell lift's rest

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\gym-catalogue.mjs` (the `--fill` report).
- Evidence, quoted from a live run today. Under `monday Main Lift: Back Squat`, lead at "Rack section
  / Squat rack":

  ```
  * BB Row     move from friday Main Lift: BB Row, rest 2 min to 3 min
  ```

  and under `friday Main Lift: BB Row`:

  ```
  * Front Squat     move from thursday Second Pattern: Squat, rest 2 min to 2 min
  ```

  and under `friday Second Pattern: Horizontal Press`:

  ```
  * DB Romanian Deadlift     move from monday Second Pattern: Hinge, rest 2 min to 90s
  ```

  and, in every one of the ten solo blocks including all four barbell main lifts:

  ```
  * Farmer Carry     move from friday Biceps, then Carry, rest 60s to <lead's rest>
  ```

  Three distinct false-suggestion shapes, all of which pass `validate.mjs`:
  1. **A barbell partner in a rack.** BB Row's station is `rack`, the same as the squat's, so it
     "holds the lead's OWN fixture" and the one-station rule (validate.mjs lines 677 to 690) is
     satisfied. A rack holds one loaded BAR, not one bar per exercise: doing this means stripping and
     reloading between every set, which is the plate-change cost the whole feature exists to remove.
  2. **A main pattern lift relocated.** `--fill` filters on station, zone and shared muscle. It does
     not read `role`, so it offers `main` and `primer` lifts as fills and prints the price only as
     two rest lengths. Moving the DB RDL off Monday or the front squat off Thursday breaks "every main
     pattern twice a week", which is the programme's stated design and what `validate.mjs`'s own rest
     and pattern reasoning is built on.
  3. **A carry inside a rack's rest.** `farmer-carry` has `station: null`, so it "holds no fixture"
     and rides free everywhere. Its own cue says "it needs room to walk", and the Friday block's `why`
     says "alternating means giving up the bench". The tool cannot express "needs floor space away
     from the fixture".
- Why it matters in his terms: this is the tool the handoff names as THE instrument for the one item
  still owed, and its own WHAT NOT TO DO section records that `--pairing` produced three batches of
  false findings and that *"a report that disagrees with the gate teaches the reader to discount
  both"*. These three disagree with the DESIGN rather than with the gate, which is harder to see and
  costs the same trust.
- Fix, three filters, each cheap and each derived from data already in the files:
  1. Exclude a candidate whose station equals the lead's station when both are loadable barbell
     fixtures (`rack`, `smith`): sharing a rack is sharing a bar load. Read the loadability from
     `equipment.json` rather than hardcoding the two names.
  2. Exclude candidates whose block `role` is `main` or `primer` from the "move from" set, or print
     them under a separate heading that names the cost in the programme's own terms ("this removes the
     week's second hinge").
  3. Add a `needsSpace` (or reuse `needsFloor`) read for carries, so a movement that walks is not
     offered inside a fixture's rest window. `farmer-carry` and `suitcase-carry` are the only two
     affected today.
- Verify: `node scripts/gym-catalogue.mjs --fill` must no longer print BB Row, Front Squat, DB
  Romanian Deadlift or Farmer Carry as starred options inside a barbell main lift, and the remaining
  starred options must all still pass `node content/gym/validate.mjs` when actually applied. Spot-check
  one by applying it on a scratch copy and running the validator.

### P2-7. The set-row inputs have no min-height, and the off-plan box's three inputs are 15px against the 16px rule stated twelve lines above them

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\training.css` lines 331 to 343 and 1162 to 1172. **Shared file, coordinate**: `.training` is the root class for all five training routes.
- Evidence. The set-row rule the whole surface is built around:

  ```
  .training .set-row input[type='number'], .training .set-row input[type='text'] {
    width: 100%;
    font-family: var(--font-mono);
    /* 16px. Below it, iOS zooms the whole page when the field takes focus, which mid-set means
       losing your place in the workout to a pinch gesture. Three comments elsewhere in this repo
       call this non-negotiable and this file was at 15. */
    font-size: 16px;
    padding: 9px 10px;
  ```

  No `min-height`. It is the only interactive control on this surface without one: the done-toggle in
  the same grid row is pinned at `2.75rem` with the comment "the circle is the most-tapped control in
  the app and it measured 38px, under the floor", `.swap-toggle` and `.swap-revert` are pinned at
  44px with "measured at 30px, under the floor", and there are 20 further `min-height: 44px`
  declarations in the file.

  Then the off-plan box, added the following day at lines 1162 to 1172:

  ```
  .training .extra-name { width: 100%; padding: 10px 12px; font: inherit; font-size: 15px; ... }
  .training .extra-num  { flex: 1 1 0; min-width: 0; padding: 10px 12px; font: inherit; font-size: 15px; ... }
  ```

  Three inputs at 15px, no min-height, in the same stylesheet whose own comment calls 16px
  non-negotiable and records that this file had already been at 15 once.
- Why it matters in his terms: the off-plan box is used one-handed, standing, after a set. At 15px iOS
  zooms the page when the field takes focus, which is the failure the set-row comment describes. The
  height question is separate and I am **not** asserting a pixel figure for it: `probe-taps.mjs` runs
  at 390px, includes `input` in its selector list (line 267) and was run against the live /gym page on
  2026-08-28 per the comment at line 408, so if these boxes measured under 43px it should have said
  so. What is certain from the source alone is that four inputs on this surface have their height
  decided by font metrics while every other control had its height pinned after measurement.
- Fix: `font-size: 16px` on `.extra-name` and `.extra-num`, one number each. For the heights, MEASURE
  before changing anything: `pnpm start -p <free port>` on a port nothing holds
  (`netstat -ano | grep LISTENING | grep :30`), then `node scripts/probe-taps.mjs http://localhost:<port> /gym`
  and read what it reports for `<input>`. Then gate the font size, because the rule has now been
  broken twice in one file: add a check to `scripts/lint-tokens.mjs` (already in `pnpm build`, already
  has a 26-case `--selftest`) refusing `font-size` under 16px inside any rule whose selector contains
  `input`, `textarea` or `select`, with selftest cases in both directions.
- Verify: `node scripts/lint-tokens.mjs --selftest` green, then `pnpm build` must fail on the current
  file and pass at 16px. `node scripts/probe-taps.mjs <base> /gym` reports zero findings.

### P2-8. The only test on this repo that presses a button is not in `verify.mjs` or the pre-push hook, and the three newest features on /gym have no coverage in it

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\verify.mjs` lines 35 to 78; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\.githooks\pre-push` lines 32 to 39; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\probe-gym.js` line 177 onward.
- Evidence. `verify.mjs`'s gate list is install, typecheck, lint, build, gym-validator-tests,
  kitchen-validator-tests, gym-coverage, gym-catalogue, and one optional extra:

  ```
  if (probeAt) GATES.push(['probe', process.execPath, ['scripts/probe-kitchen.mjs', probeAt]]);
  ```

  `probe-gym.js` appears nowhere in `verify.mjs`, nowhere in `package.json`'s `build`, and nowhere in
  `.githooks/pre-push`. Its closing advice names only the kitchen:

  > "For anything he will read or cook from: pnpm start, then node scripts/verify.mjs --probe http://localhost:3007"

  So `exSelectorMeansExercise`, which AGENTS.md calls "the gate now" for the third class-name borrow
  on this surface, and all 25 interaction checks, run only when a person remembers a sentence in
  AGENTS.md. That is precisely the enforcement the pre-push hook was created to end, and the hook's
  own comment says so about `verify.mjs`: *"Nothing made anyone type it. A rule that does not execute
  is decoration."*

  Counted from the `tests` object, there are **25** checks (23 plus the two `swapSurvivesReload`
  halves). None of them touches the three things shipped to /gym on 2026-08-27: the readable note
  list (`src/app/gym/page.tsx` lines 107 to 137), the session log (lines 70 to 93), or the off-plan
  capture box (`GymClient.tsx` lines 885 to 919), which the file itself calls "the most load-bearing
  thing on this page" and which P0-1 shows is the surface's only lossy write path.
- Why it matters in his terms: the four static gates all passed on a build whose swap control silently
  reset on every load and which opened on the wrong day. He found that by training with it. Adding
  three untested interactive features and leaving the interaction harness out of the automated chain
  reproduces exactly that arrangement.
- Fix: add a `--probe-gym <base>` flag to `verify.mjs` that runs `run-probe-gym.mjs` plus the reload
  pair, alongside the existing kitchen probe, and change the closing advice to name both. Do NOT put
  it in the pre-push hook: it needs a running server and the hook has to stay 49 seconds. Then add
  three probe cases: the note list renders its unhandled count, the session log renders five rows,
  and the off-plan box posts what was typed with a distinct `setIdx` on a second set of one name (this
  last one is the P0-1 regression test, and writes are stubbed so it is safe).
- Verify: `node scripts/run-probe-gym.mjs <base>` reports 25 checks today and 28 after. Confirm the
  new off-plan case FAILS on the current build before the P0-1 fix, which is what proves it is not
  matching nothing.

### P2-9. The placement gate's zone clause has never been watched failing, and its null-station branch cannot refuse anything

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\validate.mjs` lines 223 to 241; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\validate.test.mjs` lines 162 to 206.
- Evidence. The gate has three failing branches. Line 231 ("holds no fixture") is covered by the case
  at test line 187. Line 236 ("movements.json says") is covered by the case at test line 169, whose
  `expect` string is exactly `'movements.json says'`. Line 238 has no case of its own:

  ```
  if (item.zone !== v.zone) {
    fail(where, `${kind} "${item.id}" is in zone "${item.zone}" but movements.json places it in "${v.zone}". Only an exercise holding NO fixture may be carried into another zone.`);
  }
  ```

  A slot that names the RIGHT station in the WRONG zone has never been seen to be refused. AGENTS.md
  says "Two regression cases cover it", and two is the count: the third branch is not one of them.

  Second, and more consequential, the null-station branch returns before any zone check:

  ```
  if (catStation === null) {
    if (slotStation !== null) { fail(...); }
    return;                                     // it travels: the zone is the slot's to choose
  }
  ```

  That is the intended traveling-dumbbell rule, and its consequence is that a null-station partner can
  be given ANY zone, which then satisfies the pairing gate's own same-zone check at line 688 by fiat.
  Twelve of the week's slots have `station: null`, including `farmer-carry` and `suitcase-carry`. This
  is what P2-6's third false suggestion exploits: nothing in the data can say "this holds no fixture
  but still cannot be done here".
- Why it matters in his terms: the placement gate is the newest gate on this surface and the reason
  the handoff gives for it is that "the block passed because the data lied". A branch that has only
  ever been seen to pass may be matching nothing, which is the argument `validate.test.mjs`'s own
  header makes.
- Fix: add one regression case, found generically the way the two existing placement cases are: pick
  any exercise the catalogue puts at a fixture, keep its station, change its `zone`, and assert the
  refusal names "movements.json places it in". For the null-station gap, the honest move is not a new
  gate but a named field for the one property `station: null` cannot express (needs room to move away
  from the fixture), which is P2-6 fix (3); that keeps the derived rule intact and adds the one axis
  it genuinely lacks.
- Verify: `node content/gym/validate.test.mjs` goes from 13 cases to 14, 0 failed, and the new case
  must be seen failing when the gate's line 238 is temporarily commented out on a scratch copy.

### P2-10. `run-probe-gym.mjs` still clears localStorage in whatever browser it is pointed at, and its own usage line points it at production

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\run-probe-gym.mjs` line 154, usage at line 6.
- Evidence:

  ```
  node scripts/run-probe-gym.mjs https://hoodii.studio        # against production
  ...
  await evaluate('localStorage.clear(); 1');
  ```

  No `Target.createBrowserContext`. The documented driver is the Chrome on CDP 9222, which is his own
  logged-in browser, and HOODII/CLAUDE.md's standing rule for that browser is "leave his tabs alone".
- Why it matters in his terms: `gym:swaps:<today>` is the only record of a swap he has PICKED and not
  yet lifted (GymClient lines 129 to 135 exist for exactly that minute). A probe run against
  production while he is at the gym erases it, along with every other origin-local convenience on
  hoodii.studio. 03-gym filed this as P2-6 on 2026-08-26 and it is unchanged.
- Fix: run in an isolated browser context (`Target.createBrowserContext` plus `Target.createTarget`
  with `browserContextId`), so the run starts clean without touching the profile. Minimum viable
  alternative: remove only the keys the probe owns (`gym:swaps:<today>` and `__probeSwap`) and refuse
  a `https://hoodii.studio` base without an explicit `--yes-production` flag. The isolated context is
  strictly better because it also eliminates cookie bleed.
- Verify: set a sentinel key on the origin in a normal tab, run the probe against localhost, and
  confirm the sentinel survives.

### P2-11. Two UTC "today" fallbacks under `/gym/api`, in a repo whose day module exists because of this exact fault

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\api\plan\route.ts` line 33; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\api\next\route.ts` line 10.
- Evidence, identical in both:

  ```
  const date = b?.date || new Date().toISOString().slice(0, 10);
  ```

  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\day.ts` opens with 15 lines about why this
  is wrong: *"a server that computes 'today' as new Date().toISOString().slice(0,10) disagrees with
  the stored dates for the last six hours of every evening"*. And the stored dates prove the window is
  real: `gym_session` for 2026-08-27 has `started_at 2026-08-28T00:45:09Z`, so his session on the 27th
  began at 18:45 Calgary, inside exactly that window.
- Why it matters in his terms: latent, because GymClient always sends `date` from `today()`. But this
  repo has had four day-boundary faults and the fix for each was consolidating on `lib/day.ts`. A
  fallback that is wrong for six hours a day, in two files, in the module the day rule was written
  for, is the fifth waiting to happen. It also survived `getSessionDay`'s and `computeNextUp`'s own
  Calgary discipline.
- Fix: `import { today } from '@/lib/day'` and use it. `/gym/api/next` should be deleted instead
  (P3-4), which removes one of the two.
- Verify: `grep -rn "toISOString().slice(0, 10)" src/` returns nothing under `src/app/gym`.

### P2-12. `/gym/log` renders `exercise_name` straight from Postgres, and one stored name carries an em dash, which is the class the same file fixes two dozen lines above

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\log\page.tsx` lines 72 to 95 against lines 154 to 173. **Shared reasoning with `src/lib/gym/log.ts` lines 143 to 163.**
- Evidence. The file solves the problem for one column, and says so:

  > "`gym_session.day_title` holds sixteen distinct strings across three generations of the model.
  > Four contain an em dash ("Upper A - Press", with U+2014), which rendered straight onto his screen
  > on the first version of this page: lint-prose guards the repo's prose and cannot see a string
  > that arrives from Postgres."

  Then, at line 156 and 170:

  ```
  const e = byEx.get(s.exerciseId) ?? { name: s.exerciseName ?? s.exerciseId, done: [] };
  ...
  <span className="log-set-name">{e.name}</span>
  ```

  Queried today, `select distinct exercise_id, exercise_name from gym_set where exercise_name ~
  '[^\x20-\x7e]'` returns exactly one row:

  ```
  pike-hold  =>  Step 1 <U+2014> Pike Hold
  ```

  on dates 2026-07-24 and 2026-08-06, both inside the page's 120-row window and both `hasApp`, so both
  expand and both render it.
- Why it matters in his terms: zero tolerance on em dashes is a standing rule in two binding files,
  `scripts/lint-prose.mjs` executes it for repo text, and the one path that bypasses it was found,
  documented and fixed for one column while the column next to it kept it. Cost to him: one em dash on
  his own screen. Cost to the rule: it is the class, not the instance, and the next generation of
  stored names will carry whatever it carries.
- Fix: strip separators from `exerciseName` on the way out, the same way `dayLabel` does, and put the
  helper in one place rather than two. `src/lib/gym/log.ts` is the right home, since it is the module
  that reads both columns: a single `cleanStoredLabel()` applied in `getCombinedLog` and
  `getSetsForDates`, written with `\u2014` and `\u2013` escapes, for the reason line 90 to 93 already
  gives. Alternatively look the display name up from `movements.json` by id, with the stored name as
  the fallback, which also fixes the historical "BB Row (heavy)" and "Broad Jump" labels; that is the
  same honest ladder the timed-unit lookup uses at lines 61 to 70.
- Verify: `select exercise_name from gym_set where exercise_name ~ '[\u2013\u2014]'` returns the
  pike-hold row, and the rendered `/gym/log` expansion for 2026-08-06 shows "Step 1 Pike Hold" or the
  catalogue name. Read it on the page; a grep of the source cannot see this.

### P2-13. `getLastTrainingRow` and `getSessionDay` are still non-deterministic if one date ever holds two session rows

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` lines 218 to 231.
- Evidence, unchanged since 03-gym P2-3:

  ```
  select day from gym_session where date = ${date} order by day limit 1
  ```

  `order by day` on the text keys `monday | tuesday | thursday | friday` is alphabetical, so
  `friday < monday < thursday < tuesday`, and

  ```
  select date, day, status from gym_session
  where date = (select max(date) from gym_set where done = true and reps is not null and reps > 0)
  ```

  has no `order by` and no day filter, so `rows[0]` is arbitrary and `nextDay`, `cutShort` and the
  layoff logic in `cycle.ts` read whichever row Postgres hands back first.
  Re-verified against live Neon: `select date, count(*) from gym_session group by date having count(*)
  > 1` is **empty**, 0 of 34 dates. Still latent, still one mistaken tap away, because `upsertSession`
  mints a row per `(date, day)` on the first set write and `finishSession` never deletes one.
- Why it matters in his terms: the failure mode is the 2026-08-14 bug's shape, which he reported as
  the app "behaving a little bit weird": the page opens on a day he is not training with every box
  empty, and the sets he logged are invisible because they are filed under a different day.
- Fix, Law 1 shape: only mint the session row when a set is actually `done = true`, so an unticked
  mistake never creates one. Failing that, make both queries evidence-based: pick the session row
  whose day actually has done sets for that date (join `gym_set`), falling back to the latest
  `started_at`.
- Verify: a unit test of the picker against a two-row fixture, since the live table cannot produce the
  state without a write. Then keep the duplicate query above in the 07:15 task's output so the day it
  stops being latent is the day somebody hears about it.

### P2-14. The page's set counter and the history row's set counter count different things, and both are labelled the same way

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 505 to 517 and 963 to 965; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\log.ts` lines 65 to 68.
- Evidence. On the page, `totals` walks the day's blocks only:

  ```
  for (const ex of b.exercises) { if (!ex.log) continue; const eff = effOf(ex); total += eff.sets;
    for (let i = 0; i < eff.sets; i++) if (getSet(eff.id, i).done) done++; }
  ```

  In the history row, the numerator counts every row for the date, whatever its exercise id:

  ```
  (select count(*)::int from gym_set s
     where s.date = g.date and s.done = true and s.reps is not null and s.reps > 0) as sets_logged
  ```

  So an off-plan set counts in the log and not in the page counter, and both are labelled "sets": the
  Finish button reads "Finish workout (18/21)" while `/gym` and `/gym/log` will read "19/21" for the
  same session. It can also exceed the denominator, since `sets_prescribed` counts only prescribed
  slots. Currently harmless: only one of 34 sessions carries a prescription (2026-08-27, 21) and its
  logged count is 18.
  Second, smaller divergence: `totals` uses `eff.sets` (after a swap) while `prescribedSetsFor` (db.ts
  lines 29 to 49) uses the slot's own `sets`. No alt in the file declares `sets` today, verified
  across all 106 alt entries, so the two agree by luck rather than by construction.
- Why it matters in his terms: the extra-box hint says off-plan work "counts as training, and without
  it the app reads the session as unfinished", and then the counter he watches all session does not
  count it. `db.ts` line 24 explicitly names the pair that has to stay aligned, which is the right
  instinct, and the numerator is the half nobody aligned.
- Fix: count off-plan sets in `totals` as a separate addend and render them as such, for example
  "18/21 sets, plus 1 off plan", so the two records agree without pretending an off-plan set filled a
  prescribed slot. Alternatively exclude off-plan ids from `sets_logged` and print them in the
  expansion only. Either is defensible; which one he wants depends on whether a substituted set should
  close the gap, which is a judgment about his own training. **Put it to him.**
- Verify: `select date, (select count(*) from gym_set s where s.date = g.date and s.done) as logged,
  sets_prescribed from gym_session g where sets_prescribed is not null` must never show logged above
  prescribed after the fix, and the page's counter and the log row must print the same number for
  2026-08-27.

---

## P3. Polish, dead code, stale prose

### P3-1. AGENTS.md and PROGRAM-SCHEMA.md both say the RIR guide is still here. The file was deleted on 2026-08-27

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` line 346;
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\schema\PROGRAM-SCHEMA.md` line 13;
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` line 34.
- Evidence. AGENTS.md:

  > "**And the RIR guide stayed.** `content/gym/rir-guide.json` teaches what reps-in-reserve means,
  > which is worth having whether the number is logged or not."

  PROGRAM-SCHEMA.md: "`rir-guide.json`: the RIR (reps in reserve) reference table."
  GymClient: "The RIR guide stays on the page too: it teaches the idea, which is useful whether or not
  anything records it."

  `git log --diff-filter=D -- content/gym/rir-guide.json` returns `d707ae7`, and `ls content/gym/`
  confirms the file is gone. The only correct record is
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` lines 73 to 76:

  > "The RIR GUIDE IS ALSO GONE, 2026-08-27, and the argument above for keeping it lost. ... he asked
  > twice where it had gone, and on the second ask he said 'cut it'."

  So the decision is recorded, dated and attributed in one place, and contradicted in three, one of
  which is the binding document.
- Why it matters: AGENTS.md is the contract, and a false "you have this" in it is worse than a false
  "you lack this". An executor obeying it will look for the file, find it missing, and restore it
  against his explicit "cut it". `docs/GYM-OPEN-DECISIONS-2026-08-27.md` line 149 makes it worse by
  asserting it is "Still on the page, folded, last item before the note box."
- Fix: rewrite AGENTS.md line 346 to say it was cut on 2026-08-27 on his second ask, with db.ts's
  reason. Delete the PROGRAM-SCHEMA.md line. Delete the last two sentences of GymClient's comment.
- Verify: `grep -rn "rir-guide" .` returns only `content/gym/migrate-from-html.mjs` line 72, which is
  a historical migration script and is allowed to name a file it once wrote.

### P3-2. `progression.ts` still claims a gate that lives in another file, filed as 03-gym P3-1 and unchanged

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\progression.ts` line 64.
- Evidence: "content/gym/validate.mjs computes this for every logged exercise and fails the build on a
  gap." `validate.mjs` computes no e1RM and no ladder margin (grepped for `banked`, `demanded`,
  `1 + `, and the Epley form). `scripts/check-ladder.mjs` does, and its own header explains why it
  cannot be in the validator: it needs his real working weights out of Neon.
- Fix: one sentence. Name `scripts/check-ladder.mjs` and say it is run by the 07:15 task and by
  `pnpm verify` only via the pre-push hook's chain, not by `pnpm build`.
- Verify: grep `progression.ts` for "validate.mjs" and get nothing.

### P3-3. `validate.mjs` tells you that a deleted route reads the rest rule

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\validate.mjs` line 719.
- Evidence: "It is load-bearing: /gym/conditioning reads maxConsecutive to judge the real week".
  `/gym/conditioning` was deleted on 2026-08-27 and every one of its URLs now 307s from
  `next.config.ts`. The real reader is `getTrainingWeek` in `src/lib/gym/week.ts` line 328, rendered
  on `/health?s=plan`.
- Fix: name `/health` and `src/lib/gym/week.ts`.
- Verify: `grep -rn "gym/conditioning" content/ src/ scripts/` returns only `next.config.ts`'s
  redirects and AGENTS.md's deliberate strikethrough row.

### P3-4. `/gym/api/next` is still dead, still 401s, filed as 03-gym P3-3

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\api\next\route.ts`.
- Evidence: `grep -rn "api/next" src/ scripts/` returns exactly one line, and it is
  `scripts/lint-probe-routes.mjs` line 49 declaring it read-only. `computeNextUp` is called
  server-side by `src/app/gym/page.tsx` line 21 and by the hub. `src/proxy.ts` line 69 exempts
  `/gym/api/plan` and `/gym/api/session` and NOT this one, so any future client call gets a 401 from
  the gate.
- Fix: delete the route and its `READ_ONLY_POSTS` entry in the same commit; the linter's stale-entry
  check enforces the pairing.
- Verify: `node scripts/lint-probe-routes.mjs` reports 7 POST routes, not 8, with 0 failures.

### P3-5. `finishSession` with a null day matches nothing and the route still returns ok, filed as 03-gym P3-4

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` line 206;
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\api\finish\route.ts` lines 13 to 21.
- Evidence: `where date = ${opts.date} and day = ${opts.day ?? null}`. In SQL `day = null` is never
  true, so a finish with no day updates zero rows while the route returns `{ ok: true }`. The route
  validates `date` and not `day`. The client always sends `day` (GymClient line 542), so latent.
- Fix: require `day` in the route (400 without it), which is the honest half, or
  `day is not distinct from`. Prefer the 400: reporting outcomes rather than intent is Law 3, and a
  finish that matched nothing must not answer ok.
- Verify: POST `{date}` with no `day` to `/gym/api/finish` on a dev build and confirm 400. Do not run
  this against production.

### P3-6. A typed note still does not survive a reload, and a flushed queued note leaves the box full, filed as 03-gym P3-5

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 194, 464
  to 474, 934 to 952.
- Evidence: `const [note, setNote] = useState('')` with no mirror to sessionStorage; an accidental
  reload before Save loses the sentence entirely, which is the one loss the save-path design exists to
  prevent (the comment at lines 882 to 884 states it). And after a queued note flushes through the
  banner's `retryAll`, `setNote('')` and `setNotesSaved` never run, because they are inside `saveNote`
  and not inside `write`, so the box still shows the text and a third copy is one tap away.
- Fix: mirror the draft to sessionStorage on change and clear both it and the box when a key starting
  `note:` lands in `write()`, which is already where `finishLandedRef` is set for exactly this reason.
- Verify: probe case, safe because the note route is stubbed: type into the box, reload, assert the
  text is back; then flush a queued note and assert the box is empty and the count incremented.

### P3-7. localStorage swap keys still accumulate forever, filed as 03-gym P3-7

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 135 and 483
  to 488.
- Evidence: `const swapKey = (date: string) => \`gym:swaps:${date}\`` and `persistSwaps` only ever
  removes today's key when its map empties. One key per training date, forever.
- Fix: one loop in the restore effect deleting `gym:swaps:` keys older than yesterday.
- Verify: `Object.keys(localStorage).filter(k => k.startsWith('gym:swaps:'))` holds at most two.

### P3-8. The day tab is still client state and the comment explains a different decision, filed as 03-gym P3-10

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\GymClient.tsx` lines 138 to 141.
- Evidence: `const [activeDay, setActiveDay] = useState<DayKey>(nextUp.todayDay ?? nextUp.nextDay);`.
  The comment above it explains why `todayDay` comes first, which is the right and well-reasoned
  default, and says nothing about why the selection is not in the URL when every other tabbed surface
  on this site (`/run`, `/bike`, `/swim`, `/health`) uses the `?s=` idiom. A day he selects by hand
  does not survive a reload.
- Fix: decide. If it stays client state, say why in that comment: a shareable URL is worth nothing on
  a single-user page, and the data-derived default is better than a remembered one mid-session. That
  is a real argument and it deserves to be written, because the next agent will otherwise "fix" it.
- Verify: the comment answers the question a reader of the other four routes will have.

### P3-9. Small stale numbers and strings

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` line 586: "Together that is 24
  checks". Counted from the `tests` object in `scripts/probe-gym.js` line 177 onward: **25** (23 plus
  the two `swapSurvivesReload` halves). The handoff's "23 checks ... the other 2" is right.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\gym\log\page.tsx` line 186: "rows before
  today have no denominator because nothing recorded one". Exactly one row carries a denominator and
  it is dated 2026-08-27, so as of today the sentence is false for that row. Write the date, or derive
  the clause from the data ("N of these rows predate the column").
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\gym-notes.mjs` line 138:
  `String(r.created_at).slice(0, 16).replace('T', ' ')`. `created_at` is a `timestamptz` and neon
  returns it as a JS `Date`, so `String()` gives "Thu Aug 27 2026 18:45:09 GMT-0600 (...)", the slice
  keeps "Thu Aug 27 2026 ", and `.replace('T', ' ')` then eats the T in "Thu". Live output today:
  `(written  hu Aug 27 2026 )` and `(written  ue Aug 25 2026 )`, while Sun, Sat, Mon, Wed and Fri
  survive. The time is also dropped entirely and would be the machine's zone, not Calgary. Fix:
  `new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ')`, or format through
  `America/Edmonton` for consistency with everything else here.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\program.json` lines 407 and 1293:
  `"name": "DB Standing Calf Raise"` on a slot whose station is `calf-raise` and whose logged work is
  180 to 210 lb on the machine. The open row at 2026-08-27 already asks him what it should be called,
  so do not rename it; it belongs here as the record that the NAME is part of the same defect as the
  cue (P1-7) and is not covered by the placement gate either.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\db.ts` line 213:
  `getSessionForHydrate` selects `suggested_weight, suggested_reps` and no consumer reads them
  (GymClient lines 338 to 354 destructure neither). Two columns of dead payload per set per hydrate.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\scripts\check-ladder.mjs`: the `working` column is
  the modal weight over 90 days, not the weight `suggest` will actually use, which is
  `workingWeight(last session)`. Today that reads `bb-back-squat ... working 155` while his last three
  sessions are all 185. The margins happen to stay positive at 185, so no finding changes, but the
  gate and the engine are measuring two different numbers and the report does not say which. Print
  both, or measure what the engine measures.

---

## What was hunted and NOT found

- **A write outside the cookie gate.** `node scripts/lint-probe-routes.mjs` run today: "8 POST
  route(s) under /gym/api + /swim/api + /bike/api, 5 stubbed, 3 read-only by declaration, 5
  server-action file(s) declared, 0 failures". `src/proxy.ts` line 84 carries the `/gym/api` prefix and
  line 111 carries `'/gym/:path*'` in `config.matcher`, so the prefix-plus-matcher pair that the
  2026-08-27 `/bike/api` demonstration proved necessary is intact here. `plan` and `session` are
  exempted by name at line 69 with the reasoning attached.
- **A set recorded against the wrong exercise.** The id and name travel together end to end:
  `autosave` (GymClient lines 421 to 433) takes `eff` and `slotId` separately, posts
  `exerciseId: eff.id, exerciseName: eff.name, swappedFrom: swaps[slotId] ? slotId : null`, and never
  sees the original exercise object. The one self-contradicting row in the store
  (`exercise_id: box-jump` next to `exercise_name: "Broad Jump"`, 2026-08-14) predates that fix and is
  named in the comment above it.
- **An unhandled note, or an overdue open question.** `gym_note` holds 23 rows and
  `count(*) filter (where handled = false)` is **0**. `node scripts/gym-notes.mjs` exits 0 and prints
  "No unhandled notes". All 19 `open` rows are dated `asked 2026-08-27, due 2026-09-10`, 13 days of
  runway. The four rulings the handoff parks are all present and all correctly attached to the thing
  they are about. This is the part of the co-build protocol that is working, and it is the reason four
  of the P1s above could be stated as questions rather than guessed at. (Four of the 19 carry a false
  claim: P1-6. The backlog itself is clean.)
- **A mid-session deploy.** `node scripts/guard-live-session.mjs`: "ok, no unfinished session in
  gym_session". `select * from gym_session where finished_at is null` is empty, 0 of 34.
- **A permanently red gate.** `node scripts/gym-coverage.mjs` exits 0 against
  `content/gym/coverage-baseline.json`: "0 muscle(s) below the minimum dose, 11 past the efficient
  zone, 1 redundant pairing(s), 4 exercise(s) with no source. MATCHES THE BASELINE." The baseline
  tolerates the four unsourced exercises and the zero strict pairings explicitly, and past-efficient
  is printed and not gated, which is the documented and correct arrangement. F6 of the handoff is
  genuinely closed.
- **`--pairing` lying again.** `node scripts/gym-catalogue.mjs --pairing`: "0 paired block(s) cost him
  a walk or a second fixture mid-block. 3 block(s) skipped: they are 'sequence'". It compares stations,
  reads the slot rather than the catalogue, and skips `sequence`. All three of the 2026-08-27 fixes
  hold. The false-suggestion problem has moved to `--fill` (P2-6), which is a different tool with
  different filters.
- **A slot disagreeing with the catalogue about its fixture.** `node content/gym/validate.mjs` exits 0
  over all four days, and `node content/gym/validate.test.mjs` reports "13 cases, 0 failed" with both
  placement cases watched refusing. The gate works on the field it reads. What it does not read is the
  name, the cue and the `why` (P1-7).
- **`inProgramme` returning.** Absent from `movements.json`, and the gate plus its regression case are
  both live (`validate.mjs` line 70, `validate.test.mjs` lines 207 to 219).
- **A timezone or day-boundary fault that is currently rendering.** All date columns in `gym_set`,
  `gym_session` and `health_watch_session` are `text` holding `YYYY-MM-DD` (confirmed via
  `pg_typeof`), so the string comparisons throughout `db.ts`, `week.ts` and `cycle.ts` are sound and
  neon returns no `Date` objects to be keyed on by accident. `today()` runs through
  `America/Edmonton` on both client and server. `weekdayOf` parses at noon UTC. The only faults found
  are the two unreached UTC fallbacks (P2-11) and the gym-notes formatter (P3-9).
- **The wrong day on open.** Recomputed by hand for today: last logged date 2026-08-27, its session
  row is `day: monday, status: finished`, `daysSince` 1, `DAY_ORDER.indexOf('monday')` 0, no cut-short,
  so `nextDay` is `tuesday`; `getSessionDay('2026-08-28')` returns null, so `todayDay` is null and
  `activeDay` opens on Tuesday, labelled "Upper A". Correct. Note that no session in the store has ever
  been `cutshort` (0 of 34), so that branch of `computeNextUp` has never run in production and the
  page's cut-short explanation (GymClient lines 655 to 660) has never rendered.
- **The farmer carry's unit.** 03-gym P1-3 is fixed: friday `farmer-carry` is
  `"reps": "40s", "timed": true, "bodyweight": false, "progression": "time"` and monday
  `suitcase-carry` is `"reps": "30s/side", "timed": true, "progression": "time"`. Both now agree with
  their own alts, the reps placeholder keys off `eff.timed`, and `/gym/log` looks the unit up per
  exercise. The defect the fix exposed is P1-3 above, which is a different one.
- **`rangeWidth` being dropped in the middle.** 03-gym P1-1 is fixed and the fix is verified in the
  arithmetic: `check-ladder.mjs` prints `db-hammer-curl tuesday 8-13` and
  `bulgarian-split-squat monday 8-14`, which are the widened ranges, and
  `src/app/gym/api/plan/route.ts` line 48 passes `rangeWidth: ex.rangeWidth` with a 13-line comment
  recording what it cost.
- **The `.ex` class being borrowed a fourth time.** Every card carries `data-slot`
  (GymClient line 744), the notes block deliberately uses `note-row` with the reason written above it
  (`src/app/gym/page.tsx` lines 121 to 123), and `exSelectorMeansExercise` exists at
  `scripts/probe-gym.js` line 357. The gate is real. It simply does not run in any automated chain
  (P2-8).

---

## 03-gym.md (2026-08-26), every finding re-verified

| # | 2026-08-26 finding | State on 2026-08-28 |
|---|---|---|
| P0 | none found | Still none of that shape (write net intact). A new P0 found in the off-plan box shipped 2026-08-27: **P0-1** |
| P1-1 | plan API drops `rangeWidth` | **FIXED**, verified in the route and in check-ladder's printed ranges |
| P1-2 | nine unhandled notes with no mechanism | **FIXED, and the mechanism is real.** 0 unhandled of 23. Notes are readable on the page with the unhandled count in the summary, counted in the DB and not in the capped array. The `SessionStart` hook half was not built; the page half plus `gym-notes.mjs` in AGENTS.md is what carried it |
| P1-3 | farmer carry logs seconds as reps | **FIXED** (see above). The cap it exposed is **P1-3** here |
| P2-1 | plan is ~150 Neon round trips | **STILL OPEN, and the number was too high.** 44 to 68 per call, 52 to 76 per page open, re-fired on every tab tap and every swap: **P2-1** |
| P2-2 | the /gym streak has no horizon caveat | **RESOLVED BY DELETION.** The streak was removed from /gym on 2026-08-27 with the reasoning at GymClient lines 635 to 650; `TrainingStreak` gained `to` for the same complaint. Days in a row now lives only on /health, which is out of scope for this audit |
| P2-3 | two ways to read today's session row | **STILL OPEN, still latent.** 0 of 34 dates hold two rows: **P2-13** |
| P2-4 | cable deload suggests 65.3 lb | **STILL OPEN, still latent**, and confirmed not currently firing: **P2-4** |
| P2-5 | check-ladder never checks alts | **STILL OPEN.** `scripts/check-ladder.mjs` still iterates `block.exercises` only; `effectiveExercise` still spreads the slot over the alt, so an alt inheriting a tuned `increment` or `rangeWidth` is unchanged. Not re-filed as its own finding because the swap surface changed underneath it: with six slot ids rewritten, the orphaned-history gate in **P1-1** and **P1-2** is the same query and should cover alts in the same pass |
| P2-6 | run-probe-gym clears his real localStorage | **STILL OPEN, unchanged**: **P2-10** |
| P3-1 | progression.ts claims a gate that lives elsewhere | **STILL OPEN, unchanged**: **P3-2** |
| P3-2 | layout comment claims a login layout | **FIXED.** `src/app/gym/layout.tsx` was rewritten for TrainingNav and the false claim is gone |
| P3-3 | /gym/api/next is dead | **STILL OPEN**: **P3-4** |
| P3-4 | finishSession with a null day reports ok | **STILL OPEN**: **P3-5** |
| P3-5 | a typed note does not survive a reload | **STILL OPEN**: **P3-6** |
| P3-6 | getRecentSessions does not filter `estimated` | **STILL OPEN and no longer latent.** The trend draws them: **P2-2** |
| P3-7 | localStorage swap keys accumulate | **STILL OPEN**: **P3-7** |
| P3-8 | conditioning's "Your last session" label | **RESOLVED BY DELETION.** `/gym/conditioning` is gone and 307s. Whether `LastSession` is correctly titled on /health is that auditor's finding, not this one |
| P3-9 | set-row inputs compute to about 40px | **STILL OPEN, and I am not repeating the 40px figure.** No `min-height` on the only interactive control on the surface that lacks one, and the off-plan box added the next day is at 15px against the file's own non-negotiable 16px. Measure with `probe-taps.mjs`: **P2-7** |
| P3-10 | the day tab is client state, not a URL | **STILL OPEN, and the comment added since answers a different question**: **P3-8** |

Also from 03-gym's "open work from the redesign plan": `rir` is dropped and the guide with it (P3-1
above corrects the docs), `estimated` is correctly kept and correctly filtered in `getLastSession`,
`/gym/conditioning` is deleted with all its URLs redirecting, notes are readable, and
`getRecentSessions(kind)` in `src/lib/gym/session.ts` now has callers on the discipline pages.

---

## Severity counts

| Severity | Count |
|---|---|
| P0 | 1 |
| P1 | 9 |
| P2 | 14 |
| P3 | 9 |

**Single most important: P0-1**, because it destroys a row that was already written, in the feature
the code itself calls the most load-bearing thing on the page, and the autocomplete the app provides
makes the collision more likely rather than less.

**Single most important thing to understand: the 2026-08-27 placement gate reads one field.** P1-1
through P1-9 are one story told nine ways. Six slot ids were rewritten so that partners sat at their
lead lift's own station, the new gate checked the `station` field and went green, and the `name`, the
`cue`, the `why`, the parked `open` questions and the logged history all stayed pointed at the old
implement. The gate made the field honest and moved the lie into the four places he actually reads.
The cheapest general repair is not another gate on prose: it is that **a slot id change is an event**,
and the three things that must follow it (the cue, the history, the questions already written about
it) can each be checked mechanically against the id that changed.
