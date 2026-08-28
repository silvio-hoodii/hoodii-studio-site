---
audit: /run and /bike, plus /bike/api/ride
date: 2026-08-28
repo: C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site
mode: read-only, adversarial (Law 5). No edits, no build, no server, no writes. One read-only Neon session.
read-first: AGENTS.md (whole file), .agents/ENGINEERING.md, docs/audits/2026-08-26/{04-reading,05-small-apps}.md, docs/GYM-AUDIT-AND-PLAN-2026-08-27.md findings 51 to 55
scope: src/app/run/**, src/app/bike/**, src/lib/bike/db.ts, content/gym/conditioning.json as those two routes read it, the /gym/conditioning 307s in next.config.ts, src/proxy.ts gating for /bike/api, scripts/{probe-gym.js,lint-probe-routes.mjs} coverage of /bike/api. Shared files read and reported on, marked "shared file, coordinate": src/app/training.css, src/components/training/**, src/lib/gym/{session.ts,log.ts,program.ts}, src/lib/{format,day}.ts
data-checked: health_session_detail, health_watch_session, bike_ride, HealthOS/current.json, conditioning.json arithmetic recomputed line by line
severity-key: P0 data loss/leak/cost blowup; P1 lies or broken; P2 cost/debt/drift; P3 polish
head: 5151558
---

# /run and /bike audit, 2026-08-28

Both routes were created on 2026-08-27 (commits `5c83177`, `cda7aae`, `db5ca33`, `9aae4d7`) and have
never been reviewed. `/bike/api/ride` shipped before its page.

**No P0.** Nothing here can lose data: `/run` writes nothing at all, `/bike` writes nothing yet, and
the one write route is gated in both halves of `src/proxy.ts`, stubbed in the probe harness, and has
eight table-level CHECK constraints under it. The cost exposure is real but small (three round trips
on a log page, an 80 KB JSON parse per request) and is P2.

**Five P1s, and four of them are the same shape: a sentence naming a number the store does not
hold.** The hunt asked for pages claiming more than the watch recorded. The pages themselves are
unusually careful about that: `sessionVerdict` refuses to say anything about a bike beyond heart
rate, `RecentSessions` refuses to draw a trend through one point, and `Trace` refuses to draw below
three. The lies are all in `content/gym/conditioning.json`, where a figure is typed rather than
derived, and in two comments that describe a form that does not exist.

---

## /run

### P1

**R1. The Plan tab cites a run on 2026-08-19 twice. There is no run on 2026-08-19. The only session
that date holds is a bike ride.**

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\conditioning.json` line 75
  (`run.howHard.startingSpeed`) and line 215 (`run.whyTheClockNotTheConsole`), both rendered by
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\run\page.tsx` lines 104 and 120.
- Evidence, quoted: line 75 reads `"Set the belt to 8.0 km/h (5.0 mph), then let the talk test move
  it. Not a guess: on 2026-08-19 you averaged 7.8 km/h at mean heart rate 113"`. Line 215 reads
  `"On 2026-08-19 you ran 3,121 m against a 500 m prescription, 3.1 times it, at a speed that was
  fine: 7.8 km/h, mean heart rate 113."` Live Neon, `health_watch_session` for 2026-08-19:
  `cycling 35 min`, `strength 69 min`, `swimming 28 min`, `swimming 8 min`. Zero rows of kind
  `treadmill` or `running`. `health_session_detail` for 2026-08-19: one row, `cycling`.
  The session those figures actually describe is **2026-08-18**: `treadmill, 35 min, 3760.002 m,
  avg_hr 113`. The arithmetic confirms it and is the reason this is a date error and not a fabricated
  session: 3,121 m at 7.8 km/h is 24.0 minutes of running, the remaining 11 minutes of walking at
  about 3.5 km/h covers 639 m, and 3,121 + 639 = 3,760 m, the stored total to the metre. The mean
  heart rate matches exactly. The two sessions are one day and 115 milliseconds of wall-clock apart:
  treadmill `start_time 2026-08-18 12:10:26.797`, cycling `start_time 2026-08-19 12:10:26.682`,
  both 06:10 Calgary, which `content/gym/conditioning.json` line 32 and the `week.$comment` both
  describe as "a 06:10 treadmill run and a 06:10 bike". The run's figures were stamped with the
  bike's date.
- Why it matters in his terms: that date is the entire evidence for the two prescriptions on the tab,
  the 8.0 km/h starting speed and the clock-not-console rule. `/run/log` now renders every session
  the watch recorded, so he can open the second tab and see that there is no run on Aug 19, on a page
  whose selling point is "not a guess". This repo's own precedent is the /swim/deep weight sentence:
  a claim beside the numbers that disprove it, past typecheck, lint and build.
- Fix: change both strings to `2026-08-18`. While in there, `$comment` line 32 carries the same wrong
  date and should move with them. Do not renumber the metres or the speed; they are correct.
- Verify: `select date, kind, minutes, distance_m, avg_hr from health_session_detail where date in
  ('2026-08-18','2026-08-19')`. Every date named in a prose string on this tab must return a row of
  kind `treadmill` or `running`.

**R2. "3,121 m against a 500 m prescription, 3.1 times it" contains a prescription and a multiplier
that cannot both be true.**

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\conditioning.json` line 215,
  rendered at `src\app\run\page.tsx` line 120.
- Evidence: 3,121 / 500 = 6.24. 3,121 / 1,000 = 3.12, which is the "3.1 times" quoted. Week 1 in the
  same file (line 64 onward) is `"6:00 walk 3:45 run 2:24 walk 3:45 run"` with `runKm: 1`, so the
  per-block running dose is 500 m and the per-session dose is 1,000 m. The sentence quotes the block
  figure and the session multiple.
- Why: this is the one sentence on the tab whose job is to make the overshoot legible, and a reader
  checking it finds 6.2x, not 3.1x. He audits arithmetic and he is right to.
- Fix: `"you ran 3,121 m against a 1,000 m prescription, 3.1 times it"`, or keep 500 m and say
  6.2 times per block. Pick the session total: it is what the table's `runKm` column reports.
- Verify: recompute both ratios against `run.weeks[0].runKm` (1) and half of it (0.5); the printed
  multiplier must match the printed prescription.

### P2

**R3. The 170 spm cadence target is passed to two charts and can never be drawn, because his highest
cadence ever recorded is 166.** (shared file, coordinate)

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\SessionCharts.tsx`
  line 45; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\LastSession.tsx`
  line 40; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\RecentSessions.tsx`
  line 59.
- Evidence: the gate is `const floorY = floor != null && floor > min && floor < max ? y(floor) : null;`
  and the caption under it is gated on the same variable (lines 68 to 72:
  `{floorY != null && (<div className="trace-foot">The rule is {floor} {unit}.</div>)}`). Live Neon,
  all five run-family rows in `health_session_detail`: `max_cadence` = 165.768, 166.292, 164.024,
  152.068, 151.271. The highest per-second cadence value in any stored series is 165.3. The
  cross-session trend on `/run?s=now` has points 141.8, 136.9, 101.8, 115.5, 80.1, so `max` is 141.8.
  `floor < max` is false in every case, per session and across sessions. The line never renders and
  the sentence "The rule is 170 spm" has never appeared on this site.
- Why: `sessionVerdict` tells him in prose that "most coaching points at somewhere near 170, and
  raising it is the usual first fix" (`src/lib/gym/session.ts` line 148), and the chart beside that
  sentence withholds the only visual that would show him how far off he is. The floor draws only once
  he straddles it, which is the moment he no longer needs it. This is the "refusing to show something
  it genuinely could" half of the hunt, and it is a two-line fix.
- Fix: in `Trace`, when a `floor` is supplied and falls outside `[min, max]`, extend the drawn range
  to include it (`const lo = Math.min(min, floor)`, `const hi = Math.max(max, floor)`) rather than
  suppressing the rule. Keep the printed range as the data's own min and max so the numbers beside
  the chart stay honest, and keep the `trace-foot` sentence unconditional whenever `floor` is passed.
  Four surfaces draw `Trace` (/run, /bike, /gym, /swim, /health), so coordinate: the lifting chart's
  `floor: 110` DOES fall inside its range today and must not move.
- Verify: after the change, `/run?s=now` renders the horizontal rule above the trace and the words
  "The rule is 170 spm"; `/gym`'s heart-rate trace is unchanged.

**R4. Every number in the eight-week table is typed, and the one input they all depend on is the
number the page tells him to change.**

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\conditioning.json` lines 64 to
  137 (`run.weeks`, three typed numbers per week) and lines 209 to 210 (`beltSettings`), rendered by
  `src\app\run\page.tsx` lines 113 to 118 and 136 to 148.
- Evidence: I recomputed all 24 figures from `session` plus the two belt speeds and every one is
  correct today. Week 1: walk 8:24 at 5.0 km/h = 0.700 km, run 7:30 at 8.0 km/h = 1.000 km, total
  1.700 km, printed `"1.70 km, or 1.06 miles"`; 1.700 / 1.60934 = 1.0563, printed 1.06. Week 5:
  run 10:52 at 8.0 = 1.4489 km, printed `runKm: 1.45`; total 2.1489, printed `"2.15 km, or 1.34
  miles"`. Week 8: 1.9022 and 2.6022, printed 1.9 and `"2.60 km, or 1.62 miles"`. All eight
  `clockTotal` values equal the sum of their four segments. The unit conversions are right in both
  directions: 8.0 km/h = 4.971 mph, printed 5.0; 5.0 km/h = 3.107 mph, printed 3.1.
- Why: line 75 of the same file instructs `"then let the talk test move it... Whatever number it
  settles at is your number"`, and `cuesNote` item (a) says the belt speed "HAS NO SOURCE" and exists
  so he finds his own. The moment he settles on 7.5 or 8.5, all eight `consoleCheck` strings and all
  eight `runKm` values are silently wrong, on the one column the page describes as the after-the-fact
  check. This is the `inProgramme` disease exactly: 24 copies of a fact derived from one input.
  Law 1 says eliminate the class rather than checking it.
- Fix: derive. Add `runSpeedKmh` and `walkSpeedKmh` to `beltSettings`, drop `runKm`, `clockTotal` and
  `consoleCheck` from the JSON, and compute all three in `src/app/run/page.tsx` from the `session`
  string (it is already a machine-readable list of `mm:ss walk|run` segments). The mph figures in
  `beltSettings.run` and `.walk` come from the same two numbers. If parsing the session string is
  judged too clever, the cheaper version of the same fix is a `content/gym/validate.mjs` case that
  recomputes all 24 and fails the build on a disagreement, which turns 24 typed numbers into 24
  gated ones.
- Verify: change `runSpeedKmh` to 7.5 in a scratch copy; every `consoleCheck` on the rendered page
  must move, and no number in the JSON should need editing.

**R5. "Never add more than 10% in a week" sits four lines under a table that adds 11.5% and 10.3%.**

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\conditioning.json` line 138,
  rendered by `src\app\run\page.tsx` lines 152 to 156, immediately below the table at lines 121
  to 151.
- Evidence: the rule reads `"Never add more than 10% in a week, and never add distance and speed in
  the same week."` The `runKm` column is 1, 1.1, 1.2, 1.3, 1.45, 1.6, 1.75, 1.9, which is week over
  week +10.00%, +9.09%, +8.33%, **+11.54%**, **+10.34%**, +9.38%, +8.57%. Weekly totals are three
  times those, so the percentages are identical. Under the other available reading, total session
  distance (1.70 to 2.60 km), every step is between 5.3% and 7.5% and nothing breaks. The rule names
  no quantity, and the quantity the plan's own evidence uses is running distance: `run.why` says
  `"This plan IS the 3 km arm"` and week 1 is exactly 1.0 km times three sessions.
- Why: a rule stated as "Never" and broken twice by the table under it teaches him the rules on this
  page are decoration, which is the meta-law's failure mode. It is also recoverable cheaply, because
  `cuesNote` item 7 in the same file already establishes that the trial itself escalated "~10% per
  week" with weekly totals 3.0, 3.3, about 3.6 and 4.0 km, and 3.6 to 4.0 is +11.1%. The plan is
  faithful to the trial; the rule is stricter than both.
- Fix: two options with the cost of each, for him rather than for an agent. Either (a) restate the
  rule as `"About 10% a week of RUNNING distance, which is what the trial escalated"` and name the
  quantity, which keeps the table, or (b) keep "never" and reprofile weeks 5 and 6 to 1.43 and 1.57,
  which changes the doses the plan copied verbatim from the trial arm and therefore needs his ruling.
  Recommend (a).
- Verify: whichever wording ships, add a `validate.mjs` case that recomputes the week-over-week
  change in `runKm` and fails if any step exceeds the percentage the rule string states.

**R6. AGENTS.md calls it a ten-week build. The data holds eight weeks.**

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\AGENTS.md` line 81 (`/run` row: "the
  ten-week walk-to-run build") and the `/run` metadata at
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\run\layout.tsx` line 19
  (`'My running: the ten-week walk-to-run build...'`).
- Evidence: `content/gym/conditioning.json` `run.weeks` has 8 entries (weeks 1 to 8, the last carrying
  `"Reassess here before deciding whether to keep climbing or hold."`). The page derives the count and
  is correct: `src/app/run/page.tsx` line 79 renders `over {c.run.weeks.length} weeks`, with a comment
  at lines 74 to 77 recording that this line once said "a {n}-week build" and printed "a 8-week
  build". `/swim`'s plan is a ten-week ladder (AGENTS.md line 88), which is the likeliest source of
  the number.
- Why: same class as 04-reading's P2-2. A binding doc that describes the data as it is not is
  instructions for a regression, and here the regression would be an agent "restoring" two weeks.
  The `<meta name="description">` is the shipped, indexable half of the same error, on a `noindex`
  page so nobody will ever be told.
- Fix: AGENTS.md line 81 to "the eight-week walk-to-run build"; `layout.tsx` line 19 the same. Better
  than both: drop the count from the description entirely, since it is the one number on that line
  that can go stale and the page already derives it.
- Verify: `node -e "console.log(require('./content/gym/conditioning.json').run.weeks.length)"` must
  agree with every prose mention of the plan's length in the repo.

**R7. 104.9 kg is typed into four strings this route renders, and HealthOS says 103.7 kg.**
(also renders on /bike, see B7)

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\conditioning.json` lines 156,
  192, 201 (three `run.cues[].why` fields) and 203 (a `grounding`), plus line 207 (`run.cuesNote`),
  all rendered by `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\Cues.tsx`
  lines 54 to 78 on `/run?s=how`.
- Evidence, quoted from line 192: `"would have removed every way of aborting safely from a moving
  belt at 104.9 kg"`. `C:\Users\sneyr\Desktop\HOODII\HealthOS\current.json`, generated 2026-08-28
  13:15Z from a 2026-08-24 measurement: `"weight_kg": 103.7`, `"stale": false`. The typed figure is
  1.2 kg out four days after a fresh measurement, and the 30-day trend in the same file is -3.3 kg,
  so it will be several kg out within a month.
- Why: `HOODII/CLAUDE.md`'s body-metrics rule is unambiguous ("Read that file. Never restate a figure
  anywhere else... Every copy is a number that goes stale silently, which already produced one
  cross-agent discrepancy"). Two of these four occurrences are load-bearing in a safety argument
  about what his mass can absorb, so a stale number is not cosmetic here.
- Fix: this is the case where the copy cannot simply be deleted, because a cue's `why` is prose he
  reads at the treadmill and `Cues` does not interpolate. The cheapest honest version is to drop the
  figure and keep the fact: "at his body mass", "at a mass above the trial's heavier half". Where a
  number genuinely earns its place (line 201 compares him to the trial's 78.2 kg median), have the
  page interpolate it: read `HealthOS/current.json` in the mirror the way the health sync already
  does, and let `Cues` substitute a `{weightKg}` token. Given the volume of prose involved, put the
  option set to him rather than rewriting six sentences.
- Verify: `grep -n "104\.9" content/gym/conditioning.json` returns nothing, or returns only lines
  whose number is interpolated. Add the literal to `scripts/lint-prose.mjs`'s vocabulary if a token
  is chosen, so the next hardcoded weight fails the build.

**R8. `sessionVerdict` says "Cadence is measured on the treadmill" about an outdoor run, which is the
row it is rendering today.** (shared file, coordinate)

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\session.ts` lines 147 to 149.
- Evidence, quoted: `if ((s.kind === 'treadmill' || s.kind === 'running') && s.avgCadence) { return
  \`${Math.round(s.avgCadence)} steps a minute average. Cadence is measured on the treadmill, so this
  is real...\` }`. Live Neon: the newest run-family row in `health_session_detail` is
  `2026-08-24, kind 'running', avg_cadence 141.788`. `/run?s=now` therefore renders "142 steps a
  minute average. Cadence is measured on the treadmill, so this is real" about a session the watch
  filed as an outdoor run. The same mixing is in the trend caption: `RecentSessions.tsx` line 60 says
  "cadence is genuinely measured on a treadmill rather than estimated" under a five-point line whose
  newest point is that outdoor run.
- Why: AGENTS.md's audited table (line 398) credits cadence to Treadmill specifically, and the whole
  point of the sentence is to tell him which numbers on this site are measured rather than inferred.
  A sentence that names the wrong instrument is the "matcher that cannot say why it matched" problem
  from Law 3: it reports the conclusion, not the evidence.
- Fix: branch on the kind. Treadmill keeps the sentence as written; `running` gets "Cadence comes from
  the watch's own step counter, which is measured either way, indoors or out." Coordinate: this
  function serves /gym, /swim, /health and both log routes.
- Verify: `/run?s=now` while the newest row is `kind='running'` must not contain the word "treadmill".

**R9. WITHDRAWN, mostly. The "3 runs" figure is CORRECT and must not be changed.**

> Corrected 2026-08-28 by the orchestrator before execution, by re-running the query split by kind.
> `health_watch_session` holds exactly **3 sessions of kind `running`** in 2025 (2025-01-14,
> 2025-06-23, 2025-08-15), which is precisely what the sentence claims. The 64 below counts
> `treadmill` as well, and those 61 sessions average **48 minutes**, which is the walking the same
> sentence credits him with in its very next clause: "65 minutes of walking a day averaged over 60
> days". Acting on this finding would have replaced a true statement with a false one, on the premise
> the entire ten-week build rests on.
>
> ONE PART SURVIVES: the last of the three is **2025-08-15**, not the 16th, and `date` on that table
> is LOCAL, so the 16th is a UTC reading of a local row. That is the four-swim-date class again. Fixed,
> along with a clause naming which kind is being counted so the next reader does not repeat this.
>
> The lesson is the report's own: a count over a set whose members answer different questions is not
> a count. That is theme T3 in the index, and this finding is an instance of it rather than an
> instance of what it claims.

**R9 as originally filed: `run.startedFrom` says three runs in 2025. The watch holds 64.** (not rendered today)

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\conditioning.json` line 63.
- Evidence, quoted: `"Effectively zero. 3 runs in all of 2025, the last on 2025-08-16."` Live Neon:
  `select count(*), count(distinct date), max(date) from health_watch_session where kind in
  ('treadmill','running') and date between '2025-01-01' and '2025-12-31'` returns **64 sessions on 53
  distinct dates, last 2025-12-29**. There is no session on 2025-08-16 at all; the nearest is
  2025-08-15 (`running, 30 min`), and two later ones exist (2025-11-03, 2025-12-29).
- Why: nothing renders `startedFrom` today (`src/app/run/page.tsx` reads `surface`,
  `sessionsPerWeek`, `weeks`, `why`, `howHard`, `beltSettings`, `whyTheClockNotTheConsole`, `rules`,
  `cues`, `cuesNote`, and not this field), which is the only reason this is P2 and not P1. It is the
  stated premise of the whole plan ("Effectively zero"), it is false by a factor of 21, and it is one
  `<Prose>` call away from being on his screen. Same shape as finding 54 on /bike and as the
  half-extracted-export class: a true statement about a shallow source read as a fact about his life.
- Fix: rewrite from the watch table, naming the source: "64 sessions the watch filed as running or
  treadmill in 2025, 53 separate days, the last on 2025-12-29, and almost all of them short. The
  engine is there." Or delete the field, since nothing reads it. Do not leave it as written.
- Verify: every dated claim about his history in this file resolves to a row in
  `health_watch_session`. Two do not today (this and R1).

### P3

**R10. "back to 2019" is typed on /run while /run/log derives the same span one tap away.**
`src\app\run\page.tsx` lines 87 to 90 render `<Link href="/run/log">Every session the watch
recorded</Link>, treadmill and outdoors, back to 2019.` while
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\run\log\page.tsx` line 50 prints
`{span.first}` from `watchLogSpan()`. Live value: 2019-09-05, so the typed year is right today and
goes stale the moment an older export lands. Drop the clause or pass the span down.

**R11. `SessionLog` keys its rows on the date, and 42 of the 318 rows on /run/log share a date with
another row.** `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\SessionLog.tsx`
line 104: `<div className="log-row" key={r.date} role="row">`. Live Neon: 318 run-family rows across
276 distinct dates, including 2024-02-18 with three. React duplicate keys, and no stable identity for
a row. `getWatchLog` selects no session identifier, so the fix is in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\log.ts` line 243: add
`w.start_time` to the select and key on it (it is already in the `order by`). Worse on /bike/log, see
B8. Shared file, coordinate.

**R12. The Now tab draws ten where the ruling was five, and it happens to coincide.**
`src\app\run\page.tsx` line 63 passes `10` to `getRecentSessions`; Decision 7 in
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\docs\GYM-AUDIT-AND-PLAN-2026-08-27.md` line 583
records his ruling as "Recent 5 on the Now tab of each surface". /run renders 5 only because
`health_session_detail` holds exactly 5 run-family rows; /gym and /swim render 10. Either the ruling
moved and the doc did not, or the limit did. Worth one line of confirmation before the sixth session
lands and /run silently starts showing six.

**R13. The lede says "Treadmill" over a card drawn from an outdoor run.** `src\app\run\page.tsx` line
79 renders `{c.run.surface}` = "Treadmill" three lines above a `LastSession` card for the 2026-08-24
`running` row, and the card's heading is just "Your last session (Aug 24)". `RecentSessions` shows a
`Kind` column on /run/log but not on the Now tab. One word in the card's tag would settle it.

---

## /bike

### P1

**B1. "Your highest recorded swim heart rate is 175" is false. It is 201, and 23 swims exceed 175.
Every heart-rate number on this route, including the stop rule, is anchored on the wrong figure.**

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\conditioning.json` line 242
  (`bike.howHard.heartRate`, rendered on `/bike?s=plan` by
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\bike\page.tsx` line 104), line 271
  (cue 3's `cue`), line 273 (cue 3's `why`), line 307 (cue 7's `cue`, the stop rule) and line 315
  (`cuesNote` item 5), the last four rendered on `/bike?s=how` by `Cues.tsx`.
- Evidence, quoted. Line 242: `"Aim to finish each hard piece somewhere around 150 to 165. Your
  highest recorded swim heart rate is 175, so that band is derived from what your watch has actually
  seen, not from a formula."` Line 271: `"The published protocol asks for 60 to 70 percent of peak
  heart rate in the warm-up and 50 to 70 percent in the recoveries; applied to 175 that gives those
  two bands."` Line 307: `"(4) HEART RATE ABOVE 175, higher than anything you have ever recorded"`.
  Line 273: `"175 is just the highest number his watch has happened to record in submaximal
  training"`.
  Live Neon, `select max(max_hr) from health_session_detail where kind='swimming'` returns **201**
  (2026-05-22). `select count(*) ... and max_hr > 175` returns **23** of 60 swims. The distribution
  above 175 is 201, 190, 186, 185 x5, 184 x3, 183, 182 x2, 181 x3, 180 x2, 179, 178 x2, 176, and six
  swims tie at exactly 175, which is probably where the number came from: 175 is a mode, not a max.
  There is no table in which 175 is the maximum: `health_watch_session` has no `max_hr` column at all
  (columns: date, start_time, kind, minutes, calories, avg_hr), so `health_session_detail` is the
  only source and its answer is 201.
- Why it matters in his terms, and this is the one finding with a cost attached rather than only a
  credibility cost. Three consequences, in increasing order of seriousness. (1) The claim "derived
  from what your watch has actually seen" is false in the one number it names, on the tab that sells
  the whole plan as evidence-based. (2) The warm-up and recovery bands are wrong: 60 to 70% and 50 to
  70% of 201 are 121 to 141 and 101 to 141, not the printed 105 to 123 and 88 to 123, so cue 3's test
  will have him adding resistance he does not need. The `why` at line 273 says the bands are
  "probably slightly low"; the real gap is 16 to 18 bpm. (3) **The stop rule at line 307 tells him to
  abort an interval at a heart rate he has exceeded on 23 of his last 60 swims, under a sentence
  asserting he has never recorded it.** A stop rule that fires routinely is a stop rule he learns to
  ignore, and this is the only stop rule anywhere in the plan.
- Fix, and it must be derived rather than retyped, or the same thing happens next month. Compute the
  anchor: `select max(max_hr) from health_session_detail` and print it with its date and its kind.
  Then decide the anchor's definition with him, because a wrist PPG reading of 201 taken in a pool is
  exactly the artifact-prone case and 201 may not be a number to prescribe from. Concretely: expose
  `peakHrSeen` and `peakHrSeenOn` from `src/lib/gym/session.ts`, interpolate them into the three
  strings, and put one judgment call to him: does the anchor use the single highest reading (201), or
  the highest excluding swimming, where the wrist sensor is least trustworthy (179, an `other-auto`
  session; 168 on lifting)? The stop rule should then be "above your highest recorded, {n}", derived,
  so it can never again name a number he has beaten.
- Verify: `select max(max_hr) as peak, count(*) filter (where max_hr > <printed>) as over from
  health_session_detail` must return `over = 0` for whatever number the stop rule prints.

**B2. /bike/log tells him to use a form that does not exist, and /bike tells him it does not exist.**

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\bike\log\page.tsx` lines 65 to 70
  (rendered) and 28 to 31 (comment), against
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\bike\page.tsx` lines 72 to 75 (rendered)
  and 17 to 19 (comment).
- Evidence, quoted. /bike/log renders: `"Nothing yet. The resistance form on the bike page writes the
  one thing the watch cannot see, and it has not been used."` Its comment says `"bike_ride has zero
  rows: the typed resistance form shipped 2026-08-27 and has never been used."` /bike renders:
  `"Which is why the resistance levels get typed instead. Somewhere to type them is the next thing to
  land here."` Its comment says `"NOTHING ON THIS PAGE WRITES A RIDE YET... The form is Phase D."`
  `grep -rn "bike/api" src/` returns the route, the proxy, the two linters and four comments, and
  **zero callers**. `bike_ride` holds 0 rows, confirmed live. The form does not exist. What shipped is
  `POST /bike/api/ride`.
- Why: this is the asymmetry the brief names, on the direction that is worse. A false "you lack this"
  costs him a look; a false "you have this" sends him to /bike hunting for a form, and the sentence is
  on the page whose entire job is to correct a false claim made by the other page. Two sibling routes
  disagreeing about whether a feature exists is also how `/reading/about` came to describe a page that
  had been retired five days earlier (04-reading P1-2).
- Fix: /bike/log lines 66 to 70 to say what is true: "Nothing yet, and there is nowhere to put it. The
  write path exists (`POST /bike/api/ride`) and the form that would use it has not been built, so the
  rows above are the whole record and none of them knows how hard you were pedalling." Correct the
  comment at lines 28 to 31 in the same edit, and finding 52 in
  `docs\GYM-AUDIT-AND-PLAN-2026-08-27.md` line 575, which carries the same wrong claim and is where
  the sentence came from.
- Verify: `grep -rn "resistance form" src/` returns nothing that asserts a form exists while
  `grep -rln "bike/api/ride" src/app/bike --include=*.tsx` returns no page or client component.

**B3. The Now tab still tells him he has ridden once. The watch holds 76 rides.** (shared component,
coordinate)

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\components\training\RecentSessions.tsx`
  lines 114 to 125; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\bike\page.tsx` lines 51
  and 76.
- Evidence, quoted from the component: `if (sessions.length <= 1) { ... 'Nothing. This is the only one
  the watch has ever recorded, so there is no trend to draw yet. The second one is what makes this
  block worth having.'`. Live Neon: `health_session_detail` holds 1 cycling row (2026-08-19);
  `health_watch_session` holds **76 cycling rows across 55 distinct dates, back to 2021-09-05**.
  Already filed as finding 54 (`docs\GYM-AUDIT-AND-PLAN-2026-08-27.md` line 706) and named in the
  page's own comment at lines 77 to 80: `"THE BLOCK ABOVE SAYS 'the only one the watch has ever
  recorded' AND THAT IS FALSE."` The mitigation shipped instead is the link below it (lines 81 to 84,
  `"There are more than the block above can see."`).
- Why: reported here rather than treated as closed because it is live, it is a sentence in his own
  terms about his own life, and the mitigation is a correction placed *after* the false claim, which
  is the pattern that failed on 2026-08-05 ("the five-second test was written into the reply
  underneath the prescription"). The page is accurate about its source and wrong about him, which the
  log page's own header calls "the worst combination available".
- Fix: the honest states rule gives the shape. The claim the component can support is about its
  source, not about his history, so it should not make a claim about his history: `'Nothing here yet.
  This block reads the per-second detail, which holds one cycling session; the watch itself holds
  more.'` The stronger fix, and the one finding 54 says needs a ruling because the component serves
  five surfaces: give `RecentSessions` an optional `totalKnown` prop that the caller fills from
  `countWatchLog(['cycling'])`, and let the sentence name the real number and link to the log. That is
  a fourth Neon round trip on the Now tab, which is the cost to state when putting it to him.
- Verify: `/bike?s=now` must contain no sentence asserting a count of his sessions that
  `select count(*) from health_watch_session where kind='cycling'` contradicts.

### P2

**B4. The bike's own rule describes a fortnight holding five cardio mornings. The same file
prescribes eight.**

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\conditioning.json` line 246,
  rendered by `src\app\bike\page.tsx` lines 108 to 112.
- Evidence, quoted: `"Same morning slot as the run, alternating: run, bike, run, run, bike across a
  fortnight."` That is 3 runs and 2 bikes, 5 sessions in 14 days. The same file says
  `run.sessionsPerWeek: 3` (line 60 area, rendered on /run as "3x a week") and
  `bike.sessionsPerWeek: 1` (rendered on /bike as "1x a week"), which is 6 runs and 2 bikes, 8
  sessions. `week.assignedDays.morningCardio` is `["monday","tuesday","thursday","friday"]`, four
  cardio mornings a week, eight a fortnight, which agrees with 3 + 1 and not with the rule string.
  Read as a single week instead, the sequence has one bike too many.
- Why: the string is the only place on either route that tells him which mornings are which, and it
  undercounts his running by three sessions a fortnight. Two pages read the same file and print
  numbers that disagree, which is the class the body-metrics and immigration rules exist to stop.
- Fix: derive it. The pattern is already in `week.assignedDays.morningCardio` plus the two
  `sessionsPerWeek` values, so the rule should read "Same morning slot as the run, four mornings a
  week: Monday, Tuesday, Thursday, Friday, with the bike taking one of them." If the alternation
  matters (which day is the bike), that is a judgment call for him and belongs in `assignedDays`, not
  in a prose sentence on one of the two pages it governs.
- Verify: a `validate.mjs` case asserting
  `run.sessionsPerWeek + bike.sessionsPerWeek === week.assignedDays.morningCardio.length`.

**B5. `POST /bike/api/ride` has no body cap, no idempotency, and no caller.**

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\bike\api\ride\route.ts` lines 35
  to 128; `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\bike\db.ts` lines 40 to 49.
- Evidence: `const b = await req.json();` on line 37 parses the whole body before any check, and the
  only bound anywhere is `String(b.note).slice(0, 500)` on line 122, applied after parsing. A 50 MB
  JSON array reaches the parser. `grep -rn "content-length\|byteLength\|MAX_BODY" src/app/*/api`
  returns nothing across the site, so this is a class rather than an instance:
  `src\app\swim\api\baseline\route.ts` line 54 has the identical shape. On idempotency: `bike_ride`
  has no unique index (live: `bike_ride_pkey PRIMARY KEY (id)` on a bigint and eight CHECKs, nothing
  on `date`), and `addBikeRide` is a bare `insert`, so a double tap on the Phase D form writes two
  rides for one session. Nothing reads the table, so nothing would notice.
- Why: the write is cookie-gated so the body cap is a nuisance bound and not a public DoS, which is
  why this is P2. Idempotency is the one worth acting on now: the form does not exist yet, so this is
  the cheap moment, and the swim baseline route deliberately chose "a history not a value" while this
  route's own doc comment calls itself "One bike ride" and then permits several.
- Fix: (a) one shared helper, `readJsonCapped(req, 16 * 1024)`, used by all three write routes, that
  refuses on `content-length` and on the read length, plus a `scripts/lint-auth.mjs`-style check that
  no route handler calls `req.json()` directly. That eliminates the class in the way Law 1 asks for.
  (b) Decide with him whether a second ride on one date is a correction or a second ride. If a
  correction: `create unique index on bike_ride (date)` and `on conflict (date) do update`. If a
  second ride: leave the table and make the form's submit button idempotent, and say so in the file.
- Verify: (a) `curl -X POST` with a 1 MB body returns 413 rather than 400 or 200. (b) two identical
  POSTs against a scratch database produce the agreed number of rows.

**B6. 43 minutes is typed beside the protocol's name on two tabs, and the file's own notes say it
must not be presented as the protocol's.**

- Files: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\content\gym\conditioning.json` line 236
  (`protocol.totalMinutes: 43`) and line 315 (`cuesNote`), rendered by `src\app\bike\page.tsx` lines
  62 to 65 (the Now lede) and 91 (the Plan heading tag).
- Evidence: the Now lede renders `43 minutes of Norwegian 4x4` and the Plan heading renders
  `Bike (1x/week, 43 min)`. `cuesNote` item 4, quoted: `"43 minutes is his structure, not the
  published one. EX-MET's session is 38 minutes because there is no recovery after interval 4.
  Harmless, but the 43 should not be presented as coming from the protocol."` That note is on the How
  tab; the claim is on the other two. The arithmetic is right (10 + 4 x (4 + 3) + 5 = 43, and the
  short version 5 + 3 x (4 + 3) + 5 = 31), and both are typed rather than summed from `structure`.
- Why: a caveat one tab away from the claim it qualifies is the reach failure AGENTS.md's co-build
  section is entirely about. And 43 is a typed sum of a structure string sitting on the line above it,
  which is R4's disease in miniature: change the warm-up to 8 minutes and the total silently lies.
- Fix: derive `totalMinutes` from `structure` (or from an explicit segment list) and drop the typed
  field. Move one clause of the caveat to where the number renders: "43 min, which is his structure,
  not the published 38".
- Verify: sum the segments in `protocol.structure` and assert the rendered total.

**B7. 104.9 kg renders here too.** `content\gym\conditioning.json` line 300 (`bike.cues[5].why`),
rendered on `/bike?s=how`: `"That standing is a bad idea for a 104.9 kg beginner on a gym upright is
my judgement"`. Same evidence and same fix as R7; listed separately so an executor working only on
/bike does not miss it.

### P3

**B8. /bike/log renders 21 rows whose React key collides.** 76 cycling rows across 55 distinct dates,
all of them rendered because `getWatchLog(KINDS, 100)` caps at 100 and `total` is 76. 2024-05-04 holds
8 rows, 2024-04-14 holds 6, 2024-04-23 holds 3. All eight of the 2024-05-04 rows render the identical
date label and identical (null) HR and Easy cells, because
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\log.ts` lines 245 to 252 correlate the
detail subqueries on `d.date = w.date and d.kind = w.kind` rather than per session. That averaging is
harmless today (checked: no date inside the detail window, 2026-04-25 onward, has two run or cycling
rows) but it is the mechanism that will blend two sessions the day it does. Fix with R11: select
`w.start_time`, key on it, and correlate the subqueries on `d.start_time = w.start_time`. Shared file,
coordinate.

**B9. The Now tab presents a 9-day-old ride with no age, and the one before it was 16 months earlier.**
`src\app\bike\page.tsx` lines 62 to 66 render "1x a week" and then `LastSession` for 2026-08-19, dated
but not aged. The previous cycling session in `health_watch_session` is 2025-04-23. So the plan says
weekly and the store shows two rides in 16 months, with nothing on the page connecting the two. Not a
lie (the date is printed and no adherence is claimed) and deliberately not escalated, because /health
owns adherence and the rest rule. Worth one derived clause: "Last ride 9 days ago" would make the gap
visible without importing an adherence chart.

**B10. `.log-watch` puts the flexible column where /bike/log has a number.**
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\training.css` line 161:
`.training .log-watch .log-row { grid-template-columns: 52px 1fr 46px 52px; }` (76px date under
`log-years`, which /bike/log always is). /run/log passes `[Kind, Time, Cadence]` so the `1fr` holds a
word; /bike/log passes `[Time, Avg HR, Easy]` so the `1fr` holds "43m", right-aligned, leaving a gap
between the date and the first number and squeezing "AVG HR" into 46px at 10.5px uppercase mono.
Unmeasured: this audit may not screenshot. Either add a `log-watch-num` variant with the numeric
widths, or give /bike/log a `Kind` column for symmetry with /run/log. Shared file, coordinate. Whoever
fixes it must measure at 390px on the shipped build rather than estimating, per the standing rule.

**B11. `getWatchLog` coalesces a null duration to 0.** `src\lib\gym\log.ts` line 244:
`coalesce(w.minutes, 0)::int as minutes`, and the page's cell (`src\app\bike\log\page.tsx` line 57)
is `r.minutes != null ? \`${r.minutes}m\` : null`, so an unrecorded duration renders as "0m" rather
than the "-" the component reserves for a missing reading, whose own comment (SessionLog.tsx lines
114 to 118) says "0 minutes and no reading are different things and this site has already shipped one
number that read as zero because a field was absent". Zero rows are affected today (checked: no run or
cycling row has a null or zero `minutes`), so this is a live-loaded gun rather than a live defect.
Drop the coalesce; the mapper already handles null. Shared file, coordinate.

**B12. Two stale comments.** `src\proxy.ts` line 117: `/* Same, and /bike has no pages at all yet. */`
(three pages now). `src\lib\bike\db.ts` lines 12 to 16: "NO READ FUNCTION HERE, deliberately... /bike
is Phase C... and nothing renders a ride yet", which is still true of rides but reads as if /bike does
not exist. Both are the kind of comment that made an agent write B2's sentence.

---

## The 307s from /gym/conditioning (shared, both routes)

### Verified, all seven mappings, no loops

`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\next.config.ts` lines 50 to 69. The generator emits
six rules plus the bare fallback, in the order first-match-wins requires:

| Old URL | Rule | Lands on | Verified |
|---|---|---|---|
| `?p=run&s=<x>` | line 51, `has` p=run + s=`(?<s>.*)` | `/run?s=<x>` | yes |
| `?p=run` | line 60, `has` p=run | `/run` | yes |
| `?p=bike&s=<x>` | same, d=bike | `/bike?s=<x>` | yes |
| `?p=bike` | same | `/bike` | yes |
| `?p=swim&s=<x>` | same, d=swim | `/swim?s=<x>` | yes |
| `?p=swim` | same | `/swim` | yes |
| `?p=week`, `?p=anything`, bare | line 69 | `/health` | yes |

- The `has` value is anchored, so `?p=running` cannot match `run`: Next builds
  `new RegExp(\`^${hasItem.value}$\`)` (`node_modules/next/dist/shared/lib/router/utils/prepare-destination.js`
  line 101). The paired-rule comment on lines 43 to 47 is correct: `has` matches only when the key is
  present, so the s-carrying rule cannot serve a bare `?p=run`.
- Sub-tab ids match on all three destinations. `/run` and `/bike` accept `now|plan|how`
  (`src/app/run/page.tsx` line 56, `src/app/bike/page.tsx` line 49), which is the full set the dead
  page offered, and an unknown `s` falls back to `now` rather than rendering empty.
- No chains and no loops on `hoodii.studio`: `/run`, `/bike`, `/swim` and `/health` match no redirect
  source. `/gym/conditioning` no longer exists as a route (`ls src/app/gym` returns
  `GymClient.tsx api layout.tsx log login page.tsx`), and redirects run before routing anyway.

### P3

**S1. One two-hop chain, on the vercel.app host only.** The `/gym/conditioning` rules sit above the
host-matched rule at lines 85 to 90, so `hoodii-studio-site.vercel.app/gym/conditioning?p=run` gets a
307 to `/run` on the vercel.app host, then a 308 to `hoodii.studio/run`. Harmless (two hops, and only
a crawler that indexed the vercel.app copy will ever walk it), and moving the host rule to the top
would fix it at the cost of putting a wildcard above every specific rule in the file. Noted so the
next person to count hops does not think they found something.

---

## Cross-cutting

### P2

**X1. Both routes are `force-dynamic`, and four of their six tab views touch no database at all
while parsing and deep-copying 80 KB of JSON per request.**

- Files: `src\app\run\page.tsx` line 9 and `src\app\bike\page.tsx` line 9
  (`export const dynamic = 'force-dynamic'`), both `log` pages line 6;
  `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\lib\gym\program.ts` lines 21 to 36 and 47
  to 49.
- Evidence. Neon round trips, counted per view: `/run?s=now` 1, `/run?s=plan` 0, `/run?s=how` 0,
  `/bike?s=now` 1, `/bike?s=plan` 0, `/bike?s=how` 0, `/run/log` 3, `/bike/log` 3. The two log pages
  issue `getWatchLog`, `countWatchLog` and `watchLogSpan` under one `Promise.all`
  (`src/app/run/log/page.tsx` lines 35 to 39), and the last two are aggregates over the same table
  with the same filter, so all three collapse into one `sql.transaction` or even one query.
  `getShelfBundle`'s lesson applies verbatim: "A `Promise.all` makes queries concurrent, not free."
  Separately, every one of the six views calls `loadConditioning()`, which reads
  `content/gym/conditioning.json` (**79,911 bytes**, measured), `JSON.parse`s it, and then rebuilds
  the entire object graph recursively through `stripComments`. Uncached, per request, including on the
  two tabs the page's own comment (lines 58 to 60) says have no database dependency.
- Why: AGENTS.md's cost section is explicit that Active CPU and Provisioned Memory are what this
  account pays, that `/` alone was 67% of the whole account's CPU until its `revalidate` was set, and
  that commit `8963763` cached six pages for exactly this reason. The Plan and How tabs are the
  reference material he opens standing at a treadmill: they change when the programme changes, which
  is what ISR is for. Nothing here is a blowup, which is why it is P2 and not P0.
- Fix, in order of value per edit. (1) Memoise the content load: wrap `readJson` in a module-level
  `Map` keyed on the filename, or React's `cache()` at minimum. The file is deployed with the build
  and cannot change under a running instance. (2) Replace `force-dynamic` with `revalidate = 900` on
  `/run` and `/bike`. The only live data is the last session, which arrives once a day from the 07:15
  task, so 15 minutes of lag is not staleness by the same argument AGENTS.md makes for `/reading`.
  (3) Batch the three log queries into one `sql.transaction`.
- Verify: `MSYS_NO_PATHCONV=1 vercel api /v2/observability/query` on
  `vercel.external_api_request.count` grouped by `origin_route` before and after; `/run/log` and
  `/bike/log` should fall from 3 to 1 per hit. Then read the build's route table and confirm the
  symbol for `/run` and `/bike` changed as intended, per the standing rule about checking `f` against
  the circle whenever a rendering mode moves.

**X2. Neither route has a row on the hub, so from the front door they are reachable only through a
sibling.**

- File: `C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\src\app\page.tsx`. `grep -n "Run\|Bike"`
  returns nothing; the training rows are `gymRow()` (line 136), `healthRow()` (line 172) and
  `swimRow()` (line 277), and `STATIC_ROWS` (line 378) is empty.
- Evidence: `TrainingNav` (`src\components\training\TrainingNav.tsx` lines 32 to 38) mounts Lift /
  Swim / Run / Bike / Body in every training layout, so both routes DO have a real entrance, from any
  of the other four. `/` does not name them. `src/app/sitemap.ts` names only `/swim` among the
  training routes, which is correct: both new routes are `noindex` (`run/layout.tsx` line 24,
  `bike/layout.tsx` line 23).
- Why: this is not the 2026-08-16 failure repeated ("There is no way for me to go to conditioning
  other than actually type in the URL") and should not be reported as if it were, because the nav row
  exists and is exactly the fix that incident produced. It is the hub-table drift AGENTS.md's own
  Surfaces note describes: a hand-maintained list of what exists loses to the thing that exists, and
  two of the five training routes created a day ago are absent from the site's index.
- Fix: put it to him rather than adding two rows unasked, because five training rows on a hub of nine
  is a shape decision and `/health` is already the training index by design. The cheap option is one
  row: "Training" or "Run and bike", derived, pointing at `/health`, whose own nav then reaches all
  five. The expensive option is two more derived rows with a last-session date each, which is two more
  Neon round trips on the front door, the page that was 67% of the account's CPU.
- Verify: whichever ships, the hub must not carry a typed count or a typed date; `swimRow()` is the
  pattern.

### 390px, the tap floor, and the chip row: all measurable checks hold

- **Sub-tab chips fit with room.** Three chips (NOW, PLAN, HOW) at 12px mono, `letter-spacing:
  0.07em`, `gap: 18px` (`src\app\training.css` lines 935 to 953). Estimated at about 136px of the
  350px available inside `--pad: 20px`. The 317px-of-390 problem AGENTS.md records is /swim's FIVE
  sub-tabs, and `.subtabs` still has neither wrap nor scroll, so the constraint is unchanged and
  neither of these routes is near it. A fourth sub-tab on either would still be safe; a sixth would
  not.
- **The discipline nav fits too.** Five chips (LIFT, SWIM, RUN, BIKE, BODY) at 11px mono with
  `padding: 8px 12px` and `gap: 6px`, estimated at about 292px of 350, and `.surface-nav` carries
  `flex-wrap: wrap` as the declared safety net (lines 560 to 571).
- **44px tap floor held everywhere on these routes**: `.subtab` (line 942), `.surf-tab` (line 46),
  `details.ladder-all > summary` (line 964). The cue disclosures are `<details>` rows whose whole
  summary is the target.
- **The week table escapes sideways rather than pushing the body**: `.table-scroll { overflow-x:
  auto }` (line 488), three columns not four with the measurement behind that decision recorded in
  `src\app\run\page.tsx` lines 124 to 127, and `.nowrap` on the two belt figures (line 529) so
  "8.0 km/h" cannot break across lines.
- **Cues are collapsed by default** with the measurement recorded (`Cues.tsx` lines 41 to 45: seven
  open took the Run tab to 8,536px, taller than the 6,287px he complained about).
- Not verified, and cannot be from a read-only pass: actual rendered height at 390px, and B10's
  column widths. Anyone touching either must screenshot the shipped build and look, per the rule this
  repo keeps relearning.

---

## What was hunted and NOT found

- **A page claiming a bike metric the watch cannot record.** Hunted hard, since this was the brief's
  test case. Nothing on `/bike` claims rpm, power, resistance or cadence. `sessionVerdict`
  (`src\lib\gym\session.ts` lines 135 to 137) returns exactly one sentence for a cycling session and
  it is a refusal: "Heart rate is the only thing the watch records on the bike. No cadence, no power,
  no resistance, so there is nothing here about whether you rode it well." `RecentSessions.columns()`
  (line 100) gives cycling `[time, hr]` and nothing else, with the reason in a comment. `TREND` (line
  48) has no `cycling` key at all, so no trend is offered rather than one being drawn through one
  point. `/bike/log` prints "On a bike the watch stores a heart rate and nothing else: no cadence, no
  power, no resistance". Four independent places, all honest. The lies on this route are about heart
  rate (B1) and about a form (B2), not about what the bike records.
- **A trend drawn from one or two points.** `Trace` returns `null` below three values
  (`SessionCharts.tsx` line 37), and `RecentSessions` gates the whole trend block on
  `points.length >= 3` with the reasoning written next to it (lines 157 to 159: "a two-point trend
  would be a straight line between two numbers pretending to be one"). Counted against live data:
  cycling n=1 takes the no-trend branch, running n=5 draws with a caption naming n. The near-flat
  guard (lines 144 to 149) fires below 8% spread; running's spread is 53.5%, so it correctly stays
  quiet. The one-point branch's SENTENCE is wrong (B3), but no trend is drawn.
- **A mixed-definition aggregate**, the 1:31-per-100m class. Neither route computes a minimum or a
  best of anything. The two-paces separation is preserved in the shared components and only fires for
  swimming.
- **A timezone or day-boundary fault, and this took real checking given four prior incidents.**
  `bike/api/ride` uses `today()` from `src\lib\day.ts`, which is `America/Edmonton` (route line 46,
  with the reason at lines 39 to 41). `shortDate` and `logDate` both parse as `T12:00:00Z` and format
  with `timeZone: 'UTC'` (`src\lib\format.ts` lines 52 to 71), so no date can shift by a day in the
  formatter. The tables these routes join are both on the LOCAL clock per AGENTS.md, and I verified it
  rather than trusting the doc: the 2026-06-30 treadmill session has `date 2026-06-30` in
  `health_watch_session` and `2026-06-30` in `health_session_detail` against a UTC
  `start_time 2026-07-01 02:01`, so the two columns agree and the `d.date = w.date` join in
  `getWatchLog` is sound. Neither route touches `health_swim_session` or `health_swim_length`, the
  two UTC tables. Held.
- **`/bike/api/ride`'s gating, in both halves.** `src\proxy.ts` line 86 carries the
  `pathname.startsWith('/bike/api')` prefix AND line 118 carries `'/bike/api/:path*'` in
  `config.matcher`, which is the pair the 2026-08-27 demonstration was about. It is in `WRITE_ROUTES`
  in `scripts\probe-gym.js` line 66 and `/bike/api` is an `API_ROOTS` entry in
  `scripts\lint-probe-routes.mjs` line 33, so a second POST route under it fails the build unstubbed.
  Input validation covers all five fields with named refusals: date shape, future date, a 2018 floor,
  integer minutes 1 to 300, resistance as a non-empty array of at most 8, each entry an integer 1 to
  20 with the offending index and value quoted back, optional effort 1 to 10 with absent staying
  absent, note truncated. Eight CHECK constraints in Postgres back the same bounds independently
  (verified live: `bike_ride_levels_scale`, `bike_ride_levels_count`, `bike_ride_levels_filled`,
  `bike_ride_levels_flat`, `bike_ride_minutes_sane`, `bike_ride_effort_scale`, plus the NOT NULLs),
  so a bug in the route cannot write a shape the table would reject. The gaps are the body cap, the
  idempotency and the absent caller (B5, B2).
- **A restated body metric other than the weight.** No protein target, no lean mass, no body fat on
  either route. Only `104.9 kg` (R7, B7).
- **An unsourced or overclaimed citation.** Not the object of this audit, but sampled while reading:
  every cue on both routes carries a `confidence` field that renders, `grounding` says "CONVENTION"
  where there is no study, and the `cuesNote` blocks on both disciplines list what was dropped and
  why, including two cases where fetching the paper reversed the draft's claim. `/bike`'s notes
  correctly refuse to convert Acala's percent-of-peak-power into resistance levels. This is the
  strongest material on either route.
- **An em dash, en dash or invisible character in anything these routes render.** `lint-prose.mjs`
  covers `src`, `content` and `scripts`, and the one known data-side em dash risk (sixteen historical
  `day_title` strings, four with U+2014) is handled by deriving the label rather than printing the
  stored string, documented at `src\lib\gym\log.ts` lines 144 to 150. Neither of these routes reads
  `day_title`.

---

## Severity counts

| Route | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| /run | 0 | 2 | 7 | 4 |
| /bike | 0 | 3 | 4 | 5 |
| The 307s | 0 | 0 | 0 | 1 |
| Cross-cutting | 0 | 0 | 2 | 0 |
| **Total** | **0** | **5** | **13** | **10** |

Findings marked "shared file, coordinate": R3, R8, R11, B3, B8, B10, B11.

## The one sentence for whoever picks this up

Four of the five P1s are a number typed into `content/gym/conditioning.json` that the store
contradicts (a date, a multiplier, a peak heart rate, a session count), and the fifth is a comment
that grew into a rendered sentence about a form nobody built. The pages themselves refuse to
overclaim; the JSON they read does not, because a typed figure has no gate on it. If only one thing
gets built from this report, build the gate: a `content/gym/validate.mjs` pass that recomputes the
week table from the belt speeds, sums the protocol's structure, and asserts that every date and every
"highest recorded" figure in a prose string resolves against Neon. That is R2, R4, R5, R6, R9, B1,
B4 and B6 in one mechanism, and it is the only reason to believe the next number typed into that file
will be true.
