---
audit: /swim, /swim/deep, /swim/api/baseline, hoodii.studio
date: 2026-08-28
repo: C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site (main, HEAD 5151558)
mode: adversarial read-only pass (no edits, no build, no server, no screenshots; one read-only Neon session, SELECT only)
read-first: hoodii-studio-site/AGENTS.md (whole), .agents/ENGINEERING.md, src/lib/swim/deep.ts header (the three data traps)
scope: src/app/swim/**, src/lib/swim/**, content/swim/**; src/app/training.css and src/app/charts.css read and reported on but marked "shared file, coordinate"; src/lib/gym/session.ts and src/components/training/* reported on where /swim renders them
data-checked: health_swim_session (475), health_swim_length (19,327), health_session_detail kind=swimming (60), health_watch_session kind=swimming (420), health_swim_pb (32), health_body_comp (203), gym_swim_baseline (1). Every derived figure on both pages recomputed against live Neon.
severity-key: P0 data loss/leak/cost blowup; P1 lies or broken; P2 cost/debt/drift; P3 polish
---

# /swim audit, 2026-08-28

The 2026-08-26 full-site audit excluded this surface from all eight reports. This is its first pass.

**The single most important finding is P1-1: the 1:31 per 100 m that AGENTS.md documents as the
bug the two-column pace split was built to kill is still rendered on /swim today, three blocks
above the 1:38.71 official 100 m personal best, under the label "Swimming pace / 100m, rest
removed". The column split was real. It relabelled the number instead of eliminating it.**

The second theme is narrower than expected and worse: **/swim and /swim/deep give him
contradictory instructions about the same measurement.** The plan file names "a lower SWOLF always
means a better swim" as MYTH 2 and instructs him to raise his SWOLF by about 3 during the
continuity block; /swim/deep's headline section is a SWOLF trend across sessions at different
paces, telling him he is 3.0 off target. Both are one `<Link>` apart. See P1-3.

## P0

**None found.** What was hunted and the evidence for the negative is in the last section: /swim
holds one write path, it is append-only, cookie-gated in both the proxy prefix check and
`config.matcher`, and stubbed in the probe harness. No swim code deletes, updates or regenerates an
accumulated artifact. Nothing leaks. The cost finding on /swim/deep is real but capped by a single
URL rather than a combinatorial space, so it sits at P2-2 rather than P0.

## P1

### P1-1. The 1:31 per 100 m is still on the page, and it is now the fastest number on it

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\db.ts` lines 137 to 152 (the
  `min(s.moving_pace_per_100m_ms)` aggregate);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` lines 458 to 464 (the
  "Swimming pace / 100m" tile) against lines 121 to 135 (the tier table's "Your best" column);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` lines 350 to 356.
- Evidence, live Neon today. `min(moving_pace_per_100m_ms) filter (where > 0)` over all 475 sessions
  returns **90,696 ms**. `msToPace` rounds that to 91 s and prints **1:31**. The session behind it:

  ```
  date        distance_m  duration_ms  pace_per_100m_ms  moving_pace_per_100m_ms
  2025-01-22  300         1534008      511336            90696.336
  ```

  Its 12 length rows sum to 272,089 ms of swimming inside a 1,534,008 ms session: **82.3% of it was
  spent at the wall**, with recorded rests of 47 s to 119 s after ten of the twelve lengths. Two of
  the twelve are breaststroke. Meanwhile `health_swim_pb` holds `100 m, 2026-08-09, 98706 ms`, which
  `fmtTime` renders as **1:38.71** in the tier table on the same tab.
  AGENTS.md line 353 describes this exact session ("a 300 m session that ran 25 minutes with 4
  minutes of swimming in it, **faster than the official 100 m PB of 1:38.71**") in the past tense,
  as the defect that was fixed.
- Why it matters: the Now tab now renders three paces in this order: tier table 1:38.71 at 100 m,
  then "Best pace / 100m 1:48 (whole session)", then "Swimming pace / 100m 1:31 (rest removed)".
  The largest, boldest, fastest figure on the page implies he can swim 100 m in 1:31. He cannot; his
  measured best is 1:38.71 and his best sustained rest-excluded pace over any distance above 500 m
  is 1:48. This is a false "you have this", which is the worse direction. And it is worse than the
  original bug, because the label now carries a caption that reads like a disclosure ("rest
  removed") while the number is really "the best average of twelve 25 m sprints taken two minutes
  apart".
- Root cause, stated precisely: **the split fixed the column, not the minimum.** `moving_pace_per_100m_ms`
  is one definition now, but a minimum over it still selects across incomparable EFFORTS: a 12 x 25 m
  set with 90 s rest and a 5,000 m continuous swim are both one row. `db.ts` line 132 says "TWO
  MINIMA, over two columns that mean two different things" and got the diagnosis one level too shallow.
- Fix (Law 1, eliminate the class): make the best rest-excluded pace inadmissible unless the effort
  is comparable. Two options, both one SQL clause:
  1. Require a minimum continuous piece. Add `and s.distance_m >= 400` to the `best_moving_pace`
     filter in `db.ts` line 141 and rename the field `bestMovingPaceOver400mMs`, with the tile caption
     reading "rest removed, 400 m and up". Today that returns the 2026-08-14 500 m piece territory,
     around 1:50, which is credible against a 1:38.71 100 m.
  2. Better, because it removes the judgement call: derive the tile from the longest UNBROKEN piece
     rather than from a session average. `src/lib/swim/deep.ts` already splits sessions into pieces at
     recorded rests (`lastPieces`, lines 571 to 632). Reuse that shape to compute a best pace per
     unbroken piece of 200 m or more. That figure is directly comparable to a personal best because
     it is the same kind of thing.
  Either way, add the guard the class demands: **refuse to print a "swimming pace" faster than the
  100 m personal best.** A one-line assertion in `getSwimHistory` that returns null and a caption
  ("no comparable effort in the record") makes the lie unrepresentable rather than checked.
- Verify: `select min(moving_pace_per_100m_ms) from health_swim_session where moving_pace_per_100m_ms > 0`
  must no longer be what the tile prints, and the printed value must be slower than
  `select min(duration_ms) from health_swim_pb where distance_m = 100` (98,706 ms) on every render.
  Add that comparison as an assertion, not a comment.

### P1-2. The How tab prescribes the pace band that its own cue, three blocks below, names as wrong

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\plan.json` line 67
  (`theOneTechniqueChange.what`) against line 142 (cue 2's text) and the `cuesNote` at line 195,
  item (c); rendered by
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` lines 601 to 627, where
  `theOneTechniqueChange` renders FIRST under "The one change: go slower" and `<Cues>` renders below it.
- Evidence, both strings from the same file, both rendered on `/swim?s=how`:
  - line 67: `"Swim the continuity piece 10 to 15 seconds per 100 m SLOWER than your normal 100 repeats. Around 2:05 to 2:10 per 100 m."`
  - line 142: `"Do not use a fixed pace number. ... Your repeat pace spans 1:48 to 2:05 per 100 m, which is 27 to 31 seconds per length, so one printed number is wrong at one end of that range and the plan's '2:05 to 2:10' only fits the middle of it."`
  - `cuesNote` item (c): `"THE PLAN'S FIXED PACE BAND does not survive his own repeat range. ... The printed 2:05 to 2:10 only fits the middle. Cue 2 replaces the printed band with last session's median length time plus 3 seconds."`
  The `howToKnow` half of the same object WAS updated (line 67's sibling reads "Set the pace off last
  session length times, per the calibration cue"). The `what` half was not, so half the object points
  at the cue and half prints the number the cue retires.
- Why it matters: this is the one instruction on the page with a number attached, it is the first
  thing on the tab, and cue 2 is collapsed behind a `<details>` by default. The rendered order puts
  the retired figure in front of him and the correction behind a tap. On a 1:48 repeat day his
  correct target is 1:58 to 2:03; the page tells him 2:05 to 2:10, which is 7 to 12 s per 100 m too
  slow, on the block whose whole purpose is pacing.
- Fix: rewrite `theOneTechniqueChange.what` to point at the mechanism rather than a band: "Swim the
  continuity piece about 3 seconds per length slower than your last repeat session's middle length.
  Cue 2 below is how you set and buy that number." Delete the "Around 2:05 to 2:10 per 100 m"
  sentence. Then add the gate, because this is the second time a retired figure survived a rewrite
  in this file: extend `content/swim/validate.mjs` to fail when any string in `plan.json` outside
  `cuesNote` matches a pace band pattern (`/\d:\d\d to \d:\d\d per 100/`), since the file's own
  decision is that a printed absolute band is wrong.
- Verify: `node content/swim/validate.mjs` fails on the current file and passes after the edit;
  `grep -n "2:05 to 2:10" content/swim/plan.json` returns only the `cuesNote` retraction.

### P1-3. /swim/deep's headline section is built on the belief /swim's own plan file names as MYTH 2, and the two pages pull in opposite directions

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` lines 76 to
  166 (the whole `Swolf` component, especially lines 91 to 95 and 126 to 133);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\plan.json` line 195 (`cuesNote`,
  MYTH 2) and line 187 (cue 7);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts` lines 706 to 744
  (`swolfSummary`).
- Evidence:
  - `plan.json` cuesNote: `"MYTH 2: 'A lower SWOLF always means a better swim.' False by arithmetic whenever pace changes, since SWOLF is literally time plus strokes. Deliberately slowing down raises it. Only same-pace comparisons mean anything."`
  - `plan.json` cue 7: `"Because you are deliberately adding about 3 seconds per length, your SWOLF will rise by about 3, from 36-39 to about 39-42. Nothing has got worse and there is nothing to fix."`
  - `/swim/deep` line 118 draws `LineChart` over `recent`, which live Neon says is **113 sessions
    spanning 2025-08-25 to 2026-08-25 at every pace he has ever swum**, and lines 126 to 133 print:
    `"Your last swim was 37.1, which is 3 off your best of the last twelve months (34.1 on 9 Sep 2025)."`
    Recomputed live: best ever 30.9 (2025-06-06, 26 lengths, 23.8 s and 7.1 cycles), best in the last
    365 days 34.1 (2025-09-09), latest 37.1 (2026-08-25, 39 lengths, 28.4 s and 8.7 cycles).
    `off = 37.1 - 34.1 = 3.0`.
  - The plan asks him to open a gap of about 3. /swim/deep tells him to close a gap of exactly 3.0.
    For the next ten weeks, following the plan will make the number /swim/deep hands him as a target
    get worse, and /swim/deep will report that as regression.
  - The deep page's own lede (line 91) says "effort moves the first half and technique moves the
    second", then compares across sessions where effort moved, with no pace control anywhere in
    `swolfHistory` (`deep.ts` lines 233 to 260) or `swolfSummary`.
- Why it matters: this is not a stale sentence, it is two live surfaces on one subject giving
  opposite instructions, and the one he reads at the pool is the one that is right. The failure mode
  the repo already paid for on this page was a sentence its own table disproved. This is the same
  class one level up: a whole section whose premise its own plan file disproves, three taps away.
- Fix, in the order they matter:
  1. Control for pace. `swolfSummary` already has `avgSeconds` per point. Compare like with like:
     restrict `best`, `bestRecent` and the "off by" sentence to sessions whose `avgSeconds` is within
     a band of the latest session's (plus or minus 1.5 s covers his 27 to 31 s repeat range), and say
     so in the caption. Return the band and the sample size from `deep.ts` so the page prints them
     rather than asserting them.
  2. Render the arithmetic, not a target. Replace "which is 3 off your best of the last twelve
     months" with the two halves already returned: seconds per length and cycles per length, latest
     against the pace-matched comparison, so an increase caused by deliberate slowing reads as an
     increase in the seconds half and nothing else.
  3. Put MYTH 2 on the deep page. It currently lives only inside a `pre-line` blob behind a tap on a
     different route. One sentence in `Swolf`'s lede: "SWOLF is time plus strokes, so slowing down on
     purpose raises it. Only compare swims at the same pace." Derive nothing new; quote the file.
- Verify: with the pace band applied, print the comparison set size; on a build where the latest
  session is a plan-compliant slow continuity swim the page must not report a regression. Cross-check
  by hand: 2026-08-25 (28.4 s a length) must not be compared against 2025-09-09 unless that session
  is also near 28.4 s a length.

### P1-4. "Where you are" states a claim about "your last ten swims", lists nine numbers, and the diagnosis it draws is contradicted by the live last ten

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\plan.json` line 48;
  rendered by `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` lines 493 to
  501 (the "Where you are" block on the Now tab).
- Evidence. The stored value:
  `"About 1,000 m in pieces of 50 to 150 m. Longest piece in your last ten swims: 100, 100, 100, 500, 125, 250, 150, 100, 150 m. The long one happens monthly, not weekly. That is the gap, not fitness."`
  That is **nine values under a label saying ten**. Recomputed live from `health_swim_length`
  (longest run of consecutive lengths with no recorded rest between them), the ten most recent
  sessions carrying rest data, newest first:

  ```
  2026-08-25  200 m in 234 s
  2026-08-22  150 m in 170 s
  2026-08-21  100 m in 122 s
  2026-08-21  150 m in 178 s
  2026-08-20  150 m in 168 s
  2026-08-19  100 m in 115 s
  2026-08-18  150 m in 164 s
  2026-08-17  250 m in 265 s
  2026-08-16  125 m in 125 s
  2026-08-14  500 m in 573 s
  ```

  Seven of the ten hold a piece of 150 m or more, six of them inside eleven days. The stored list is
  a snapshot that ends around 2026-08-22, is missing the two newest swims, and is missing the
  **200 m piece on 2026-08-25, which is the longest in the current ten and is exactly the number he
  then recorded as his baseline two days later**.
- Why it matters: the sentence the whole ten-week plan rests on is "The long one happens monthly, not
  weekly. That is the gap, not fitness." Live, the long piece now happens most swims. The diagnosis
  that justifies the ladder has been overtaken by the training, and the page still prints it under
  the heading "Where you are". The page comment at lines 487 to 492 says the 2026-08-21 fix means
  "the page cannot outgrow what the laps say". It labelled the facts and left them typed, so it can
  and it has.
- Fix (Law 1): derive it. `deep.ts` already computes unbroken pieces. Add
  `getLongestPieces(limit = 10)` to `src/lib/swim/db.ts` returning `{date, metres, seconds}` per
  session, render it in the "Where you are" block, and delete line 48 from `plan.json`. The
  frequency claim then follows from the data instead of standing beside it: print "N of your last 10
  swims held a piece of 150 m or more" with N computed.
  If the derived version is too much work this session, the interim gate is the `check-ladder.mjs`
  precedent (AGENTS.md lines 481 to 490): a script the 07:15 sync task runs that recomputes the ten
  and exits non-zero when the stored string no longer matches. A validator cannot do it, because
  `content/swim/validate.mjs` is offline by design.
- Verify: after the change, a new swim with a 300 m piece must move the rendered numbers with no file
  edited. Today, compare the rendered list against the ten rows above; they must agree.

### P1-5. plan.json's seven cues, the only in-water instructions on the site, bypass the grounding validator entirely

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\validate.mjs` lines 267 and
  268 (the only two calls to `checkGroundedCues`);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\plan.json` lines 130 to 194 (the
  cues array); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\Cues.tsx`
  (renders them).
- Evidence:
  ```
  checkGroundedCues('coaching.json', swimCoaching, swimCoaching.checks || []);
  checkGroundedCues('teaching.json', swimTeaching, (swimTeaching.stages || []).flatMap((st) => st.cues || []));
  ```
  `grep -n "plan.cues\|cuesNote" content/swim/validate.mjs` returns **nothing**. The plan block of
  the validator (lines 44 to 64) checks `baseline`, `structure.calibration` and `structure.ladder`
  and never looks at `cues`.
  Consequences measured on the live file: the seven cues carry
  `confidence: convention, convention, contested, convention, evidence, convention, convention`.
  `contested` and `evidence` are **not in the enum the validator enforces on the other two files**
  (`sourced | inference | convention`, line 238: "An unlabelled cue is an agent's opinion wearing a
  coach's voice"). **0 of 7 carry a `quote`**, including the one labelled `evidence`, which is
  precisely what line 243 refuses elsewhere ("marked 'sourced' with no verbatim quote").
- Why it matters: this is the file that tells him what to do in deep water, and the risk is not
  hypothetical. `cuesNote` records five cues dropped from this exact array, two of them because a
  citation was inverted and because a threshold was "roughly three times its own evidence", plus one
  whose direct support was "seven national-level BREASTSTROKE specialists ... in a row labelled
  'evidence'". Every one of those was caught by a person reading, not by a gate. The gate that exists
  covers the two files whose cues are advice about other people and skips the one that is advice
  about him.
- Fix: add `checkGroundedCues('plan.json', plan, plan.cues || [])` and widen the enum deliberately
  rather than by omission: keep `sourced | inference | convention`, add `evidence` and `contested`
  as named members with their own rules (`evidence` requires a `quote` and a `url`, same as
  `sourced`; `contested` requires a `quote` plus a statement of what contests it). Today that fails
  the build on cue 5, which is the correct outcome: it claims `evidence` with no quoted sentence.
- Verify: `node content/swim/validate.mjs` exits non-zero on the current `plan.json` and names cue 5.
  Add one regression case to whatever suite covers this validator asserting that a cue marked
  `evidence` with no quote is refused, per the AGENTS.md rule that a gate only ever seen to pass has
  not been seen to work.

### P1-6. The How tab tells him "every stroke number in this document halves" is an open question; /swim/deep and AGENTS.md state it as settled, and the plan reasons from a Garmin manual about a Samsung watch

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\plan.json` line 187 (cue 7)
  and line 195 (`cuesNote`, "ONE OPEN ITEM" and item 4);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` lines 727 to 731
  (the Limits bullet); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\session.ts`
  lines 33 to 35; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` lines 402 to 404.
- Evidence, three surfaces on one measurement:
  - `/swim?s=how`, cue 7: `"Garmin counts one stroke per full cycle of the watch arm, so a watch reporting 9 should match about 18 hand entries. If your watch reports roughly the same number as your hand entries instead, it is counting differently and every stroke number in this document halves. Check your own watch's manual for its wording before trusting it."`
  - `cuesNote`, ONE OPEN ITEM: `"every stroke-count statement here depends on whether the watch counts arm cycles or hand entries, and the brief never says the watch is a Garmin."`
  - `/swim/deep`, Limits: `"Stroke counts are cycles. Not arm strokes. A median of 9 per 25 m as single strokes would be 2.78 m of travel each, which is not a thing that happens. Every stroke figure here depends on that reading."`
  - `cuesNote` item 4, on the same page, undermining that argument:
    `"The 2.78 m per cycle figure ignores the push-off, which in a 25 m pool eats several metres before the first hand entry, and the elite comparison range it was measured against ... carried no citation anywhere."`
  - The watch is Samsung. The entire pipeline is the Samsung Health export
    (`HealthOS/server/import-watch-sessions.mjs`, AGENTS.md line 287 onward). The only manual cited
    in `cuesNote`'s source list for this point is `www8.garmin.com/manuals/...`.
  - Live Neon confirms the median: `percentile_disc(0.5)` over 17,212 in-band freestyle lengths
    returns **9**, mean 9.18, range 4 to 34. `health_session_detail.stroke_rate` on recent swims is
    18.4 to 18.7, which is 9 cycles at roughly 2 per second of arm turnover, consistent with cycles.
- Why it matters: the page he reads at the pool holds open the possibility that every stroke number
  on the site is out by a factor of two, and asks him to run a test to settle it. The site's other
  surfaces have already declared it settled. Whichever answer is right, he is being handed both, and
  the open question has no capture mechanism: /gym has `open: [{q, asked, due}]` plus
  `scripts/gym-notes.mjs` exiting non-zero past `due` (AGENTS.md lines 561 to 573). `plan.json` has
  neither, so this question can sit here indefinitely, which is the exact failure the gym's `open`
  array was built to stop.
- Fix, two parts:
  1. Settle it in the file rather than in his pool time. The device-independent argument is the
     physical one and it does not need Garmin: 9 single arm strokes over 25 m implies 2.78 m of travel
     per stroke, and the counter-argument in `cuesNote` item 4 (push-off) shortens the swum distance
     but cannot halve 2.78 m to something plausible; a 5 m push-off leaves 20 m over 9 strokes, still
     2.2 m per stroke, still not a recreational swimmer. Write that arithmetic into cue 7, replace
     "Garmin" with "your Samsung watch", and delete "every stroke number in this document halves".
     If it is genuinely still open, say so in the same words on both surfaces.
  2. Give `plan.json` the gym's mechanism: an `open: [{q, asked, due}]` array on the plan, gated for
     shape by `content/swim/validate.mjs`, surfaced by a `scripts/swim-notes.mjs` twin of
     `gym-notes.mjs` that exits non-zero past `due`. Without it a swim question is prose, and this
     workspace's own table says prose loses.
- Verify: `grep -in garmin content/swim/` returns only the source list, not an instruction; the
  cycles claim reads identically on `/swim?s=how` and `/swim/deep`.

## P2

### P2-1. Eighteen un-batched Neon round trips across three routes, and `getDeepSwim`'s own docstring calls itself one

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts` lines 669 to 699
  (`getDeepSwim`, `Promise.all` of eleven);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` lines 737 to 742
  (plus `getSwimPbs`); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx`
  lines 379 to 394; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\db.ts` lines 121
  and 189 (two more `Promise.all` pairs).
- Evidence. Counted per route, one round trip per `sql` tagged template:

  | Route | Round trips | Where |
  |---|---|---|
  | `/swim` (default, `?s=now`) | **4** | `getSwimPbs` 1, `getRecentSessions` 1, `getSwimHistory` 2 |
  | `/swim?s=plan` | 1 | `getSwimBaseline` |
  | `/swim?s=how` / `?s=me` / `?s=teach` | 0 | filesystem only |
  | `/swim/deep` | **12** | `getDeepSwim` 11 + `getSwimPbs` 1 |
  | hub `/` swim row | 2 | `getSwimFrontRow`, `db.ts` line 189 |

  `deep.ts` line 669 reads `/** One call, one round of queries, for the whole deep-dive page. */`.
  It is eleven. AGENTS.md line 758 states the rule this breaks in the same words: "**Count round
  trips, not work.** ... A `Promise.all` makes queries concurrent, not free", and names
  `getShelfBundle` in `src/lib/reading/shelf-db.ts` as the pattern that sends nine as one
  `sql.transaction`. Nothing in `src/lib/swim/` uses `sql.transaction`. AGENTS.md line 782: "External
  API Requests on the billing page means Neon", and it is 100% of that meter on this account.
  Nine of the eleven statements scan `health_swim_length` (19,327 rows); `coverage()` alone scans it
  six times inside one statement.
- Why it matters: /swim/deep is the only reader of the largest table on the site and it is the
  heaviest single page render in the repo, at 12 round trips with no cache (see P2-2). /swim's Now
  tab is the only indexed training route and pays 4 per request per crawler hit.
- Fix: `getDeepSwim` becomes one `sql.transaction([...], { readOnly: true })`, same construction as
  `getShelfBundle`, with each query as a lazy fragment. `getSwimHistory` and `getSwimFrontRow` each
  become one transaction of two. Fold `getSwimPbs` into both callers' transactions. That takes the
  surface from 18 to 3. Then correct the docstring on line 669, or it becomes a lie again the next
  time somebody adds a query.
- Verify: `MSYS_NO_PATHCONV=1 vercel api /v2/observability/query -X POST --input body.json` for
  `vercel.external_api_request.count` grouped by `origin_route` shows at most 1 per `/swim/deep`
  render and 1 per `/swim` render.

### P2-2. /swim/deep is force-dynamic against the repo's own caching decision, on data that changes once a day at 07:15

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` line 10
  (`export const dynamic = 'force-dynamic';`); commit `8963763`.
- Evidence. That commit's message: "Twenty-two pages carried force-dynamic and nothing on the site
  had page-level caching, so every request, including every crawler hit, re-rendered from scratch
  forever. ... Six pages move from force-dynamic to ISR. All of them mirror data that changes when a
  sync script runs, not per request". /swim/deep takes no `searchParams`, performs no writes, and
  reads only tables the 07:15 `HealthOS/sync/run-health-sync.ps1` task fills. It is linked with a
  real `<Link>` from `/swim`, which is in `sitemap.ts` and is not disallowed in
  `src/app/robots.ts`, so a crawler must fetch this page to discover its `robots: { index: false }`.
  Firewall rule 4 (150 non-`/_next/` requests per minute per IP) is the only thing capping it, and
  rule 3 does not name any `/swim` path.
- Why it matters: 12 round trips and roughly 16 scans of a 19,327-row table, per hit, forever, on a
  page whose content changes once a day. AGENTS.md line 810 records that a single route was 67.1% of
  the account's CPU and that the fix was its `revalidate`, not its code.
- Fix: `export const revalidate = 3600;` on `src/app/swim/deep/page.tsx`, with an in-file comment
  saying why (the sync is a daily scheduled task, so an hour of lag is not staleness), matching the
  comment style `src/app/reading/page.tsx` line 22 carries. **Then read the build's route table and
  confirm the entry is `f` and not `o`**, per AGENTS.md line 173: without a directive Next can
  prerender a DB-backed page once and never look again, which is the other failure mode.
- Verify: the build route table shows `/swim/deep` as ISR, and a second request inside the window
  produces zero `vercel.external_api_request.count` for `origin_route /swim/deep`.
  Leave `/swim` itself force-dynamic: `?s=plan` renders `BaselineForm`, whose success state says
  "Saved. Reload to see the ladder", so that tab must not be cached. Write that reason into
  `src/app/swim/page.tsx` line 18, which currently carries no comment at all.

### P2-3. The weight-band headline names the band chosen by the column the page itself calls unfair, and the fair column names a different band

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` lines 322,
  368 to 381 and 446 to 452; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts`
  lines 439 to 457 (`bandByWeight`).
- Evidence. `const fastest = [...bands].sort((a, b) => a.bestPaceSeconds - b.bestPaceSeconds)[0]!;`
  and the rendered sentence "Your fastest swimming sits in the **{fastest.loKg} to {fastest.hiKg} kg**
  band, not the lightest one." Recomputed live:

  ```
  band        swims  avg pace  best pace
  95 to 100     14      150       119
  100 to 105    71      135       108
  105 to 110    51      146       108
  110 to 115    44      131        91
  115 to 120    93      141        94
  120 to 125    25      124       109
  ```

  `fastest` by best pace is **110 to 115 kg**, and that band's 91 s is the 2025-01-22 artifact from
  P1-1. By AVERAGE pace the fastest band is **120 to 125 kg** at 124 s, the heaviest one. The page's
  own caveat, sixty lines below the sentence, says: "the best-pace column favours short, heavily
  rested efforts, because rest is excluded from it: **the average column is the fairer comparison
  between rows.**"
- Why it matters: the headline claim is derived from the column the page names as the worse one, and
  the better column gives a different answer. The overall conclusion survives both readings (lighter
  is not faster either way, which I verified: average pace does not fall as weight falls), so this
  is not a lie, which is why it is P2 and not P1. But the specific band he will remember is the
  wrong one, and it is wrong because of the same single session that produces P1-1.
- Fix: sort `fastest` on `avgPaceSeconds`, not `bestPaceSeconds`, and say which column the sentence
  used. Better, per Law 1: drop `bestPaceSeconds` from `WeightBand` entirely. The page already
  argues it is not comparable between rows, and a column nobody should compare has no business in a
  comparison table.
- Verify: the sentence names 120 to 125 kg on today's data, and the table's Best column is either
  gone or captioned as not comparable.

### P2-4. "Swimming after lifting" types its conclusion instead of deriving it, and covers 57 of 475 swims without saying so

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` lines 495 to
  501; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts` lines 465 to 505.
- Evidence. The rendered sentence is a string literal: `"Swimming straight after lifting does not
  look like it costs anything, and on this sample it looks slightly better."` Only `smallest` is
  derived. Recomputed live:

  ```
  cohort                                        swims  avg pace  avg SWOLF
  Within 45 minutes of racking the last set      39      121.7      39.0
  No lifting in the six hours before             13      127.7      40.6
  Later the same day                              5      118.5      38.2
  ```

  The claim **holds today** (121.7 against 127.7). It is not derived, so it will not stop holding out
  loud. And the cohort query starts from `health_session_detail d where d.kind = 'swimming'`, which
  holds **60 rows** against 475 sessions in `health_swim_session`; 57 swims reach the table. Nothing
  on the section says so, while every other section on the page prints its own coverage.
- Why it matters: this is the class that already shipped on this page (a typed direction beside a
  table that could disprove it), and the fix that was applied everywhere else was to derive the
  claim. AGENTS.md line 384: "The corollary that is cheaper than a screenshot: derive the claim."
  This section is the one that was missed.
- Fix: compute the direction. Return the within-45 cohort's pace minus the no-lifting cohort's from
  `deep.ts`, and render one of three branches on its sign, with the magnitude printed. Add the
  coverage line the other sections have: "{real count} of {total swims} swims, the ones with a start
  time and a rest-excluded pace", with both numbers queried.
- Verify: flip the sign in a scratch copy of the cohort data; the sentence must change. The coverage
  line must read 57 of 475 today.

### P2-5. `noBuoy` is the one field the baseline route calls load-bearing and the only one with no validation, and its default suppresses the warning

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\api\baseline\route.ts` line
  53, against lines 26 to 29 and the three checks on `metres` at lines 34 to 45;
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\BaselineForm.tsx` lines 58 to 64.
- Evidence. The route's own docstring: `"`noBuoy` is not a nicety. The entire reason the number was
  unknown is that the lap data shows 600 m unbroken and he remembered 200 m ... A baseline swum with
  one is a different number, and letting it overwrite the other silently would rebuild the exact
  ambiguity this swim exists to settle."` The code:
  ```
  noBuoy: b?.noBuoy !== false,
  ```
  `metres` gets three refusals with instructions. `measuredOn` gets a regex. `noBuoy` gets a loose
  inequality: `"false"` (a string), `0`, `null` and a missing key all become `true`.
  `true` is the value that renders NO caveat: `BaselineForm` line 61 prints the warning
  ", WITH the buoy, so the ladder below is measured from an assisted swim" only when `noBuoy` is
  false. So a garbled or absent flag defaults to the reading that hides the disclaimer, on the one
  field that exists to carry it.
- Why it matters: the whole ladder is measured from this row. Live, `gym_swim_baseline` holds exactly
  one row: `2026-08-27, 200 m, no_buoy = true`. With base 200 the ladder resolves to 200 / 300 / 400 /
  500 / 600 m. If that `true` were ever a coercion rather than a click, five rungs would be measured
  from an assisted swim with nothing on the page saying so.
- Fix: `if (typeof b?.noBuoy !== 'boolean') return 400 'noBuoy must be true or false: the buoy is the
  whole reason this number was unknown'`. Fail closed on the field the route calls load-bearing,
  the same posture `src/lib/auth.ts` took on 2026-08-28.
- Verify: `POST {"metres":400,"measuredOn":"2026-08-28","noBuoy":"false"}` returns 400 instead of
  silently inserting `no_buoy = true`.

### P2-6. `health_swim_pb.achieved_on` is a fifth date column, rendered on both pages, and absent from the zone table AGENTS.md keeps for exactly this hazard

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\level.ts` lines 126 to 137
  (`getSwimPbs`, `select ... achieved_on`, no conversion);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` line 126 (rendered beside
  "Your best"); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` lines
  247 and 213 (rendered through `when()` in every progression table and in the log-start caveat);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` lines 358 to 374.
- Evidence. AGENTS.md names four date columns and their zones and says "**Do not add a swim figure
  keyed on `date`.**" It does not mention `health_swim_pb.achieved_on`, which is `text`, is selected
  raw, and is printed on both swim surfaces. I ran the same discriminating test AGENTS.md used for
  the other columns, over all 32 PB rows against the derived local swim dates and the raw UTC dates:

  ```
  pbs  matches a derived LOCAL swim date  matches a RAW date  matches neither
  32              29                            21                  0
  ```

  **The verdict is that it is safe: 29 of 32 against 21 of 32 is the same signature as the 359 of 361
  against 271 that justified `SWIM_LOCAL_DATE`, pointing the other way.** Selecting it raw is
  correct. Nobody had established that, and nothing records it.
- Why it matters: a false alarm here would be expensive (it would push somebody to convert a column
  that is already right), and so would the reverse. The honest state is that a fifth date column
  reaching two rendered surfaces sits outside the table the repo maintains to stop this class.
- Fix: add a row to the AGENTS.md paragraph at line 358 naming `health_swim_pb.achieved_on` as LOCAL
  with the 29-of-32 measurement and the date it was taken, and add a comment above `getSwimPbs` in
  `level.ts` saying it is deliberately not converted and why. Then make it executable: extend
  `HealthOS/server/import-watch-sessions.mjs`'s existing PB derivation self-test (which already
  re-tests the distance mapping on every import) to assert that each imported `achieved_on` matches a
  local swim date, so a firmware or export change that flips the zone exits non-zero rather than
  silently shifting his personal bests by a day.
- Verify: re-run the query above after any import; `match_local` must stay well above `match_raw`.

### P2-7. "Your last swim" on /swim/deep is `array[length - 1]` after an `order by` on a date with no tiebreaker, and he swims more than once a day

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts` line 312
  (`order by d asc` in `restHistory`) and line 247 (`order by d asc` in `swolfHistory`);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` line 513
  (`const latest = rest[rest.length - 1]!;`) and line 79 via `swolfSummary`
  (`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts` line 733,
  `const latest = points[points.length - 1] as SwolfPoint;`).
- Evidence. Both series are grouped per SESSION and ordered by the derived DAY only. Live, three
  swim sessions share the derived local date 2026-08-21:
  ```
  8ce84c01  start_time 2026-08-22 02:30 UTC  19 min  no distance
  252d0c68  start_time 2026-08-22 02:19 UTC   7 min  250 m,  9 lengths
  f1a2ec54  start_time 2026-08-21 18:07 UTC  33 min  1000 m, 40 lengths
  ```
  and two share 2026-08-22 in `restHistory`'s 20-row tail. Postgres gives no guaranteed order inside
  an equal sort key, so "Last swim 37.5" and "Last swim 34% at the wall" can be the morning swim.
  Today the maximum date (2026-08-25) holds one session, so nothing is visibly wrong.
- Why it matters: it is a latent wrong-number-under-a-correct-label, the same shape as the
  "Best this year" tile over a September date that only the screenshot caught. It fires whenever he
  swims twice on a day, which the record shows happening repeatedly in August.
- Fix: order both queries by the session's start instant, not the day:
  `order by min(session_start_time) asc` in `swolfHistory` (it already groups by `session_uuid`) and
  `order by l.st asc` in `restHistory`. Then `[length - 1]` means what the label says.
- Verify: on a two-session day the "Last swim" tile must match the later `start_time`; check against
  the three rows above by forcing the window.

### P2-8. "What the history says (475 sessions)" puts all-time tiles above a 90-day chart that never states its window

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` lines 427 to 482;
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\db.ts` lines 117 to 173.
- Evidence. The label prints `{now.history.totalSessions}` which the `prRows` aggregate computes with
  **no date filter at all** (475). "Longest", "Best pace" and "Swimming pace" are all-time. The
  `BarChart` beneath them is fed `now.history.sessions`, which the first query filters to
  `>= daysAgo(90)`: live, **41 sessions in the window, 38 carrying a distance**, so 38 bars. Nothing
  in the block says 90 days. The only caption is "Last swim the watch export has reached: Aug 25".
- Why it matters: 38 bars under a heading saying 475 sessions reads as the whole record compressed,
  which would make his 2018 to 2024 swimming look like it did not happen. The block deliberately says
  where the data stops and does not say where the chart starts.
- Fix: caption the chart with its own window, derived from the array rather than typed:
  "The last 90 days, {points.length} swims with a distance recorded." `getSwimHistory` already takes
  `days`; return it in the result so the caption cannot drift from the query.
- Verify: change the call to `getSwimHistory(30)` in a scratch copy; the caption must change with no
  other edit.

### P2-9. Two "percent off the next level" figures on one page, computed against different denominators

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` lines 139 to 145
  (the derived sentence); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\standards.json`
  line 259 and line 33 (typed, rendered through `Prose` at page.tsx line 195 and through the tier
  list at line 173).
- Evidence. The page computes `(100 * closest.next.gapMs / closest.best.durationMs).toFixed(0)`,
  which divides by HIS time. `standards.json` line 259 reads
  `"That target is the 1500. You are 4.5% off the B standard there and 18.6% off it at 100 m"`,
  which divides by the STANDARD. Recomputed live from `health_swim_pb` and the tier times:

  ```
  distance  PB         next tier   gap      % of his time   % of the standard
  100 m     1:38.71    B 1:23.26   15.45s      15.6%            18.6%
  200 m     3:29.80    B 3:09.39   20.41s       9.7%            10.8%
  400 m     7:23.62    B 6:58.02   25.60s       5.8%             6.1%
  1500 m   30:58.56    B 29:38.77  79.79s       4.3%             4.5%
  ```

  So the rendered sentence says "**4%** faster" at 1500 m and the prose two blocks below says
  "**4.5%** off", about the same gap, with neither naming its denominator. Both are typed or derived
  from PBs that move: every one of the four `standings` rows is live, and `profileNote` is a string.
- Why it matters: he audits these. Two numbers for one gap, on one screen, is the thing that costs
  trust in the rest of the table. Separately, `profileNote` is typed prose containing four derived
  figures on a page whose whole design principle is that figures come out of a query.
- Fix: pick the denominator (his own time is the honest one, since it answers "how much faster do I
  have to be"), state it in the rendered sentence ("4% faster than you currently swim it"), and
  delete the percentages from `standards.json`'s `profileNote` and from the tier `what` on line 33,
  replacing them with a reference to the table. The tier list already renders derived numbers beside
  each rung.
- Verify: `grep -nE "[0-9]+\.[0-9]% off" content/swim/standards.json` returns nothing, and one
  percentage appears per gap on the rendered page.

### P2-10. Two load-bearing disclosures on /swim/deep sit behind a 32px tap target (shared file, coordinate)

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\training.css` line 655
  (`.training details.src > summary { ... min-height: 32px; }`), applied to
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` line 138
  ("Why this can disagree with the SWOLF on your last session card") and line 389
  ("Why this cannot be untangled, year by year").
- Evidence. The same stylesheet, line 836, records the precedent: "The rest rule's reasoning is not
  tertiary, and 32px is under the 44px floor this repo enforces", and raises that one summary to
  44px. Line 414 records the 32px as a deliberate choice for "the tertiary `.src` citations". The two
  summaries above are not citations: the first carries the entire two-definitions-of-SWOLF
  disclosure, and the second carries the year table that `deep.ts` line 128 says exists because a
  sentence written without it was false. On /swim the same rule covers "Why there is no 25 m or 50 m
  here" and "Why there is no number written here".
- Why it matters: the repo's own measured standard is 44px, the exception is scoped to citations, and
  these five are not citations. AGENTS.md's 2026-08-26 audit found eight controls under the floor by
  measuring every control on every page; /swim was excluded from that audit.
- Fix: give the load-bearing disclosures their own class at 44px rather than raising all of `.src`,
  which would undo a deliberate decision. Add `.training details.src.disclosure > summary
  { min-height: 44px; }` and put `className="src disclosure"` on the five named above. Shared file,
  so coordinate with whoever owns `/gym`, `/run`, `/bike` and `/health`: the selector is used across
  all of them and only the new class is additive.
- Verify: measure both summaries in devtools at 390px; both boxes at or above 44px, and the tertiary
  citations elsewhere unchanged at 32px.

### P2-11. `cuesNote` ships 11 KB and 1,779 words of developer prose to his phone, which is exactly what `content.ts` strips `$comment` to prevent

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\plan.json` line 195;
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\Cues.tsx` (the `note`
  block, rendered inside `details.src` with `whiteSpace: 'pre-line'`);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\content.ts` lines 8 to 18.
- Evidence. Measured: `cuesNote` is **11,309 bytes, 1,779 words**; `plan.cues` is 17,971 bytes; the
  whole file after `$comment` stripping is 35,262 bytes. `content.ts`'s own reason for the stripper:
  "plan.json's is 30 lines, and every one of them would otherwise be serialised into the RSC payload
  and shipped to his phone on each load ... it is developer text and it has no business on a mobile
  connection at the side of a pool." `cuesNote` is developer text in a rendered field, so the
  stripper does not touch it: it contains "WHAT I DROPPED, AND WHY", "SOURCES I FETCHED MYSELF FOR
  THIS FINAL PASS", DOIs, Europe PMC REST URLs and "WHERE THE PLAN IS WRONG, three things".
- Why it matters: `/swim?s=how` is a poolside tab, and it ships about 29 KB of cue text of which 11 KB
  is an audit trail written for an agent. It also means the retractions in it (P1-2's item (c),
  P1-6's open item) are on the page as live text, quoting the wrong figures inside sentences saying
  they are wrong, which is how a grep of the rendered page finds the retired band.
- Fix: move the dropped-cue log and the source list into `$comment` (which is stripped) and keep only
  what he needs in `cuesNote`: the three myths, which are genuinely for him. That is roughly 1.5 KB
  of the 11. Give `content/swim/validate.mjs` a length cap on any rendered string field, since the
  gym learned the same lesson from note #12 ("Walls of text again why do I need all this").
- Verify: the RSC payload for `/swim?s=how` shrinks by about 10 KB;
  `grep -c "SOURCES I FETCHED" content/swim/plan.json` finds it only under a `$comment` key.

### P2-12. `SessionStats` and `LengthBars` compute a moving pace and a chart from unbanded length durations; `deep.ts` bands the same rows for exactly that reason (shared file, coordinate)

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\SessionCharts.tsx`
  (`const swimSec = s.series.lengths?.reduce((a, l) => a + l.s, 0) ?? 0;` in `SessionStats`, and
  `const max = Math.max(...secs);` in `LengthBars`);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\RecentSessions.tsx` (the
  "Moving pace" column, same reduce);
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts` lines 41 to 51
  (`LENGTH_MIN_MS = 12_000`, `LENGTH_MAX_MS = 120_000`, "Left in, one of them moves a session's
  average by a factor of ten").
- Evidence. Live: 70 length rows sit outside the 12 to 120 second band (19 under, 51 over), the
  fastest is 9,034 ms and the slowest 1,351,420 ms (22.5 minutes). **8 of the 60
  `health_session_detail` swim rows contain at least one out-of-band length.** None of them is in the
  ten most recent, so nothing is visibly wrong on /swim today: I recomputed "Pace swimming" both
  banded and unbanded for the last twelve detail sessions and every pair agreed to the second.
- Why it matters: /swim renders `LastSession` and `RecentSessions` for the latest ten. As soon as one
  of those 8 sessions enters the window, "Pace swimming" and "Moving pace" become wrong by up to a
  factor of ten, and `LengthBars` flattens all forty bars to nothing against a 22-minute maximum.
  Two definitions of one metric on two pages is the thing the pace-column split was supposed to end.
- Fix: export the band from one place. Move `LENGTH_MIN_MS` and `LENGTH_MAX_MS` out of `deep.ts` into
  a module both sides import, filter `s.series.lengths` through it in `SessionStats`,
  `RecentSessions` and `LengthBars`, and print the count dropped ("2 lengths excluded, the watch was
  left running at the wall") so the exclusion is visible rather than silent. Shared file, so
  coordinate: `/run` and `/gym` render the same components but never touch `series.lengths`.
- Verify: force `LastSession` onto one of the 8 sessions
  (`select d.uuid from health_session_detail d where d.kind='swimming' and exists (select 1 from
  health_swim_length l where l.session_uuid = d.uuid and l.duration_ms not between 12000 and 120000)`)
  and confirm the pace matches the banded figure and the bar chart is readable.

### P2-13. The Now tab calls the buoy question open in two places; the Plan tab renders the answer, recorded 2026-08-27

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\plan.json` line 43 (baseline
  fact 2) and line 63 (`theGoal.whatThatActuallyIs`), both rendered on `/swim?s=now` through
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` lines 493 to 501 and 533
  to 535; against `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\BaselineForm.tsx`
  lines 58 to 64 on `/swim?s=plan`.
- Evidence. The two rendered strings:
  - line 43: `"200 m without the buoy, on 2026-08-16. Both can be true if the buoy was in on the long ones, and on 2026-08-21 you did not remember which. Nothing in the export records a buoy, so the week-0 swim settles it."`
  - line 63: `"The open question is whether the buoy was in, not whether you can swim for eleven minutes."`

  Live `gym_swim_baseline`, all of it:
  ```
  id  measured_on  metres  no_buoy  note  created_at
  1   2026-08-27   200     true     null  2026-08-27T19:49:24.200Z
  ```
  The week-0 swim happened on 2026-08-27 and returned 200 m unassisted. `/swim?s=plan` prints "Your
  number is 200 m, set 2026-08-27, no buoy" and the ladder resolves off it (200 / 300 / 400 / 500 /
  600 m; I checked the floor case, which is why rung 7 to 8's second piece reads 100 m rather than
  0 m). `/swim?s=now` still says the question is open.
- Why it matters: two tabs of one route disagree about whether a question has been answered, and the
  Now tab is the one he opens by default. This is a false "you lack this", which is the less
  expensive direction, so it is P2 rather than P1. But the direction he will read it in is
  "the plan still does not know what I can do", on the tab whose heading is "Where you are".
- Fix: both strings should read the baseline instead of asserting an unknown. `getSwimBaseline` is one
  round trip and the Now tab already pays four; fold it into the existing `Promise.all` at
  `src/app/swim/page.tsx` line 383, and render the two facts conditionally: with a baseline present,
  "Settled on {measuredOn}: {metres} m {noBuoy ? 'with no buoy' : 'with the buoy'}". Delete the
  "open question" clause from line 63.
  Note the substantive tension the fix will expose and should say out loud: the lap data shows 600 m
  unbroken twice on 2026-05-22 at stroke counts (8.92 and 8.96 cycles per length) that
  `plan.json` line 39 argues rule out paddles, and his calibration swim came back at 200 m. Both
  facts are now on the page with nothing reconciling them. That is a judgement call for him, not one
  to invent: the honest rendering names both numbers and says the ladder is measured from the 200.
- Verify: with the row above in place, `/swim?s=now` must not contain the string "open question", and
  the two tabs must name the same number and the same date.

## P3

### P3-1. Three different recorded widths for the sub-tab row, and the five-chip ceiling is the argument for /swim/deep existing

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` line 88 ("the chips end at
  **317px** of a 390px screen"); `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx`
  line 410 ("The five chips above measure **337px** of a 390px screen");
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` line 22 ("The five
  chips on /swim measure **337px** of a 390px screen").
- Evidence: `.training .subtabs` is `display: flex; gap: 18px;` with no `flex-wrap` and no
  `overflow-x` (`src/app/training.css` lines 935 to 953), so the five chips either fit or overflow.
  Nothing in the repo re-measures it. Two numbers 20px apart describe the same row, and the gap
  between 337 and 390 is the entire headroom the design decision rests on.
- Fix: measure it once at 390px on the shipped build, write the number in ONE place, and have the
  other two reference that place rather than repeating the figure. Better, per the meta-law: add the
  invariant to `scripts/probe-gym.js` as a check ("0 horizontal overflows, 0 wrapped nav rows" is
  already the stated invariant across eleven training views and nothing executes it), so a sixth chip
  fails a test instead of a comment.
- Verify: measure `.subtabs` `scrollWidth` against `clientWidth` at 390px on all five training routes;
  the check must fail if a chip is added.

### P3-2. Typed figures in code comments that live Neon disagrees with

All are comments, none is rendered, so the cost is a future session deriving the wrong thing from
them. Verified against live data:

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts` line 526: "The two longest
  are 698 and **544** days". Live: 698 (2019-09-30 to 2021-08-28) and **545** (2018-01-03 to
  2019-07-02).
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts` line 150: "**Every series in
  that log begins on 2023-09-12**", and
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\deep\page.tsx` line 183: "It is the
  same day for every distance, which is the tell". Live: 100 m, 200 m and 400 m all begin 2023-09-12;
  **1500 m begins 2023-09-27**. The rendered caveat is derived (`logStart` is computed) and is
  correct; only the comments are wrong.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\level.ts` lines 13 to 15 and
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` lines 90 to 92: "**Three**
  tiers are real published standards for men 35-39; **two** are multiples of one of those". Live
  `standards.json`: **2** `sourced`, **6** `third-party`, **1** `constructed`, **1** `capability`.
  The rendered paragraph (page.tsx lines 186 to 190, "Two rungs are published standards ... six come
  from an independent project ... One is ours") is correct; the two comments and
  `content/swim/validate.mjs` lines 71 to 72 carry the old mix.
- Fix: correct all five, and for the tier mix count it rather than typing it: the rendered paragraph
  should read the counts off `standards.tiers` by `provenance`, which is three lines and removes the
  class.

### P3-3. Rendered fields carrying developer text and diff notes

- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\swim\plan.json` line 36:
  `"sessionsPerWeek": "3 to 4, unchanged"` renders as the tag beside the plan title, so the page reads
  "Swim (3 to 4, unchanged)". "unchanged" is a note about a previous version.
- Line 63, `theGoal.whatThatActuallyIs`, renders `"This file used to say your best continuous effort
  was \"around 3 minutes\". It is 11:36, and you did it twice in one session on 2026-05-22."` A
  self-retraction on the tab he reads at the pool. (I verified the 11:36: the 2026-05-22 1500 m
  session splits into pieces of 600 m in 696 s, 100, 100, 100, and 600 m in 731 s, which is 11:36 and
  12:11 exactly as `plan.json` line 39 states. That fact is right; it is the retraction around it that
  does not belong on the page.)
- Line 132 area, `paddleRule.rule`, opens `"DORMANT: on 2026-08-21 you said you have not used paddles
  at all."` Honest, but "DORMANT" is a field state leaking into a rendered sentence.
- Fix: move retractions and state labels into `$comment`, which `content.ts` strips. Keep the facts.

### P3-4. Small dead and inconsistent fragments

- `YearProfile.avgPaceSeconds` (`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts`
  lines 139 and 433) is computed on every /swim/deep render and never rendered: the year table
  (`deep\page.tsx` lines 404 to 412) prints Year, Swims, Distance, Weight, Best. Meanwhile the caveat
  directly under that table (line 450) says "the average column is the fairer comparison between
  rows", referring to a column the table it sits under does not have. Either add the column or move
  the caveat to the band table it describes.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` line 443 renders the
  longest swim as `{Math.round(...)}` with no separator ("5000m") where
  `deep\page.tsx` line 298 uses `toLocaleString('en-CA')` ("5,000 m") for the same number.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\page.tsx` line 375:
  `const plan = await loadSwimPlan();` runs unconditionally, so the `me` and `teach` tabs read and
  parse a 39 KB JSON file they never reference. Move it inside the branches that use it.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\swim\api\baseline\route.ts` line 47
  accepts any `YYYY-MM-DD`, so a typed future date (`2062-08-27`) pins the baseline forever, since
  `getSwimBaseline` orders by `measured_on desc`. Every other field on the route has a range check.
  Add one: not in the future, not before 2018.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\session.ts` line 139 ends the swim
  verdict with "Your stroke rate is the low half of that pair", which reads as a claim that the number
  is low rather than as a pointer to the strokes half of SWOLF. One word: "the strokes half of that
  pair". Shared file, coordinate.
- `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\swim\deep.ts` line 264 (`swolfAgreement`)
  omits the `session_start_time is not null` filter that `swolfHistory` line 244 carries, so the
  agreement figure could in principle be computed over a different population than the chart. Live it
  cannot: `select count(*) from health_swim_length where session_start_time is null` returns **0**.
  Harmless today, worth one line for symmetry.
- The Limits section (`deep\page.tsx` lines 706 to 711) types two figures the page could derive:
  "The fastest length in the file is **9.03** seconds ... and the slowest runs to **22 minutes**".
  Both verified true today (9,034 ms and 1,351,420 ms) and both will go stale silently. `coverage()`
  already returns `excludedRows`; return the min and max too.
- `Gaps` (`deep\page.tsx` line 680) types "the **two** that span the years you were not swimming at
  all" three lines under a derived "**3** of these ran past three months". Live: 3 gaps over 90 days
  (698, 545, 174), of which 2 span years. Both true, but the two counts read as contradictory. Derive
  the second or reword it.

## What was hunted and NOT found

Each of these was a specific failure hypothesis, checked against live Neon or the file, and the
answer was that it holds. Written down because a false "you lack this" costs somebody a session.

- **A figure keyed on a raw `date` column that should be derived.** Every rendered date on both pages
  is derived or safe. `SWIM_LOCAL_DATE` is used in all four places `health_swim_session` is dated
  (`db.ts` lines 123, 129, 146, 195). Live: 94 of 475 sessions differ between raw and derived, exactly
  as documented; **108 sessions have no start time anywhere and 0 of those 108 are among the 94**, so
  the documented fallback ("keep the raw value rather than being dropped") never silently ships a
  shifted date. `getSwimHistory().lastSessionOn` returns 2026-08-25 and `health_session_detail` dates
  the same swim 2026-08-25: the two-dates-on-one-screen bug is fixed and stayed fixed. The two
  deliberate raw-date users (`yearProfile`'s `left(s.date, 4)` and `seasonGaps`'s third union branch)
  both carry the reasoning in place and both are correct: a one-day shift can only move a swim between
  years on a 31 December evening, and on a 14-day gap threshold an extra adjacent day can only close a
  gap, never invent one. The fifth date column is P2-6 and it is safe.
- **A minimum or maximum over a mixed column.** All of them are single-definition now.
  `min(pace_per_100m_ms)` is wall clock throughout (live best 107,728 ms, 1:48, from a 2,000 m swim on
  2023-03-30 whose moving pace is 107,733 ms, so that session was essentially continuous, which is the
  right shape for a wall-clock best). `bandByWeight`'s `Math.min` and `yearProfile`'s `min` both run
  over `moving_pace_per_100m_ms` only. `swolfSummary`'s `best` and `worstAllTime` run over one
  computed definition. `standingFor`'s `best` runs over `health_swim_pb.duration_ms` per distance.
  **The remaining defect is not a mixed column, it is a minimum over mixed EFFORTS, which is P1-1.**
- **The PB distance mapping going wrong on the surface.** `health_swim_pb` holds 32 rows at exactly
  100, 200, 400 and 1500 m. Best times per 100 m rise monotonically with distance
  (98,706 / 104,900 / 110,906 / 123,904 ms), which is the invariant
  `HealthOS/server/import-watch-sessions.mjs` re-tests on every import. If a firmware renumbering ever
  did land, the surface degrades safely rather than lying: `SwimLevel` filters `standings.filter(s =>
  s.best)` so an unmapped distance shows no row, `Progression` filters `history.length > 1`, and
  `ratedDistances` covers 50, 100, 200, 400, 800, 1500, 3000 and 5000 so a shifted type would land on
  a distance with tier times rather than crashing. The failure would be a wrong LEVEL, not a wrong
  page, and it would be visible: a 100 m PB filed as 400 m would read as a top-tier time.
- **Stroke-rate figures treating cycles as arm strokes.** Live median is **9** cycles per in-band
  freestyle length (n = 17,212, mean 9.18). Every consumer treats it as cycles: `SessionStats` labels
  it "Cycles / length", `sessionVerdict` says "cycles a minute", `RecentSessions`'s trend note says
  "seconds plus stroke cycles", `deep.ts`'s SWOLF adds `avg(stroke_count)` unhalved (correct: SWOLF is
  defined on the counter's own unit), and the Limits section states it. **No figure on either page
  doubles or halves it.** The defect is not an arithmetic error, it is that the How tab says the
  question is open: P1-6.
- **`/swim/api/baseline` gating.** Present in BOTH places, verified by reading both:
  `src/proxy.ts` line 86 (`pathname.startsWith('/swim/api')`) and line 116
  (`'/swim/api/:path*'` in `config.matcher`). Also in `scripts/lint-probe-routes.mjs` `API_ROOTS`
  (line 29) and in `scripts/probe-gym.js` `WRITE_ROUTES` (line 65), so an unstubbed POST fails the
  build. `metres` is validated three ways with instructional errors; `note` is capped at 500 chars;
  the whole handler is in a try/catch that returns 500 rather than leaking a stack. **No raw body cap
  anywhere**, but that is the posture on all 20 write routes in the repo (`grep` found no
  `content-length` check on any of them) and every one of them sits behind the same cookie gate, so it
  is a site-wide question and not a swim defect. The one real gap in this route is P2-5.
- **A `noindex` where one is wanted, or missing.** `/swim/deep` declares
  `robots: { index: false, follow: false }` (`deep\page.tsx` line 16) and is correctly absent from
  `src/app/sitemap.ts`. `/swim` is indexed, declares `alternates: { canonical: '/swim' }` in the
  layout so the five `?s=` URLs collapse to one, and is listed in the sitemap at `weekly` with the
  reasoning written in place. `src/app/robots.ts`'s deliberate "nothing is disallowed except three
  cost-shaped paths" posture is consistent with both. Nothing here needs changing; the cost question
  is P2-2.
- **A combinatorial crawlable URL space, the `/reading/shelf` shape.** /swim emits exactly five
  crawlable `<Link>` hrefs (`/swim`, `/swim?s=plan|how|me|teach`) plus `/swim/deep`. `sp.s` is matched
  against `SUB_TABS` and falls back to `now`, so an invented `?s=` value renders the default tab
  rather than a new page, and the canonical is fixed. No filter chips, no pager, no seed. There is no
  URL space to walk here.
- **A prose sentence the numbers beside it disprove.** This was the highest-value goal and it produced
  four confirmed findings (P1-2, P1-3, P1-4, P2-3) plus one latent (P2-4). It also produced three
  clean negatives worth recording, because the page derives them and the derivations are right:
  - The weight section's headline "Being lighter has not, so far, made you faster in the water" is
    **true on both metrics**: average pace by band runs 150, 135, 146, 131, 141, 124 s from lightest
    to heaviest, so it does not fall as weight falls.
  - The year table's conclusion is derived and **correct**: `fastestYear` is 2025 (best 90,696 ms,
    102 swims, 118.4 kg avg) and `biggestYear` is 2023 (186 swims, 157,312 m, 104.4 kg avg), so
    `biggestYear.avgKg < fastestYear.avgKg` and the page renders the branch reading "the year you swam
    most was one of the LIGHTER ones and the year you swam fastest was heavier". That is the exact
    sentence that replaced the false one, and it survives the query. I also checked the trap: biggest
    by SWIMS (2023) and biggest by DISTANCE (2023, 157 km) are the same year, so the derived label
    "biggest year" agrees with the Distance column beside it. And the 2025 verdict survives switching
    to average pace (2025 at 112,412 ms against 2026 at 146,160 and 2023 at 143,837), so it does not
    depend on the P1-1 artifact even though it is currently computed from it.
  - The `Progression` caveat is derived and fires correctly: `logStart` = 2023-09-12, first derived
    distance record = 2018-01-02, so `logStartsAfterFirstRecord` is true and the page prints the
    warning. The nine derived distance records (1,025 m in Jan 2018 through 5,000 m on 2025-07-07) and
    the claim that Samsung's own type-3 log understates them (900 m on 2023-09-12 against 4,500 m on
    2023-05-27 in the sessions) both check out.
  - Every other tag and figure I recomputed matched what the code would print: 353 SWOLF sessions,
    113 in the last twelve months, agreement 55 sessions / 38 within 1.0 / avg 1.73 / max 21.1;
    298 weight-paced swims with gaps of 0 to 30 days; 89.2% freestyle of 19,327 lengths; 19,327 rows
    across 364 sessions with 70 excluded and 111 sessions carrying no lengths; 2,265 rows with a rest
    reading; 25 gaps of 14 days or more, 3 past 90 days, longest 698; 4 overran sessions; 43% average
    rest over the last 20 swims; 364 sessions carrying a moving pace of 475.
- **A regeneration that could shrink an accumulated artifact.** Nothing under `src/app/swim`,
  `src/lib/swim` or `content/swim` writes a file or a table other than the single append in
  `addSwimBaseline`. `gym_swim_baseline` is insert-only by construction (`db.ts` lines 41 to 46) and
  `getSwimBaseline` reads the newest, which is the documented "a history, not a value" design and it
  holds.

## Severity counts

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 6 |
| P2 | 13 |
| P3 | 4 (grouping 12 items) |

**Single most important: P1-1.** The 1:31 per 100 m that AGENTS.md documents in the past tense, as
the bug the two-column pace split killed, is rendered on `/swim?s=now` today, larger and faster than
the 1:38.71 personal best three blocks above it. The column split was the right fix for the wrong
level of the problem: `moving_pace_per_100m_ms` is one definition now, but a minimum over it still
crosses incomparable efforts, and it still selects the 2025-01-22 session that was 82.3% rest. The
fix that eliminates the class is to compute the best swimming pace over an unbroken PIECE, using the
splitting code `deep.ts` already has, and to assert that the printed figure is never faster than the
100 m personal best.

**Second, and cheaper to fix: P1-2 and P1-3 are one screen apart in his hands.** `/swim?s=how` prints
a retired pace band above the cue that retires it, and instructs him to raise his SWOLF by about 3,
while `/swim/deep` opens with a SWOLF trend telling him he is 3.0 off target. For the next ten weeks
those two pages will disagree about whether following the plan is working.
