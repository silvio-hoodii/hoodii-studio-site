---
title: The handoff audited against the repo, and what the executor must know
date: 2026-08-27
status: READ-ONLY AUDIT. Nothing was changed to produce this. Written for the agent that executes next.
audits: next-session-handoff-2026-08-27-the-programme-is-derived-now-and-two-things-are-still-owed.md
---

# The handoff audited against the repo

Every checkable claim in the handoff was re-run or re-read against the source, the gates, and the
live deployment. **The handoff is accurate and the direction is right.** But six things it does not
say will trip whoever executes it, and one of them blocks the handoff's own flagship example.

## Part 1: claim-by-claim verification

| Handoff claim | Verified how | Result |
|---|---|---|
| Live on `18718d7`, production READY | `vercel api /v13/deployments/...`: readyState READY, sha `18718d7a...`, aliased to hoodii.studio. origin/main = local HEAD | **TRUE** |
| 15 open questions, exit 0 until 2026-09-10 | Ran `scripts/gym-notes.mjs`: 15 questions, exit 0 | **TRUE** |
| Validator 0 failures | Ran `content/gym/validate.mjs`: 0 failures | **TRUE** |
| validate.test.mjs: 10 cases | Ran it: 10 cases, 0 failed | **TRUE** |
| Coverage NOT CLEAN, exit 1, 11 of 16 past efficient | Ran `scripts/gym-coverage.mjs`: 0 below minimum, 11 past efficient, 1 loose pairing, 4 unsourced, exit 1 | **TRUE** |
| Catalogue COMPLETE, exit 0 | Ran `scripts/gym-catalogue.mjs`: every station reachable, exit 0 | **TRUE** |
| check-ladder: 5 findings | Ran it: exactly 5 unreachable rungs | **TRUE** |
| 148 sets to 110 | Counted program.json: 21 + 34 + 27 + 28 = 110 | **TRUE** |
| Evidence file sections 20 and 21 exist | `HealthOS/knowledge/training-programme-evidence.md`, sections 20.1 to 20.8 and 21.1 to 21.3, written 2026-08-27 | **TRUE** |
| Backspace chars fixed, nothing greps for the class | Byte-scanned content/gym, scripts, src/lib/gym: clean today. `lint-prose.mjs` still has no control-char check | **TRUE, class still unguarded** |
| Coverage "has never been on a screen he can reach" | Grepped src/app/gym, src/app/health: no weekly volume rendered anywhere | **TRUE** |
| Rotation, not weekday: `DAY_ORDER` in program-shared | `src/lib/gym/program-shared.ts:7` | **TRUE** |

One imprecision, not a falsehood: the handoff names six lifts that "stand alone". The actual count
is **ten solo blocks of 23** (box jump, back squat, DB RDL, DB overhead press, BB RDL, front squat,
reverse lunge, BB row, machine chest press, assisted pull-up). The scope of owed item 1 is larger
than the handoff's list.

## Part 2: findings the handoff does not carry

### F1. The flagship pairing FAILS the current validator, and this blocks owed item 1

His accepted design is hanging knee raises in the RDL's rest, holding the top of the rack he is
already standing at. In the data:

- `romanian-deadlift`: zone `rack`, station `rack`
- `hanging-knee-raise` (content/gym/movements.json): zone `rack`, station `rack-pullup-bar`

`content/gym/validate.mjs` (~line 594) fails any concurrent block occupying two distinct stations.
`rack` and `rack-pullup-bar` are distinct stations in `content/gym/equipment.json`. **The exact
pairing he asked for does not compile.**

Physically it is one fixture: nobody else can use the pull-up bar of a rack he is squatting in. The
model is wrong, not the design. This needs ONE modeling decision before item 1 can ship, and it is a
judgment call about his gym, so present the options:

| Option | What it means | Cost |
|---|---|---|
| A. `parentStation` field | `rack-pullup-bar` declares `parentStation: "rack"`; the one-station check treats a child and its parent as one fixture | Small schema addition, one validator edit, honest about the topology |
| B. Merge the stations | Delete `rack-pullup-bar`, fold into `rack` | Loses the fact that the bar exists as its own capability; `gym-catalogue` section 2 stops naming it |
| C. Per-block exemption | An `open`/annotation on the block | Prose. Does not execute. Do not pick this |

**Do NOT dodge it with `station: null` on the knee raise.** A hanging knee raise holds a fixture.
That dodge is already in the file once (F4) and it is falsified data.

### F2. `--pairing` recommends the exact three swaps that were made and reversed today

`scripts/gym-catalogue.mjs:138` compares `p.zone === lead.zone` and line 146 filters candidates by
`v.zone === lead.zone`, then prints them as "same job at the lead's **station**". Zone is not
station: the handoff itself says so, and the cable section is three columns. Consequence, verified
by running it: the tool currently suggests Cable Lateral Raise (needs `cable-adjustable`) for the
seated row (holds `cable-row`), Cable Curl (`cable-row`) for the pushdown (`cable-pulldown`), and
Reverse Pec Deck (`pec-deck`) for the machine shoulder press (`shoulder-press`). All three were
tried on 2026-08-27 and reversed within the hour; all three would fail the validator today.

**A cheaper agent told to "use `--pairing` to find partners" will be steered into the reversed
swaps by the tool itself.** The validator will catch them, but only after the work is done. Fix the
tool first (compare stations, treat `station: null` as travel-capable, and stop printing the word
"station" for a zone comparison), or ignore its suggestions entirely and check candidates by hand
against station data.

### F3. Nine `inProgramme` flags in movements.json are already stale, on the day the file shipped

Compared every variant's `inProgramme` against what program.json actually prescribes:

```
db-rdl                          flag=false  actual=true
single-leg-glute-bridge         flag=true   actual=false
pushup                          flag=true   actual=false
cable-reverse-fly               flag=false  actual=true
ez-preacher-curl                flag=true   actual=false
incline-db-curl                 flag=false  actual=true
db-overhead-tricep-extension    flag=true   actual=false
cable-overhead-tricep-extension flag=false  actual=true
plank-shoulder-taps             flag=true   actual=false
```

All nine are today's swaps: the rebuild edited program.json and never touched the flags. Consumer:
the `*` markers in `gym-catalogue.mjs --options` (line 116), the very view the handoff points the
next agent at. This is the workspace's own stale-copy disease (body metrics 2026-08-01, immigration
2026-08-11) reproduced inside one repo on day one. **Fix the class, not the nine instances: derive
the flag from program.json at read time, or have `validate.mjs` assert flag = prescribed.** Never
hand-edit the nine.

### F4. Thursday's calf raise carries falsified station data, and the pair it passes is the founding violation

`program.json` thursday "Hamstrings + Calves": `leg-curl` (machines/`leg-curl`) paired with
`standing-calf-raise` (machines/**null**). Monday's identical exercise carries station
`calf-raise`, and his log holds 180 to 210 lb **on the machine**. The Thursday `station: null` is
what lets a leg-curl-machine + calf-machine pair pass the one-station rule. Two selectorised
machines in one rest window is the exact case quoted in equipment.json's own header ("you're saying
on the fore exercise I should use two machines"). The block passes validation because the data
lies, which is the worst direction per the file's own safe-defaults rule.

Related, one level up: the "traveling dumbbell" convention is unmodeled. Tuesday's
`db-lateral-raise` claims zone `cable` in program.json while `movements.json` says `benchDb`.
Nothing cross-checks a slot's zone/station against the catalogue's, so any slot can claim any zone
and pass. The honest fix is a `travels: true` property on implement-carried variants (dumbbell,
kettlebell) that the validator understands, instead of bending the zone per slot. Until then,
zone-bending is at least a convention; Thursday's `station: null` is not, it is false.

### F5. The handoff's trunk-work guidance contradicts its own coverage tool

Handoff: "Prefer partners that are already in the week, or trunk work, which is the one thing that
got cut hard today." Coverage today: **abdominals and obliques at 16 fractional sets, marked past
the efficient zone** (tier tops at 10). Adding 3 sets of hanging knee raises takes abs to 19,
further past. Two honest paths, and this is his call, not the executor's:

- **Volume-neutral (default):** move partners that already exist in the week into the heavy lifts'
  rest windows rather than adding new sets. Example that satisfies everything: thursday's
  `single-leg-rdl` (dumbbell, no fixture) moves behind the front squat, which is the handoff's own
  second example. Zero added sets.
- **Accept the extra abs volume knowingly:** his knee-raise proposal is his own, the overlap rule
  passes it, and past-efficient is diminishing returns, not harm. But he should choose it with the
  number in front of him, which is what owed item 2 exists for.

This ordering matters: **ship item 2 (coverage on screen) BEFORE item 1 (partners)**, so the
partner decisions get made against the visible week, and so he can see what each pairing change
does. Item 2 is also read-only and small; item 1 needs the F1 ruling.

### F6. A permanently red gate cannot signal a regression

`gym-coverage.mjs` exits 1 today and the handoff says that is correct. A gate that is expected to
fail teaches everyone to ignore it (the workspace's own meta-law), and it cannot get redder: if a
partner change pushes a muscle below minimum or adds a strict Zhang violation, the exit code does
not change. Split the conditions: **exit non-zero only on regressions against a recorded baseline**
(new below-minimum muscle, new strict pairing, new unsourced exercise), and report the known
past-efficient state without failing on it. Store the accepted baseline in the file, dated, so
"known" is explicit rather than remembered.

### F7. Owed item 2 must not reimplement the math

`gym-coverage.mjs` is CLI-only: no exports, top-level `process.argv`. A `/gym` or `/health` page
cannot import it, and the tempting move (reimplement fractional sets in the page) creates two
implementations of the same arithmetic that will drift, which is F3's disease again. Extract the
computation into a module (e.g. `src/lib/gym/coverage.ts` or a shared `content/gym/lib/`) that BOTH
the script and the page import, or have the script emit a JSON artifact the page reads. One source.
The page itself is small: the per-muscle table with the per-day columns, the tier markers, and the
Pelland citation line, rendered in the existing `.training` idiom. No prose. It is his week's
shape, not an explanation.

### F8. "Do not deploy while he is mid-session" has no mechanism

The handoff's first warning is a prose rule. The pre-push hook runs `scripts/verify.mjs`, which is
offline by design, so nothing executes the check. Per the meta-law this is decoration. Cheapest
real mechanism: a `scripts/guard-live-session.mjs` that queries `gym_session` for a row with
`finished_at` null and exits non-zero, called from `.githooks/pre-push` only when `DATABASE_URL`
is present (the same skip-when-offline posture check-ladder takes with the 07:15 task). If the
executor cannot ship that safely, say so in the handoff rather than leaving the rule as prose.

### F9. The five unreachable ladder rungs live outside the only tracked queue

`check-ladder.mjs` reports the same 5 findings it reported this morning (db-lateral-lunge,
db-lateral-raise twice, assisted-pullup, db-reverse-fly: top of rep range cannot bank the next
increment). Each needs a ruling (smaller increment vs `rangeWidth`), and none is an `open` row, so
nothing with a due date tracks them; they will sit in a script printout indefinitely. Either add
`open` rows for the ruling, or batch them into the next judgment-call pass (co-build rule 2 in
AGENTS.md). Note the interaction with F2: the lateral raise's clean fix was the cable stack's
2.5 lb steps, and that swap is fixture-blocked on Tuesday. On Thursday (primer partner, benchDb
lead) it is also a walk. So the realistic options are `rangeWidth` or accepting the stall, and only
he can pick.

### F10. The control-character lint the handoff suggests is still unwritten

Confirmed clean today by byte-scan, but the class (invisible bytes in a regex or a prose file that
every gate passes) has no guard. One loop in `scripts/lint-prose.mjs` over bytes < 0x20 excluding
tab/LF/CR. Cheap, and it is the handoff's own suggestion.

## Part 3: direction assessment

**The direction is right and should not be re-litigated.** Specifically:

- **Deriving the programme from the goal (evidence file section 20) is the correct method**, and
  its sequencing discipline (20.8: cut first, re-measure, only then ask what the week has room for)
  is the right answer to the deadlift temptation. Nothing in this audit argues for another rebuild.
  The audit-and-plan doc (docs/GYM-AUDIT-AND-PLAN-2026-08-27.md) said "not another rebuild before
  Decision 1" and then Decision 1 got made properly, with data; the rebuild that followed was the
  ruled-on one, not a fourth blind one.
- **The two owed items are the right two items**, they are both genuinely his asks, and both quote
  him. Order them 2 then 1 per F5.
- **The Zhang 2025 rule replacing "every block is a pair" is sound**: sourced, mechanised, and it
  made a block of one legal, which removed the pressure that had produced 41 sets of dumbbell
  isolation. Its one current gap is F1's fixture modeling.
- **The 15 open questions are correctly parked.** 8 are cue text on swapped implements, and agents
  do not write cue text in this project; those genuinely wait for him at the machine. Do not "help"
  by drafting cues.
- **What has repeatedly failed is honesty about state, not the training.** Five of seven main lifts
  rising while cutting means the programme works. Every fix that stuck was a gate; every fix that
  came back was prose. The findings above are all instances of that same pattern: F1/F4 are data
  that lies to a gate, F2/F3 are tools whose claims drifted from the data, F6/F8 are rules that do
  not execute.

## Part 4: execution order for the next agent

Gates before anything: `node scripts/gym-notes.mjs` first, then the full list in the handoff.
Never edit `inProgramme` by hand, never write cue text, never add `why` prose, never use
`station: null` on an exercise that holds a fixture.

1. **Mechanical fixes, no ruling needed:** F3 (derive/gate `inProgramme`), F2 (station-level
   `--pairing`), F10 (control-char lint), F6 (baseline-aware coverage exit). Each is small,
   each kills a class. Run `content/gym/validate.test.mjs` after touching the validator, and add a
   regression case for anything the validator learns.
2. **Owed item 2: coverage on screen** (F7 pattern: one shared module or emitted JSON, no second
   implementation). Read-only page, `.training` idiom, screenshot at 390px and look at it
   (`node scripts/shoot.mjs`).
3. **Batch the judgment calls into ONE pass for Silvio** (co-build rule 2): the F1 fixture ruling
   (options with costs above), F5 (knee-raise volume: neutral rearrangement vs knowing addition),
   F9 (the five ladder rungs), F4's Thursday calf raise (which is also open note material: the pair
   as prescribed occupies two machines; does he actually alternate them, or is that block a
   sequence?), and the two box-jump rep questions already in the notes. One message, options and
   costs, in his words.
4. **Owed item 1: partners on the heavy lifts**, only after the F1 ruling and the F5 choice, using
   station-correct candidates (single-leg RDL behind front squat is valid today; knee raise behind
   RDL after F1). Re-run coverage after each pairing change and quote the diff, not the intent.
5. **F8's deploy guard** if he wants it; otherwise delete the prose warning's pretense of being a
   rule and leave it as advice, stated as advice.

## What was NOT verified

- "Five of seven main lifts up while cutting": a Neon query; the corrected SQL method
  (`distinct on (date)`) is documented in the handoff and the shape of the claim is consistent with
  check-ladder's positive margins on the big lifts, but the query was not re-run here.
- The rendered screens themselves (no screenshots taken; this audit changed nothing and shipped
  nothing).
- The cook-log-style per-session data (`gym_session.sets_prescribed` stamping): asserted by commit
  `2ac8995`, not re-queried.
