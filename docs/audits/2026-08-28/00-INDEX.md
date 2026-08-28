# The five training routes, master index

Date: 2026-08-28. Audited at HEAD `5151558`. **1 P0 and 14 of 24 P1s are fixed and live as of `d690267`**, listed below; the batch order after that covers what is left.

Four adversarial read-only agents, one route each, plus orchestrator verification of every load-bearing
number against live Neon before anything was changed. **Every report is written for executor agents:**
absolute paths, quoted evidence, an exact fix, a verification step.

## Why these five, when 2026-08-26 already audited the site

The 2026-08-26 round covered eight surfaces and **excluded /swim by name** because another agent owned
it. /run and /bike **did not exist**: both were created on 2026-08-27 when /gym/conditioning was
deleted. /health was covered only as one of four "small apps" and became **the training index** on
2026-08-27, gaining four sub-tabs nothing had reviewed. And /gym was audited BEFORE the 2026-08-27
rebuild that deleted a route, renamed the stylesheet, dropped a column and shipped five gates.

So: one surface never audited, two audited before they existed, one audited as a third of a report,
and one audited against code that has since changed underneath it.

## The reports

| Report | Scope | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| `09-health.md` | `/health` and its four sub-tabs, `src/lib/health/**` | 0 | 4 | 8 | 5 |
| `10-gym.md` | `/gym`, six write APIs, `content/gym/**`, seven scripts | 1 | 9 | 14 | 9 |
| `11-swim.md` | `/swim` (five sub-tabs), `/swim/deep`, `/swim/api/baseline` | 0 | 6 | 13 | 4 (12 items) |
| `12-run-bike.md` | `/run`, `/bike`, `/bike/api/ride`, the seven 307s | 0 | 5 | 13 | 10 |

**1 P0 and 24 P1 as filed.** One of the 24 was withdrawn on verification and is marked in its own report. See the next section for what is closed.

## Already done, verified live on hoodii.studio

Not queued. Fixed, gated, pushed, and read back off the real domain. **1 P0 and 14 of the 24 P1s.**

| Report | Closed | Left |
|---|---|---|
| `09-health.md` | P1-1, P1-2, P1-3 | P1-4 |
| `10-gym.md` | **P0-1**, P1-1, P1-3, P1-4, P1-5, P1-8, part of P1-6 | P1-2, P1-7, P1-9, rest of P1-6 |
| `11-swim.md` | P1-1 | P1-2 to P1-6 |
| `12-run-bike.md` | R1, R2, B1, B2, B3, R9 (withdrawn) | none at P1 |

**The P0.** The off-plan capture box overwrote a set it had already written. The index came from React
state the hydrate effect never refills, so a reload restarted it at 1 and the upsert replaced the
earlier set; it could also land on a PRESCRIBED set, because the box's own datalist offers exercises
prescribed that same day. The server derives the index inside the insert now. Proven on a scratch
date: three appends across simulated reloads gave 1, 2, 3 where the old code gave one row.

**The calf raise, on his ruling.** "I swapped to machine calf raise, so it was not DB calf raise."
The alt was an ALIAS of the slot's own variant, so choosing it wrote a second exercise_id and split
the history: twelve bodyweight sets under one name, three at 180 to 210 lb under the other, and the
card read the first and offered 5 lb. Every history read resolves aliases now, in the app AND in
check-ladder, which is the fourth reader of that table. A validator rule found SIX more alias-alts;
four are their own variants now.

**The stop rule that fired on a normal swim.** "Above 175, higher than anything you have ever
recorded", against a real maximum of 201 that 23 of his last 60 swims beat. Derived now, both
directions gated. He ruled that the prescribed bands stay where they are.

**Three progression defects**, all wrong numbers on cards: 5 box jumps suggested after he did 10 (and
written into his log), a deload to 105 triggered by two single-set days, and the assisted pull-up
gaining assistance while its own cue said that number should go down. `progression.test.ts`, 8 cases,
three of which exist to catch those fixes overshooting.

**Seven of thirteen partner cards said nothing**, because the gate accepts an `open` question that
rendered nowhere. A gate that accepts an invisible alternative cannot measure reach. Now checked on
the SCREEN by `everyPartnerShowsAReason`, watched failing on the unfixed build first.

**/swim's 1:31 per 100 m**, faster than a 1:38.71 PB three blocks above it, off a 26-minute session
with five minutes of swimming in it. **/health's 119%** of a weight change attributed to fat.
**Three training days drawn as rest** on the attendance strip. **A run cited on a day he did not
run.** The 44px tap floor, 79 findings, now measured by `scripts/probe-taps.mjs`.

**R9 was WITHDRAWN after verification**, and the report says so where the finding is. It claimed "3
runs in 2025" was false by a factor of 21; split by kind, `running` holds exactly three and the other
61 are treadmill sessions averaging 48 minutes, which is the walking the same sentence already
credits. Acting on it would have replaced a true statement with a false one. **Re-verify a finding
before executing it: this report is not exempt from its own theme T3.**

## Deduplicated cross-report themes

**T1. ONE STORY TOLD NINE WAYS: the 2026-08-27 placement gate reads a single field.**
Source: 10-gym P1-1 through P1-9. **This is the most important thing in all four reports.**
Six slot ids were rewritten so partners sat at the right fixture. The gate compares `station` and
nothing else, so it went green while the NAME, the CUE, the `why`, four parked questions and the logged
HISTORY all stayed pointed at the old implement. The live consequence: the calf raise card offers
**5 lb** for a machine he has logged at **210 lb**, because the slot's history lives under a different
id. Seven slots say "First time" with 08-25 history orphaned. Seven cards carry a cue for the wrong
implement. A gate that checks one field of a six-field identity is a gate that certifies a rename.
Fix the class: the placement gate must compare every field that names an implement, and an id rewrite
must carry its history or refuse.

**T2. A NUMBER TYPED WHERE IT COULD BE DERIVED, in every report.**
Sources: 12-run-bike B1 (done) R7 B7, 10-gym P3-9, 11-swim P3 grouping, 09-health P2-2 P2-8.
`104.9 kg` in five rendered strings against a live 103.7, which is the body-metrics rule in
HOODII/CLAUDE.md violated in prose. "24 checks" against 25. "698/544" against 545. "every series
begins 2023-09-12" against a 1500 m series starting 09-27. AGENTS.md's own "Three sub-tabs" over a list
of four, and "all 8 body-composition columns" when 7 are drawn. Every one of these was true when
written. **The fix is never to correct the number**; it is to derive it or delete the sentence.

**T3. A MINIMUM OR AN AGGREGATE OVER INCOMPARABLE THINGS.**
Sources: 11-swim P1-1 (done) P2-3 P2-4 P2-9, 09-health P1-1 P2-3.
The class: an extremum over a set whose members answer different questions always selects the
flattering member, and it reads as a fact. The swim pace was the shipped instance. /health's
`fatShare` is the live one: it prints **119 percent** over the exact 34-day window the same tab
already displays, and would print 233 percent on windows in his own history. And the split's two
endpoints can come from two instruments whose fat-mass readings disagree by up to **2.45 kg** while
their weights agree to 17 grams.

**T4. A PROSE SENTENCE THE NUMBERS BESIDE IT DISPROVE.**
Sources: 09-health P1-2 P1-3, 11-swim P1-3 P1-4 P1-6, 12-run-bike R1 R2 R5 R8 R9 B3 B4.
This repo shipped one on /swim/deep and wrote the lesson down. It is still the largest single class.
The sharpest: /health says "fat mass plus lean mass equals weight exactly, so this is arithmetic
rather than a model", and `fat_kg` is `kg * bf_pct/100` on 196 of 197 rows while `lean_kg` is
`kg - fat_kg` on 197 of 197. One measurement restated twice. The caveat five lines below already says
both lines are inferred. /run cites a run on a date with **no run on it**. /bike says 76 rides is one.

**T5. THE STRIP THAT SAYS REST FOR A DAY HE TRAINED.**
Source: 09-health P1-3, and it deserves its own theme because it is the honesty defect this site was
rebuilt around. The attendance strip queries `kind = 'strength'` under a caption saying the watch
"records every session" and a lede naming four disciplines. Live: 17 strength days against 20
any-kind days in 30. Three real training days render as empty cells with `aria-label` "rest": a
59-minute swim, a 40-minute run, a 43-minute swim. **"What actually happened", on the same tab, shows
those days as trained.**

**T6. A GATE THAT CHECKS LESS THAN IT CLAIMS.**
Sources: 10-gym P2-9 P2-8, 11-swim P1-5, and the `{PEAK_*}` gate shipped today.
The placement gate's zone clause has never been watched failing. `probe-gym.js` is in no automated
chain and the three newest features are untested by it. `plan.json`'s seven in-water cues bypass
`checkGroundedCues` entirely, and one is labelled `evidence` with no quote, which the validator
refuses everywhere else. And the placeholder gate added today was **dead code on its first draft**,
appended after `process.exit()`, caught only because both mutations were planted and neither fired.

**T7. UN-BATCHED NEON ROUND TRIPS, now counted rather than estimated.**
Sources: 10-gym P2-1, 11-swim P2-1 P2-2, 09-health P2-1, 12-run-bike X1.
`/gym` page open is **52 to 76** round trips (03-gym's "~150" was wrong and is corrected).
`/swim/deep` is 12 with ~16 scans of a 19,327-row table per hit, force-dynamic, on daily data.
`/health` is 9 on the Now tab, including two byte-identical queries issued twice. No `sql.transaction`
exists anywhere in `src/lib/swim`, and `getDeepSwim`'s own docstring calls its eleven queries "one
round". Neon is this account's entire External API Requests bill.

**T8. DEVELOPER PROSE ON HIS PHONE.**
Sources: 11-swim P2-11 P3, 10-gym P2-12, 09-health P3-3.
`cuesNote` ships **11,309 bytes, 1,779 words** of developer notes to a phone. A self-retraction, a
diff note reading "3 to 4, unchanged", and the literal word "DORMANT:" render. Note #12 in his own
words: *"Walls of text again why do I need all this, just leave the cue and thats it."*

**T9. THE FIFTH DATE COLUMN, and the comment that caused the first four.**
Sources: 11-swim P2-6, 09-health P2-6, 10-gym P2-11.
`health_swim_pb.achieved_on` is a fifth date column rendered on two pages and missing from AGENTS.md's
zone table. Measured safe today (29 of 32 local against 21 raw), which is luck rather than design. And
`src/lib/health/db.ts` line 17 **still carries the exact sentence AGENTS.md blames for the
four-swim-date incident**, unqualified, above an exported handle that reaches both UTC tables.

**T10. HONEST STATES, violated in the direction that costs a journey.**
Sources: 12-run-bike B2 B3, 11-swim P2-13 P1-6, 09-health P1-4.
`/bike/log` sends him to a form that does not exist while `/bike` says it does not exist. The Now tab
calls the buoy question open in two places while the Plan tab renders the answer. "Your last session"
on the training index is the last LIFT: his actual last session was a swim 90 minutes later.

## Execution order, for what is LEFT

Everything in "Already done" above is closed. This is the remainder.

**Batch 1, the P1s still open.**
1. 10-gym P1-7, seven cards carrying a cue for the wrong implement. **HIS to author, not yours.** The
   cue text is in the "only he can author" column of the co-build table and all seven are already
   parked as `open` questions with due dates. Do not write them.
2. 10-gym P1-9, two `why` texts describing a partner that left, and P1-6's remaining three parked
   questions that state something false about their own card. Both are corrections, not inventions.
3. 11-swim P1-2 to P1-6: a retired pace band still printed, a SWOLF section telling him to close a
   gap the plan tells him to open, a "your last ten swims" list that is stale by four, seven in-water
   cues bypassing the grounding gate, and the cycles-vs-strokes question held open on one page while
   two others call it settled.
4. 09-health P1-4, "your last session" being the last LIFT when a swim came 90 minutes later.

**Batch 2, T2 in one sweep.** Every typed number becomes derived or goes. One pass across all four
reports, because the fix is identical everywhere and doing it per-report is how three get missed. The
`{PEAK_*}` placeholder mechanism plus its validator gate is the pattern: it is already in place for
the bike's heart rate and generalises.

**Batch 3, the gates (T6) and the round trips (T7).** Gates first: a gate that checks less than it
claims is worse than none, and 10-gym P2-9 and 11-swim P1-5 are both load-bearing today. Then
batching, in the cost order T7 lists. `/gym` is 52 to 76 round trips per page open.

**Batch 4, T8 and the remaining P2s and P3s.** `cuesNote` ships 11,309 bytes of developer prose to
his phone. Measure at 390px before and after with `scripts/probe-taps.mjs`.

## Constraints that bind every executor

Read the finding in its source report first. `node scripts/gym-notes.mjs` and
`node scripts/kitchen-notes.mjs` before touching those surfaces. `node scripts/verify.mjs` before any
push, `git pull --rebase origin main` first. No em dashes, no emoji: three build gates enforce it. New
write routes go in `WRITE_ROUTES`. **A judgment call about what is in his gym, how much time he has, or
what a cue must say is put to him as options with the cost of each, never invented**: that is the
co-build protocol in AGENTS.md and four of the P1s here are the result of an agent guessing once.

**Two things need him and nothing else can proceed on them:** the firewall regex extension for
`/kitchen/want` (outside the repo, outside any gate) and the heart-rate anchor definition parked on the
bike block.

## What held, across all four routes

No ungated write anywhere. No injection: every query a tagged template. No wrong-exercise write. Zero
unhandled gym notes of 23 and no overdue parked question. The mid-session deploy guard, the coverage
gate, `--pairing`, the slot-versus-catalogue station check and the absence of `inProgramme` all verified
working. All seven 307 mappings correct with anchored regexes and no loops. `/bike/api/ride` gated in
both places plus `WRITE_ROUTES`, the route linter and eight Postgres CHECKs. The bike page never claims
rpm, power or resistance, refusing in four independent places. No trend drawn below three points. The
44px floor and every chip row fit at 390px. `/health`'s four-condition staleness defence is correct
against live data, and no body metric is restated on it: weight, body fat and trend agree with
`HealthOS/CURRENT.md` exactly.
