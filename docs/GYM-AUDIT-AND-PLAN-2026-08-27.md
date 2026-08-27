---
title: The gym programme, audited against itself, and a plan
date: 2026-08-27
status: PROPOSAL. No code or content was changed to produce this.
author-note: Written after Silvio said "get it all straight for once, and stop making changes, research, explain the resosing and propose the plan"
---

# The gym programme, audited against itself

Five read-only audits ran in parallel. Every load-bearing claim below was re-verified by hand
against the source file or the database before being written here, because two of the five audits
overstated a finding and one made a negative claim about a source that turned out to be false.
Corrections are marked.

---

## THE ROOT CAUSE, in one sentence

**The programme has two rule systems. The mechanised ones have never been broken. The prose ones
have never been kept. And the prose ones are the ones that decide what exercises he does.**

| Rule | Mechanism | Violations |
|---|---|---|
| A superset occupies at most one station | `validate.mjs` | **0 of 25 blocks** |
| Every zone visited once, no doubling back | `validate.mjs` `checkZoneRoute` | **0** |
| Every logged exercise declares what progresses | `validate.mjs` | **0** |
| Every block has a `why` of 40+ characters | `validate.mjs` | **0** |
| A partner's `whyHere` is a verbatim span of its `why` | `validate.mjs` | **0** |
| "The partner is a muscle the lead lift does not use" | **none** | **11 of 25** |
| "The partner is a dumbbell progressed by weight" | **none** | **11 of 25** |
| "Every partner is `station: null` and needs no floor" | partial, checks something else | **1 + 9** |
| "Arms, calves and delts do not get twice a week" | **none** | **all three** |
| "Every decision traces to the evidence file" | **none** | **everything after 2026-08-16** |
| "How much text is too much" | **none**, and the only text checks are MINIMUMS | ongoing |

The pattern is not carelessness. **The prose rules were written to describe a layout that already
existed. Then the layout moved and the descriptions stayed.** A description has no failure mode, so
nothing objected. This is the workspace's own meta-law playing out inside one file: a rule that does
not execute is decoration.

---

## RETRACTED, 2026-08-27, and the retraction is the finding

**An earlier version of this section said "the programme prescribes 29 to 42 sets a day, he
completes 13.4, he has never once completed a day as written". That was wrong.** He challenged it and
he was right.

`gym_session` exists: 33 rows, and **every one of them reads `status: finished`.** There is no
cut-short session in the table's whole history. By the app's own record he finishes what he starts.
What the 13.4 figure actually measured was rows in `gym_set`, which is a record of TYPING, not of
training:

| Date | Status | Minutes | Sets logged |
|---|---|---|---|
| 2026-08-25 | finished | 111 | 30 |
| 2026-08-23 | finished | 37 | 6 |
| 2026-08-22 | finished | 55 | 14 |
| 2026-08-20 | finished | 75 | 9 |
| 2026-08-19 | finished | 60 | 13 |
| 2026-08-18 | finished | 130 | **7** |
| 2026-08-17 | finished | 61 | 8 |
| 2026-08-16 | finished | 47 | **1** |
| 2026-08-15 | finished | 101 | 16 |
| 2026-08-14 | finished | **330** | 14 |

47 minutes with one set logged is not a session with one set in it. 330 minutes is a page left open,
so the duration column is unreliable too.

**What survives is a better finding than the one it replaces.** Two records of the same session
disagree by roughly a factor of three. `gym_session` says finished; `gym_set` holds a third of the
prescription. Nothing in the app reconciles them, nothing displays them together, and therefore
nobody can say whether the gap is unlogged work or an oversized prescription. **That question is
still open and it is the most important one in this document.** It cannot be answered until Finding
39 is fixed.

The methodological lesson, which is the same one this whole session keeps producing: a proxy measure
was promoted to a claim about him without checking whether a direct record existed. It did, in a
table the app writes on every session and shows to nobody.

## Day size is not grounded either

| Day (tab) | Blocks | Primer | Main | Accessory | Cards |
|---|---|---|---|---|---|
| Lower A | 5 | 1 | 2 | 2 | 10 |
| Upper A | 7 | 1 | 4 | 2 | 14 |
| Lower B | 6 | 1 | 2 | 3 | 12 |
| Upper B | 7 | 1 | 4 | 2 | 14 |

The MAIN count is derivable and correct: four upper patterns (horizontal press, horizontal pull,
vertical pull, overhead) at twice a week gives 4 main blocks per upper day; two lower patterns
(squat, hinge) gives 2 per lower day. That falls out of the frequency rule.

**The accessory count, 2 / 2 / 3 / 2, is decided by nothing.** Grepped `program.json`,
`validate.mjs`, `AGENTS.md` and the evidence file for any rule about blocks per day or session size:
zero hits.

## THE ORIGINAL SECTION, kept for the record

**Prescribed: Lower A 29 sets, Upper A 42, Lower B 35, Upper B 42. Logged: 13.4 average.**

Last fourteen logged sessions, from `gym_set`:

| Date | Sets | Exercises | Watch minutes |
|---|---|---|---|
| 2026-08-25 | 30 | 14 | 103 |
| 2026-08-23 | 6 | 3 | 42 |
| 2026-08-22 | 14 | 7 | 59 |
| 2026-08-20 | 9 | 4 | 81 |
| 2026-08-19 | 13 | 7 | 69 |
| 2026-08-18 | 7 | 5 | 65 |
| 2026-08-17 | 8 | 4 | 78 |
| 2026-08-16 | 1 | 1 | 68 |
| 2026-08-15 | 16 | 6 | 98 |
| 2026-08-14 | 14 | 5 | 60 |
| 2026-08-09 | 18 | 6 | |
| 2026-08-08 | 18 | 6 | |
| 2026-08-06 | 22 | 7 | |
| 2026-08-05 | 12 | 5 | |
| **average** | **13.4** | **5.7** | |

Prescribed per day right now: Lower A 29, Upper A 42, Lower B 35, Upper B 42.

**He has never once completed a day as written.** His single best session in a fortnight was 30 sets
in 103 minutes, against a 42-set prescription. His own note said *"about 40 min"*, and 42 sets in 40
minutes is 57 seconds per set including rest, which is not a thing that happens.

Everything else in this document is downstream of that. The partner exercises exist to add volume
"for free" into the rest gaps of a session that was already three times too big. The "optional" tags
exist because the file knows it is too big. The drop-order sentence existed to tell him what to
abandon. **The programme is not a plan he executes; it is a menu he takes 30% of, and which 30% is
decided by fatigue and the clock rather than by design.**

---

## WHAT IS ACTUALLY TRUE, verified

### 1. The real pairing rule is the gym's floor plan, not physiology

24 of 25 partners are `station: null`. 25 of 25 blocks occupy at most one fixture. Once you accept
that constraint and the fact that the lead lifts consume all the main patterns, the only exercises
left to be a partner are dumbbell isolation work and floor holds. On a lower day, the isolation work
left over is upper-body **by arithmetic**.

The file already says this, nine paragraphs above the rules it states:

> "Every existing pair is a lift plus a fixture-free partner because that is the ONLY pair this gym
> physically permits, so the shape was a constraint being obeyed rather than a defect."

That is the true account. Rule 1 is the physiology story told about it afterwards, with a citation
attached. **8 of 25 blocks pass rule 1 strictly. Only 4 of 25 are the agonist/antagonist
relationship the cited study's mechanism actually covers.**

His question, answered directly: **does it make sense that leg days have upper?** On time, yes, and
that is the only argument the source supports: a lateral raise inside an RDL's rest costs no session
time. As physiology, no, and it costs the split its own premise, because hip extension is now a
partner on all four days.

### 2. Eleven pairings break rule 1, and three are refuted by a sentence in their own block

| Day (tab) | Block | Pair | The problem |
|---|---|---|---|
| Lower B | Main Lift: RDL | RDL + single-leg glute bridge | Both hip extension. The bridge's own cue warns *"if it is all hamstring, bring the heel closer in"*. Its entire stated reason is 24 characters: "Bridge in the rest gaps." |
| Lower A | Main Lift: Back Squat | Squat + same bridge | Same overlap, on the other heavy lift |
| Upper A + Upper B | Upper Primer | Pushup + same bridge | The pushup cue says *"squeeze your bum and your stomach"*. The next field says *"a pushup uses nothing below the waist"* |
| Lower B | Second Pattern: Squat, light | Front squat + reverse fly | The reason refutes itself: *"uses nothing in the upper back except to hold position"*. Losing the upper back is how a front squat fails |
| Upper B | Swim Catch + Triceps | Straight-arm pulldown + overhead tricep | *"all lat and no elbow, so they are idle"* is inverted. The exercise is defined by the elbow not bending, which is the triceps holding isometrically every rep |
| Upper B | Main Lift: BB Row | BB Row + dead bug | A 165 lb bent-over row is the largest anti-extension demand in the week |
| Lower B | Hamstrings + Calves | Leg curl + calf raise | The gastrocnemius crosses the knee and is co-active in a leg curl |
| Lower B | Single-Leg Hinge + Groin | Single-leg RDL + Copenhagen | Both frontal-plane hip. This block breaks all three rules at once |
| Upper A | Overhead | DB overhead press + plank shoulder taps | Disclosed, and the disclosure names only the shoulder. The bigger overlap is the trunk: it is a standing press whose cue is *"squeeze your bum and tighten your stomach BEFORE you press"* |

Passing cleanly, for the record: box jump + reverse fly, lateral bound + lateral raise, light RDL +
lateral raise, lat pulldown + tricep extension, cable row + lateral raise, pushdown + curl, machine
chest press + hammer curl, assisted pull-up + lateral raise, machine shoulder press + reverse fly.

### 3. The frequency argument is running backwards, against its own source

The evidence file, verbatim, line 48:

> "Squat, hinge, press and pull go twice. **Arms, calves and delts do not need to.**"

What the programme actually does:

| | Blocks/week | Sets/week |
|---|---|---|
| Rear delts | 4 | 12 |
| Side delts | 4 | 12 |
| Glute bridge | 4 | 8 |
| Triceps direct | 3 | 9 |
| Biceps direct | 3 | 9 |
| Calves | 2 | 6 |
| **Back squat** | **2** | **6** |
| Every other main pattern | 2 | 6 to 7 |

**The three exercises at four blocks a week are all partners, none is a main pattern, and two of them
are the exact muscle groups the source exempts.** The back squat, named in the file as the reason
frequency was raised at all, gets half the weekly sets of a rear delt fly.

And the block whose `why` reads *"Biceps get one exposure a week, which the frequency evidence says
is enough for arms"* **is the third biceps exposure of that week.**

### 4. The evidence contract was abandoned on 2026-08-16 and the promise was left in place

`content/gym/program.json` opens with:

> "The evidence behind every structural choice is in HealthOS/knowledge/training-programme-evidence.md.
> If a decision here is not defensible from a row in that file, it should not be here."

Grepped that file directly (61,051 bytes, 555 lines, last written 2026-08-16 22:58):

```
PRESENT:  valgus 4    d=-1.25 → 3    d=-1.44 → 3    Gruber 1    0.61 → 3    Pelland 1    Deng 1
ABSENT:   Iversen 0   antagonist 0   preload 0   superset 0   Robbins 0   Nunes 0   Motion Blueprint 0
```

**Correction to one audit, which reported the whole thing unsourced.** The frequency rebuild,
plyometrics, planes of motion and the knee-valgus core claims **are** in the file and check out. What
is entirely absent is the superset architecture, exercise ordering, and The Motion Blueprint. The
file's last write is 2026-08-16; the superset rebuild is 2026-08-22. **The contract holds for the
first rebuild and was silently dropped for everything after it.**

Three citations cannot be checked against anything in this workspace:

- **Iversen 2021**, the sole justification for the entire superset architecture. Zero hits in the
  evidence file. `HealthOS/HANDOFF.md` line 216 summarises "Iversen 2021" as a *different* claim
  ("high-frequency matches periodized at equal volume"), so the workspace holds two incompatible
  summaries of one reference and no stored text for either.
- **Nunes 2021**, the sole justification for moving the overhead press to slot 2. Two occurrences in
  the whole workspace, both written by an agent. No journal, no title, no initials.
- **The Motion Blueprint (Jason & Lauren Pak, Theory of Motion, 2025)**. Traced to the end on
  2026-08-27, and this is the worst of the three. **Nine citation sites in `program.json`**, and they
  are the sole basis for: the pushup primer on BOTH upper days, the `leg-curl`, the calf-raise
  placement on Lower B, the "eight core patterns" claim behind `cable-pallof`, and the superset
  caveat on Upper B's carry block.

  **Its complete trace in this workspace is two lines, and neither is the document:**

  1. `C:\Users\sneyr\Desktop\HOODII\ReadLaterOS\logs\run_2026-08-09_23-45-02.log` line 9:
     *"YouTube Short from Jason & Lauren Pak, page was thin (title only), identified via web search as
     their Theory of Motion training brand"*. Even the saved link had no readable content, and the
     brand was identified by searching rather than by reading.
  2. `C:\Users\sneyr\Desktop\HOODII\CuriosityOS\digest\outbox\2026-08-11.json`: a one-line summary of
     that Short, `youtube.com/shorts/wYDv9GAGW2w`, which mentions that *"a free 20-page guide covers
     the philosophy without the paid app"*. The guide is named as existing and is stored nowhere.

  **The granularity is the giveaway.** The citations quote per-slot session labels: `"3-day Day 3,
  B2. Pushup Variations"`, `"3-day Day 3, C2. Multi-Planar / Anti-Rotation"`, `"4-day Day 1 Lower,
  D1. Isolation Hamstrings"`. A 60-second Short about moving better cannot contain a programme index,
  and neither can a 20-page philosophy guide. The commit that introduced all of them, `7f8e3ed`, is
  titled *"each traced to a page of it"* and its diff **contains no page number anywhere**.

  Two readings are possible and the repo cannot distinguish them: Silvio opened the free guide and
  read the structure out in a session and nobody saved it, or an agent extrapolated a programme index
  from a digest line. **Either way, five live exercises rest on a document nobody in this workspace
  can now open, and one of them is a block added on 2026-08-27.**

  Cheapest possible fix, and it settles all nine at once: if he still has the guide, save it into the
  repo. If he does not, those five placements have no checkable basis and Decision 3 has to cover
  them.

### 5. One `why` says "not sourced" where the source actually warns against it

Upper B, Swim Catch + Triceps:

> "Straight-arm pulldown for the catch position in the water. Not sourced in the evidence file, and
> it stays because it is loadable..."

The evidence file names it once, at line 330, inside the section headed **"the one genuine risk flag
in the whole rebuild"**:

> "He uses paddles regularly, swims 3 times a week, and lifts heavy pulling and pressing four times a
> week: lat pulldown at 200 lb, **straight-arm pulldown**, BB row, DB bench, overhead press. That is
> both identified shoulder risk factors stacked on one shoulder."

"Not sourced" is technically true and materially misleading. There is no source *for* it; there is a
source naming it in a shoulder-risk warning.

### 6. The EZ bar preacher curl: he is right, and the mechanism is worse than fixation

He said: *"i feel ez bar precher curl is just there becuase i meantoine the bar and you got fixarted
about it"*.

What actually happened, with commits:

1. **2026-08-15.** In a handoff, under "Still open, and each needs a decision more than a patch":
   *"`bicep-curl` offers exactly one alternative, `hammer-curl`. He wants the EZ bar ('the zed bar',
   never registered anywhere) and cable curls."* **He asked for it as a SWAP OPTION on the curl card.**
2. **2026-08-16, commit `3313b8f`.** A 1,126-line rebuild about frequency created the `ezPreacher`
   zone, the `preacher` station, and `ez-preacher-curl`, **and made it the LEAD of the block,
   demoting `bicep-curl` to an alternative.** The commit message never mentions biceps, the EZ bar,
   or the preacher seat.
3. The only recorded evidence, in `content/gym/equipment.json`, is one sentence he said once about
   furniture existing: *"The EZ bar has the seat too so you can do preacher curls there"*.
4. The cue printed on his card reads: *"The zed bar with the seat, **which you have had all along and
   which was never written down anywhere**."* That is an agent's own discovery, written onto his
   workout.
5. **Nothing in this workspace has ever compared a preacher curl to a standing curl.** Zero hits for
   `bicep`, `curl`, `preacher` or `EZ` in the evidence file.

He asked for one more swap and got a new zone, a new station, and his actual request demoted.

### 7. The glute bridge: the flip he caught is documented, the growth is not

| Commit | Date | State |
|---|---|---|
| `8bfe5fa` | 2026-08-10 | Created in **three** places at once: Monday, Thursday, and the lower warmup. No reasoning recorded |
| `be2d1b9` | 2026-08-22 12:08 | **Warmup copies removed**, with an explicit rule stated: "if it is loaded and logged in the session, the warmup does not also need it." Down to 2 |
| `7f8e3ed` | 2026-08-22 17:37 | **Third added** to Friday, as the pushup primer's partner |
| `b6c5185` | 2026-08-27 12:43 | **Fourth added** to Tuesday, as a side effect of copying Friday's primer to fix the missing-primer complaint |

**The warmup-to-workout move IS documented and has not been undone.** So his memory is right about
the flip and the record does exist. But the question underneath was never asked: it grew 2 to 3 to 4
across three unrelated commits, each locally justified as cheap rest-gap filler, and **no commit,
comment or document anywhere states "the glute bridge is now on every day of the week, and that is
the design."** He asked "why is the single leg glute bridge here" again on 2026-08-25, three days
after the fix, and the file answered by adding two more copies.

### 8. Other reversals found, all documented, one not

Documented and stable: bands out of the session (reversed within the hour, then explicitly
`git revert`-ed), the typed `time` field deleted, `gym_set.rir` dropped, the Friday carry returned to
`sequence` with the over-reach admitted in the file, plank shoulder taps time to reps, both carries
reps to seconds.

**Not documented:** four band exercises (`banded-hip-abduction`, `banded-lateral-walk`, `band-pallof`,
`band-straight-arm-pulldown`) are still in `program.json` as swap alternatives, having never been
touched by the ruling that removed bands from the session. The `$comment` states that ruling as if it
were universal: *"that is what put the bands in warmups.json and it is not being undone."*

### 9. Numbers on the page

| Label | What it actually is | Severity |
|---|---|---|
| **"Warmup (4 min)"** | `warmupList.length`. The **count of warmup exercises** with "min" welded on. `WarmupItem` has `name`, `search`, `cue`, `media`. No duration field exists in the schema. Both lists hold 4 items, so it reads "4 min" by coincidence. Add a fifth drill and it says "5 min" | **Fabricated, on screen every load** |
| **"0/29 sets"** | Does **not** count warmups or cooldowns; his suspicion there is wrong. It counts every logged set in every block, both halves of every superset, and all optional blocks. Monday's 29 is **17 spine + 12 optional** | Misleading: ticking 29 is not "finished" |
| "12 days to Aug 25, over 3" | Correct arithmetic, counts any activity including swims and one watch-invented 12-minute session. Belongs on the Body page, not here | Should be deleted from /gym |
| "about 164 min" | Dead code, not rendered since today. Computed from a 2.5-min-per-set constant fitted to a database that stopped being written 2026-08-09. Cannot go below `sets × (rest + 150s)` | Latent |
| Notes count | Capped at the 20 newest rows. He has 18. At 21 an old unhandled note drops out of the "not acted on" count with no sign on screen | Latent |
| Plate math | Assumes an unlimited supply of every plate. `equipment.json` holds no plate inventory at all | Unverifiable |
| Trend "over 8" | Hard-capped at 8 sessions, never disclosed | Low |
| "+5 lb" in a suggestion reason | Real mechanism (`roundLoad` rounds to 5 and can produce a 7.5 lb jump), **not currently firing**: `workingWeight` picks the most-used weight, and only two exercises in the whole log sit off a multiple of 5, both on 2.5 lb cable increments. One audit reported this as live; it is latent | Latent |

### 10. Text: every rule is a minimum, none is a maximum

```
content/gym/validate.mjs:247   block.why  >= 40 characters
content/gym/validate.mjs:309   whyHere    >= 20 characters
content/gym/validate.mjs:354   open.q     >= 30 characters
```

Three mechanical rules about text, all three forcing it **longer**. Nothing anywhere refuses a string
for being too long.

The rule he remembers does exist, in `AGENTS.md`, and it says *"how much text is too much"* is a
judgment only he can make. That sounds respectful and functions as no limit. The other version, "UI
copy is a title, not an explanation", exists **only in an assistant memory file** with no project
file and no mechanism behind it.

Current volume:

| | Characters |
|---|---|
| Exercise cues, 50 main-slot, folded | **29,325** (avg 587, longest 1,212) |
| Alternate cues, 116, behind the swap picker | 16,434 |
| Hardcoded prose in the two page files | 961 |
| Note box instructions, always visible | 201 |
| The streak fold added today | 349 |
| Header prose (deleted today) | 624 |

**Probable source of the confusion:** `KitchenOS/DESIGN.md` states the opposite rule, in as many
words: *"Length is not a cost; terseness is the failure."* Correct for a beginner at a stove. The gym
is him, between sets, reading a programme he designed. The gym inherited the kitchen's rule.

### 11. Claims in the file that are simply false

- *"It is also the only partner in the programme that is not a dumbbell"* (Upper A, Overhead).
  There are **four** non-dumbbell partners across 9 blocks. **Written today.**
- *"a pushup uses nothing below the waist"*, contradicted by the pushup cue in the same block.
  **Copied to a second day today.**
- *"All five are dumbbell exercises progressed by weight"* (rule 3). There are **11** distinct
  partners; 6 do not progress by weight, and three print a rep count that never changes.
- *"EVERY BLOCK IS A SUPERSET, from 2026-08-22"*, three lines above a block whose own `why` explains
  why it is not one and calls the attempt a mistake.
- The `$comment`'s list of admitted-unsourced blocks names **"rotator cuff"**, which is not a block
  in this file. One `grep -i rotator` hit: the claim itself.
- *"he never walks back to the dumbbells"* (Upper A, Overhead). Tuesday's last four blocks all have
  cable leads and dumbbell partners needing at least three distinct loads at the cable stack.

---

# THE PLAN

Nothing below has been done. Each decision is his. The bugs in Decision 5 are the only things I would
do without a ruling, and I have not done them.

## Decision 1: size the programme to the session that actually happens

This is the one that matters. Everything else is cosmetic next to it.

| Option | What it means | Cost |
|---|---|---|
| **A. Rebuild at ~16 sets** | Four days of 5 to 6 exercises, 14 to 16 sets, finishable in 45 minutes. Main patterns keep twice-a-week frequency. Partners survive only where they are genuinely free and genuinely non-competing | Roughly half the current exercise list goes. Direct arm and delt work drops to once a week, which is what the source says they need |
| **B. Keep the list, make the spine honest** | Prescription unchanged, but the page shows "spine: 17 sets" as the target and everything else as clearly separate. The counter stops implying 42 is the goal | Nothing is cut, so the 42-set day still exists on screen and he still finishes 30% of it |
| **C. Two prescriptions per day** | An explicit 40-minute version and a full version, chosen at the top of the session, derived from the same block list | Reintroduces the time-budget prediction he already rejected on 2026-08-22 |

## Decision 2: what happens to the partner scheme

| Option | What it means | Cost |
|---|---|---|
| **A. Keep only the 4 real antagonist pairs** | Pushdown/curl, pulldown/tricep, chest press/curl, shoulder press/reverse fly. Everything else becomes a plain sequential exercise or is cut | Loses the free-volume trick. Combined with Decision 1A this is the smallest, most honest programme |
| **B. Mechanise the rule** | Add a muscle map per exercise (prime movers + instructed isometric holds), and have `validate.mjs` refuse a pairing that shares either. The rule stops being prose | Real work, and the map is a judgment input he would have to sanity-check once. But it makes the class of error unrepresentable rather than checked |
| **C. Drop rule 1 and say the true rule out loud** | The `$comment` states: the partner holds no fixture, is in the zone you are standing in, and can be logged. Delete the antagonist-preloading warrant from the general rule and keep it on the four blocks where it applies | Cheapest honest option. Does not fix the eleven pairings, it just stops lying about them |

## Decision 3: the evidence contract

| Option | What it means |
|---|---|
| **A. Enforce it** | `validate.mjs` requires every `why` to cite a line that exists in the evidence file, or to carry `sourced: false` explicitly. Then re-source or mark everything post-2026-08-16 |
| **B. Retire it** | Delete the promise from the `$comment`. Stop claiming sourcing the file does not have. Keep the evidence file as history |
| **C. Rebuild the evidence file** | Add the superset, exercise-order and Motion Blueprint sections properly, with stored text, or delete those three claims and the exercises resting on them |

**Independent of the above, three citations need resolving because things depend on them:** Iversen
2021 (the whole superset architecture), Nunes 2021 (the overhead press slot), and The Motion Blueprint
(both pushup primers, the calf/deadlift pairing). If he has the Motion Blueprint document, saving it
into the repo settles four exercises at once.

## Decision 4: a text ceiling with a mechanism

Proposal, numbers for him to set or reject:

| Field | Cap | Rationale |
|---|---|---|
| `whyHere` | 120 chars | Current longest is 145. One clause |
| `block.why` | 400 chars | Currently up to ~900 |
| `cue` | 700 chars | Currently up to 1,212, avg 587. This is the big one and cutting it is a real loss for a beginner |
| Any always-visible string in `page.tsx` / `GymClient.tsx` | 120 chars | Kills the note box paragraph and the streak fold |

Gated in `validate.mjs` as maximums, sitting next to the existing minimums. And one line in
`AGENTS.md` saying the gym's rule is the OPPOSITE of the kitchen's, so the next agent does not
inherit "length is not a cost" again.

## Decision 5: the plain bugs, no ruling needed but not yet done

1. `Warmup ({warmupList.length} min)` becomes an item count or gets real durations added to the schema.
2. Delete the streak from `/gym`. It lives on `/health`.
3. The set counter distinguishes spine from optional, or counts only the spine.
4. Delete `dayTimeBreakdown` from `program-shared.ts`; it is dead and wrong.
5. Uncap the notes count, or label it "20 newest".
6. Delete the note box instruction paragraph.
7. Fix the six false claims listed in section 11, including the two I wrote today.
8. Either declare the 4 band alternates legal or move them out, and correct the `$comment` either way.

## Decision 6: the file that does not exist

There is no document recording what the programme currently is and why. The reasoning lives in a
`$comment` and in commit messages, each explaining one day's decision in isolation and never looking
sideways at the same exercise's other appearances. That is precisely how the glute bridge reached four
days without a decision.

Proposal: `content/gym/DESIGN.md`, on the kitchen's pattern, holding the current rules, the current
frequency table per muscle, and one line per exercise saying why it is in the file and how many places
it may occupy. With a mechanism: `validate.mjs` fails if an exercise appears in more blocks than
`DESIGN.md` permits. That is the check that would have caught findings 7 and 3.

---

## What I am NOT proposing

- **Not another rebuild of `program.json` before Decision 1 is made.** It has been rebuilt three times
  (2026-08-16, 08-21, 08-22) plus a patch flurry on 08-26 and 08-27, and every rebuild was against
  sourced reasoning and still produced the state above. A fourth rebuild with the same method gets the
  same result.
- **Not more `why` text.** The reasoning is not missing. In eleven places it is wrong, and in three it
  is refuted by a sentence inside its own block.
- **Not writing cue text.** Every unit and cue defect in this project's history came from an agent
  sentence, not from a source figure.


---

# FINDINGS REGISTER

Every finding from the five audits, numbered so none can drop off. **V** = verified by hand against
the source file or the database by the main session, not just reported by an agent. **Needs** = R for
a ruling from Silvio, B for a plain bug needing no ruling, D for a decision already listed above.

Nothing in this register has been acted on.

## The pairing rules

| # | Finding | V | Needs |
|---|---|---|---|
| 1 | Rule 1 ("the partner is a muscle the lead lift does not use") has no mechanism. 11 of 25 blocks break it. 8 pass strictly, and only 4 are the agonist/antagonist relationship the cited study covers | yes | R (D2) |
| 2 | Lower B: BB RDL + single-leg glute bridge. Both hip extension. Whole stated reason is 24 characters | yes | R |
| 3 | Lower A: back squat + same bridge. Same overlap, other heavy lift | yes | R |
| 4 | Upper A and Upper B: pushup + same bridge, whose `whyHere` says "a pushup uses nothing below the waist" while the pushup cue says "squeeze your bum and your stomach". Added 2026-08-27 | yes | R |
| 5 | Lower B: front squat + reverse fly. The reason refutes itself: "uses nothing in the upper back except to hold position" | yes | R |
| 6 | Upper B: straight-arm pulldown + overhead tricep. "all lat and no elbow, so they are idle" is inverted; the exercise is defined by the elbow not bending | yes | R |
| 7 | Upper B: BB Row + dead bug. A 165 lb bent-over row is the largest anti-extension demand in the week | yes | R |
| 8 | Lower B: leg curl + calf raise. The gastrocnemius crosses the knee and is co-active in a leg curl | partial | R |
| 9 | Lower B: single-leg RDL + Copenhagen plank. Breaks all three rules at once. Least compliant block in the file | partial | R |
| 10 | Upper A: DB overhead press + plank shoulder taps. Disclosed, but the disclosure names only the shoulder; the bigger overlap is the trunk brace | yes | R |
| 11 | Rule 1's own worked example, "calves in an upper-body lift", matches neither calf-raise placement. The file explains moving it and never updated the rule | yes | R |
| 12 | Rule 1's third clause, "side delts in anything", is an exemption, not a rule, and covers the most frequent partner in the file | yes | R |

## Frequency

| # | Finding | V | Needs |
|---|---|---|---|
| 13 | The evidence file says "Squat, hinge, press and pull go twice. Arms, calves and delts do not need to." The programme gives rear delts 4 blocks / 12 sets, side delts 4 / 12, triceps 3, biceps 3, calves 2, against the back squat's 2 / 6 | yes | R (D1) |
| 14 | "Biceps get one exposure a week" is written on the block that is the third biceps exposure | yes | B |
| 15 | "Arms do not earn twice a week" is written on a block in a week where triceps appear three times | yes | B |
| 16 | Lower B's calf `whyHere` says "Calves were once a week against a programme whose rule is twice", inverting the source, while Lower A's copy of the same exercise honestly says "The calf raise is not sourced" | yes | B |
| 17 | Day size: accessory-block count (2/2/3/2) is decided by nothing. Main count IS derivable from the frequency rule | yes | R |

## Sourcing

| # | Finding | V | Needs |
|---|---|---|---|
| 18 | The evidence file was last written 2026-08-16. The superset rebuild is 2026-08-22. `program.json`'s promise that every decision traces to it holds for the first rebuild and was dropped after | yes | R (D3) |
| 19 | **Iversen 2021**, sole justification for the entire superset architecture: zero hits in the evidence file, and `HealthOS/HANDOFF.md` summarises the same reference as a different claim. No stored text | yes | R |
| 20 | **Nunes 2021**, sole justification for the overhead press in slot 2: two occurrences in the whole workspace, both agent-written. No journal, no title, no initials | yes | R |
| 21 | **The Motion Blueprint**, 9 citation sites, sole basis for both pushup primers, the leg curl, the Lower B calf placement, the "eight core patterns" claim, and the carry caveat. Whole trace is a ReadLaterOS log line saying the page was "thin (title only)" plus a one-line digest summary of a YouTube Short. Citations quote per-slot session labels a Short cannot contain; the commit titled "each traced to a page of it" has no page numbers | yes | R |
| 22 | Upper B's straight-arm pulldown `why` says "Not sourced in the evidence file" while the file names it inside the section headed "the one genuine risk flag in the whole rebuild": both identified shoulder risk factors stacked on one shoulder | yes | R |
| 23 | Cömert and Gruber's actual finding is that hip strengthening ALONE had minimal effect. The evidence file records that honestly; the programme's frontal-plane `why` is firmer than the source | yes | B |
| 24 | The `$comment` claims unsourced blocks say so, and names four. The list is incomplete (carries, single-leg work, the glute bridge, shoulder taps, and all four invented dumbbell partners are equally unsourced), two of the four named do not say so, and one names "rotator cuff", which is not a block in this file | yes | B |

## Provenance and reversals

| # | Finding | V | Needs |
|---|---|---|---|
| 25 | **EZ preacher curl.** He asked for the EZ bar as a SWAP OPTION on the curl card (2026-08-15 handoff). Commit `3313b8f` created a zone, a station and the exercise, made it the block LEAD, and demoted `bicep-curl` to an alternative. The commit message never mentions biceps. The cue printed on his card reads "which you have had all along and which was never written down anywhere". Nothing here has ever compared a preacher curl to a standing curl | yes | R |
| 26 | **Glute bridge on all four days.** The warmup-to-workout move IS documented (`be2d1b9`) and has not been undone. But it grew 2 to 3 to 4 across three unrelated commits and no file anywhere states that as the design. He asked "why is the glute bridge here" on 2026-08-25 and the file answered by adding two more copies | yes | R |
| 27 | Four band alternates (`banded-hip-abduction`, `banded-lateral-walk`, `band-pallof`, `band-straight-arm-pulldown`) are still in `program.json`, never touched by the ruling that removed bands from the session. The `$comment` states that ruling as universal | yes | B |
| 28 | "EVERY BLOCK IS A SUPERSET, from 2026-08-22" sits three lines above the rules, while one block's own `why` explains why it is not one and calls the attempt a mistake | yes | B |
| 29 | "It is also the only partner in the programme that is not a dumbbell": there are four, across 9 blocks. Written 2026-08-27 | yes | B |
| 30 | Rule 3's "All five are dumbbell exercises progressed by weight": there are 11 distinct partners, 6 do not progress by weight, and three print a rep count that never changes | yes | B |
| 31 | Rule 2's "every partner is `station: null` and needs no floor": one station violation (Copenhagen on a bench) and nine floor violations. The validator checks a weaker rule than the text claims | yes | B |
| 32 | "he never walks back to the dumbbells" (Upper A): Tuesday's last four blocks all have cable leads and dumbbell partners needing at least three distinct loads at the cable stack | yes | B |

## Numbers on the page

| # | Finding | V | Needs |
|---|---|---|---|
| 33 | **"Warmup (4 min)" is `warmupList.length` with "min" welded on.** `WarmupItem` has no duration field. Both lists hold 4 items so it reads "4 min" by coincidence. On screen every load | yes | B |
| 34 | "0/29 sets" does NOT count warmups (his suspicion there was wrong) but mixes 17 spine sets with 12 optional and signals nothing | yes | R |
| 35 | The streak on `/gym` counts any activity including swims, runs and one watch-invented 12-minute session, on a page about lifting. It already exists on `/health` | yes | B |
| 36 | `dayTimeBreakdown` is dead code, computes from a 2.5-min-per-set constant fitted to a database that stopped being written 2026-08-09, and cannot go below `sets x (rest + 150s)`. It said 164 min for a day he does in 40 | yes | B |
| 37 | The notes count is capped at the 20 newest rows. He has 18. At 21, an old unhandled note leaves the "not acted on" count with no sign on screen | yes | B |
| 38 | Plate math assumes an unlimited supply of every plate. `equipment.json` holds no plate inventory | yes | R |
| 39 | **`gym_session` is written on every session and read by nothing that displays anything.** 33 rows since June, never shown. No session history exists under `/gym`, and `/health`'s "last ten lifts" reads the watch table instead. This is why finding 40 went unnoticed | yes | R |
| 40 | Two records of each session disagree by roughly 3x: `gym_session` says finished, `gym_set` holds a third of the prescription. Nothing reconciles them. Whether the gap is unlogged work or an oversized prescription is unanswerable until 39 is fixed | yes | R |
| 41 | `gym_session` duration is unreliable: 330 minutes on 2026-08-14 is a page left open, not a session | yes | B |
| 42 | The Trend sparkline is hard-capped at 8 sessions and never says so | yes | B |
| 43 | `roundLoad` can print "+5 lb" while jumping 7.5 lb. Real mechanism, **not currently firing**: `workingWeight` picks the most-used weight and only two logged exercises sit off a multiple of 5, both on 2.5 lb cable increments. One audit reported this as live | yes | B |

## Text

| # | Finding | V | Needs |
|---|---|---|---|
| 44 | All three text checks in `validate.mjs` are MINIMUMS (40, 20, 30 chars). Nothing anywhere refuses a string for being too long | yes | R (D4) |
| 45 | Cues total 29,325 characters across 50 main-slot exercises, average 587, longest 1,212. Folded, defended in `AGENTS.md` as necessary for a beginner | yes | R |
| 46 | The note box instruction paragraph, 201 chars, always visible, explains a box he asked for and has used 19 times | yes | B |
| 47 | The streak fold, 349 chars, added 2026-08-27 as a fix for an undated number. Adding text to answer a text complaint | yes | B |
| 48 | `KitchenOS/DESIGN.md` states the opposite rule, "Length is not a cost; terseness is the failure". Correct for a stove, wrong for the gym, and the gym inherited it. No file states the gym's rule | yes | R |
| 49 | The rule he remembered ("UI copy is a title, not an explanation") exists only in an assistant memory file, with no project file and no mechanism | yes | R |
| 50 | The RIR guide is still on the page, folded, last item before the note box. Kept deliberately when the dead `rir` column was dropped, with the reason recorded. His memory of removing it is half right: the column went, the explainer stayed | yes | R |

## Found while specifying the history view, 2026-08-27

| # | Finding | V | Needs |
|---|---|---|---|
| 51 | **The watch holds 698 strength sessions back to 2023-04-24. The app holds 33, back to 2026-05-25.** Three and a third years of lifting history exists and no surface shows any of it. Same for swimming: 420 sessions and 19,327 lengths back to 2018-01-03 | yes | R (D7) |
| 52 | `bike_ride` has **zero rows**. The typed-resistance form shipped 2026-08-27 and has never been used, so the app's own bike record is empty while the watch holds 76 sessions | yes | R |
| 53 | `AGENTS.md` says cycling "has exactly one session ever" and that the bike page can honestly say "nothing". There are **76** cycling sessions from 2021-09-05, though only one in 2026 (the previous was 2025-04-23). The claim is defensible about the recent window and misleading as written, and it is the kind of stale doc line this whole audit is about | yes | B |


---

# DECISION 7: SESSION HISTORY. SHIPPED 2026-08-27, commit db5ca33, live on hoodii.studio

He ruled on both questions:

1. **Recent 5 on the Now tab of each surface, plus a deep route per surface.** His own
   `/swim` + `/swim/deep` pattern, applied to all five.
2. **The gym row shows minutes and sets logged against sets prescribed, side by side**, because that
   is the row that makes Finding 40 visible without anyone having to ask.

## Why this should be built FIRST, before Decisions 1 to 6

Finding 40 is unanswerable right now: `gym_session` says every session finished, `gym_set` holds
about a third of the prescription, and nothing shows the two together. **Until that is resolved,
Decision 1 cannot be made**, because "the programme is too big" and "the logging is incomplete" have
the same signature and opposite fixes. The history view is the instrument that tells them apart, and
after a fortnight of use it answers Decision 1 with evidence instead of inference.

That is also the sequencing lesson from this session: an earlier version of this document tried to
answer Decision 1 by inference and got it wrong.

## HOW MUCH HISTORY ACTUALLY EXISTS, and it is far more than any doc claims

| Surface | The app's own record | The watch's record | Span |
|---|---|---|---|
| Lifting | `gym_session` **33** sessions, with sets, weights and reps | `health_watch_session` **698** strength sessions, heart rate only | app: 2026-05-25 onward. Watch: **2023-04-24** onward |
| Swimming | none | **420** sessions, plus **19,327** individual lengths | **2018-01-03** onward |
| Treadmill | none | **260** sessions, with real cadence | 2023-01-18 onward |
| Running | none | **58** sessions | 2019-09-05 onward |
| Cycling | `bike_ride` **0** rows | **76** sessions, heart rate only | 2021-09-05 onward |

**Three and a third years of lifting history exists and the page he trains from shows none of it.**
The app knows what he lifted since May; the watch knows he trained since April 2023. `/gym/log`
should say that split out loud rather than presenting one as the whole record.

## The spec

**Every Now tab gains, at the bottom, above the note box:**

```
LAST 5 SESSIONS
Aug 25  Upper B  111m  30/42 sets
Aug 23  Lower B   37m   6/35 sets
Aug 22  Upper A   55m  14/42 sets
Aug 20  Lower A   75m   9/29 sets
Aug 19  Upper B   60m  13/42 sets
                     all 33 sessions >
```

Five rows, mono, one line each, no prose. The link is the only new text.

**New routes:** `/gym/log`, `/run/log`, `/bike/log`. `/swim/deep` already exists and stays as it is;
it is the pattern the others are copying.

**`/gym/log` has two tiers and must label them:**

- 2026-05-25 onward, 33 sessions: date, day, minutes, sets logged against prescribed, and every set
  expandable in place.
- 2023-04-24 onward, 698 watch sessions: date, minutes, percent under 110 bpm. **No sets, because
  none were recorded**, and the page has to say so rather than showing a blank column.

**`/bike/log` is the honest problem case.** `bike_ride` has **zero rows**: the typed-resistance form
shipped and has never been used. So the route would show 76 heart-rate-only watch sessions and an
empty app record. Either it says that plainly, or `/bike` does not get a log route yet. That is a
small ruling still outstanding.

**Caps and honesty rules, learned from Finding 37 and Finding 42:**

- No silent truncation. If a list is capped, the cap is on screen ("all 33 sessions", "showing 50 of
  698").
- Minutes come from `gym_session.finished_at - started_at` and are **unreliable** (Finding 41: 330
  minutes on 2026-08-14 is a page left open). Either cross-check against the watch's own minutes for
  that date, or label the column as time-with-the-page-open. Do not print it as session duration.
- The prescribed figure in "30/42" must be computed from the programme as it is TODAY, or stored per
  session. A day's prescription has changed five times this month, so a historic row rendered against
  today's programme will misstate the past. **This is a real design question and the cheap answer is
  to store `sets_prescribed` on `gym_session` at start time.**

## What is NOT in this spec

- No charts. `/swim/deep` earned its charts on 19,327 lengths; 33 sessions do not.
- No prose explaining what a session is.
- No streak. That was deleted from `/gym` per Finding 35 and belongs on `/health`.


---

# WHAT D7 REVEALED THE HOUR IT SHIPPED

**Finding 40 is answered. The logging is incomplete; the prescription question is still open but is
no longer the leading explanation.**

`/gym/log` tier 2, read on production:

```
31 OF THE 60 NEWEST, UNSEEN BY THE APP
Jul 30  strength   88m   70%
Jul 27  strength   83m   16%
Jul 23  strength   94m   35%
Jul 20  strength  122m   25%
Jul 17  strength   36m   93%
Jul 13  strength  128m   62%
Jul 11  strength  109m   56%
Jun 30  strength  107m   41%
...
```

**Thirty-one lifting sessions in June and July that the app has no record of whatsoever**, at 83, 88,
94, 107, 109, 122 and 128 minutes. He was training hard and often, and `gym_session` holds nothing
for any of those days. Against 698 watch sessions back to 2023-04-24, the app's 33 rows are the tail
end of a much longer habit.

So the earlier retracted claim was wrong in the direction that matters most: the problem was never
that he does not finish sessions. **The app's record of his lifting is a three-month partial
snapshot, and every conclusion drawn from set counts alone inherits that.**

What is still genuinely open, and what the new column will answer: from now on every session stamps
`sets_prescribed`, so within a fortnight there will be real paired data on days he does log. If
`sets_logged / sets_prescribed` sits near 1.0 on those days, Decision 1 is a logging problem and the
programme size is fine. If it sits near 0.4, the programme is too big. **That is a measurement now
rather than an argument.**

## Finding 54, found while building this

| # | Finding | V | Needs |
|---|---|---|---|
| 54 | **`/bike` tells him he has ridden once.** Its Now tab calls `getRecentSessions('cycling', 10)`, which reads `health_session_detail` (ONE cycling row), so `RecentSessions` takes its `length <= 1` branch and prints "Nothing. This is the only one the watch has ever recorded." The watch holds **76 rides back to 2021-09-05**. The page is accurate about its source and wrong about his life. `/bike/log` now links to the real number, but the false sentence is still on the Now tab and removing it needs a ruling: the same component serves five surfaces | yes | R |
| 55 | The set counter on `/gym` ("Finish workout (0/29)") still mixes 17 spine sets with 12 optional, which is finding 34, unchanged by this work | yes | R |

## Three defects in the new pages, all caught by reading the rendered screen

None was caught by typecheck, lint, build, the validator suite or the 25-check probe. All five were
green on every one of the builds that carried them.

1. **`Farmer Carry 50x130` read as 130 repetitions.** It is 130 seconds. `gym_set` stores a number
   called `reps` and nothing recording which unit it is in. Fixed by looking up timed ids in today's
   programme; an exercise that has since left the file gets no suffix rather than a guessed one.
2. **`/bike/log` listed 2021 to 2026 with no year**, so two separate rides both read "Aug 12".
   `logDate` added, and `SessionLog` now counts the distinct years in its own rows and picks the
   format itself, so a list that crosses a new year starts showing years without anyone noticing.
   `shortDate`'s own doc claimed "the year is never in question on the windows this site draws";
   that premise is corrected in place rather than left to mislead the next caller.
3. **The same bug one level up:** the sentence "back to {span.first}" ran the 2023-04-24 span through
   `shortDate` and rendered "back to Apr 24", which reads as this April.

## What was built

| Path | What |
|---|---|
| `content\gym\migrate-sets-prescribed.mjs` | Adds `gym_session.sets_prescribed`, backfills nothing, and says why in its header |
| `src\lib\gym\log.ts` | `getGymLog`, `getSetsForDates`, `getWatchLog`, `countWatchLog`, `watchLogSpan` |
| `src\lib\gym\db.ts` | `upsertSession` stamps the prescription, computed SERVER-side from the day key so a stale tab cannot supply one |
| `src\components\training\SessionLog.tsx` | The shared row list. `log-*` class names, never `.ex` or `.exgroup-n` |
| `src\app\gym\log\page.tsx` | Two tiers, labelled, rows expandable into every set |
| `src\app\run\log\page.tsx` | 318 sessions, treadmill and outdoors, back to 2019 |
| `src\app\bike\log\page.tsx` | 76 rides back to 2021, and it states that the app's own record is empty |
| `src\app\gym\page.tsx` | Last 5 below the workout, above the note box |
| `src\lib\format.ts` | `logDate` |

## Still not done from D7's own spec

- **`/swim` gets no new link.** `/swim/deep` already is this, and it is the pattern the other three
  copied. Left alone deliberately.
- **`/health` gets nothing.** Its "last ten lifts" still reads the watch table rather than
  `gym_session`, so the index and `/gym/log` count different things. Not touched because it is a
  ruling, not a bug: the index arguably SHOULD show the watch's view.
- **No pagination.** `/gym/log` reads the 60 newest watch sessions of 698 and says so on screen. The
  other 638 need either pagination or a stated decision not to show them.


---

# STATUS, end of 2026-08-27

Everything below is live on `https://hoodii.studio`, commit `90303ef`, production READY on that SHA,
every page read at 390px on the real domain.

## Fixed, 17 of the 55

| # | What | How |
|---|---|---|
| 14, 15, 16 | Three `why` lines contradicting their own source on arm and calf frequency | Corrected to what the evidence file says |
| 24 | The `$comment`'s self-audit was false three ways and named "rotator cuff", not a block since the bands moved | Rewritten to the audited truth |
| 28 | "EVERY BLOCK IS A SUPERSET" three lines above the exception | Now "EVERY BLOCK IS A PAIR, and 22 of 25 are supersets" |
| 29 | "the only partner that is not a dumbbell". Four are. Written this morning | Corrected, and it names the four |
| 30 | Rule 3's "All five" counted only its compliant cases out of eleven | Corrected, and it names the three whose rep count never moves |
| 31 | Rule 2's "needs no floor", broken nine times | Corrected, and it names all nine plus the Copenhagen on a bench |
| 32 | "he never walks back to the dumbbells" | Corrected: three loads still travel to the cable stack |
| 33 | **"Warmup (4 min)" was the count of warmup exercises** with a time unit welded on, every load | Now "(4 exercises)". No durations invented |
| 35, 47 | The streak on `/gym`, and the 349-character explanation added to it | Both deleted. It lives on `/health` |
| 39 | **No session history existed.** `gym_session` written since 2026-05-25, displayed by nothing | Last 5 on `/gym`, plus `/gym/log`, `/run/log`, `/bike/log` |
| 40 | Two records disagreeing 3x with nothing reconciling them | **Answered.** See below |
| 41 | `gym_session` minutes unreliable (330 on one row) | The log prefers the watch's minutes and never prints the page timer as duration |
| 46 | The note box instruction paragraph, 201 chars | Deleted |
| 51 | Three years of history invisible | `/gym/log` reads 679 dates across both records |
| 53 | My own error: I read `AGENTS.md`'s cycling claim as a statement about total history | Retracted. It is accurate about `health_session_detail` |
| new | **An em dash on his screen**, from four historic `day_title` values in Postgres | The label is derived from the live programme by day key. `lint-prose` cannot see data |
| new | `streak` passed into `GymClient` and read by nothing, the `rir` shape again | Prop, type, import and one Neon round trip removed |

## What finding 40 turned out to be

`/gym/log` shows **31 of the 120 rows have no sets at all**: lifting sessions the watch recorded at 83
to 128 minutes that the app never saw. Combined with the 2026-08-16 row (68 watch minutes, one set
logged), the answer is that **the app's record is incomplete, not that he fails to finish sessions.**

The prescription question is now measurable rather than arguable: every session from today stamps
`sets_prescribed`, so within a fortnight the days he DOES log will show a real ratio.

## Still open, 38 of the 55

**Needs a ruling from him:** the eleven rule-1 pairings (1 to 13), day size (17), the whole sourcing
contract and three unverifiable citations (18 to 23), the EZ preacher curl (25), the glute bridge on
four days (26), the spine-versus-optional set counter (34), plate inventory (38), the cue volume and
the text ceiling (44, 45, 48, 49, 50), the RIR guide (50), `bike_ride` being empty (52), and `/bike`
still saying he has ridden once (54, 55).

**Plain bugs: three of the four are now done** (commit `5d2e27f`). `dayTimeBreakdown` and the whole
session-time model are deleted (36). The notes count is read from the database and the 20-row cap is
disclosed when it bites (37). The trend sparkline says "over the last 8" and its aria-label agrees
(42). Still open: `roundLoad` can print "+5 lb" for a 7.5 lb jump if a non-multiple-of-5 weight ever
becomes a working weight (43), latent and not currently firing.

**And one that was neither a bug nor open: P1-1.** `/gym/api/plan` never forwarded `rangeWidth`, so
the entire per-exercise ladder fix of 2026-08-22 was dropped in the middle and every suggestion used
the default of 2 for five days. Fixed and proven on one build: DB Bench Press now says "build to 9"
where it said "build to 8". check-ladder still reports 9 because it reads the file's intent, and those
nine exercises have no `rangeWidth` to forward; giving them one means a 12-to-23 rep range, which is a
ruling.

**Decisions 1 to 6 are untouched.** Nothing shipped today pre-empts any of them: no exercise moved,
no pairing changed, no set or rep count changed.


---

# FINDING 56: "LIGHT" DOES NOT MEAN LIGHT, and it is the strongest finding of the day

He asked, reading the page: *"on leg days i see the word light as in they are light lifts? is that
correct why are we having light lifts on leg day"*.

**Verified against the live plan API, not reasoned about:**

| Block | Prescribed | The app suggests |
|---|---|---|
| Lower B, "Main Lift: Romanian Deadlift" (heavy) | 4x6 | **185 lb x 6** |
| Lower A, "Second Pattern: Hinge, light" | 2x8 | **185 lb x 8** |

**The same weight, and the light day asks for MORE reps.** 185 x 8 is harder per set than 185 x 6.
The "light" day is the harder day per set, and the only thing that is lighter about it is that it has
two sets instead of four.

**His own log proves he cannot do it.** On 2026-08-20, the light day, he lifted 185 x 6 and 185 x 5,
against a prescription of 2 x 8. He was working at the heavy day's weight because that is the weight
the app gave him.

## The cause, in one line

`getLastSession(exerciseId, beforeDate)` in `src\lib\gym\db.ts` keys on **exercise id alone**.
`romanian-deadlift` is the same id on both lower days, so both read one history and produce one
working weight. Only `targetReps` differs, and the light day's is higher.

## And it feeds back the wrong way

Double progression adds weight when every set reaches the top of the range. The two days have
different ranges off the same history (6 to 8 heavy, 8 to 10 light). So a good light day at 2 x 8
satisfies the HEAVY day's top of range and adds 5 lb to his 4 x 6, from two sets. This is a plausible
mechanism for the stall-and-drop pattern the file records on the overhead press, and it is testable
against his log rather than a theory.

## "Squat light" is a different case and is fine

Lower B's light squat is a `front-squat`: its own exercise id, its own history, its own progression.
It genuinely is a lighter lift than a back squat. Only the HINGE pair shares an id.

## What the design was supposed to be

Pelland 2025, in the evidence file and checked: strength rises with frequency **at matched volume**.
The intent was one heavy and one light exposure of each pattern per week, same weekly volume spread
over two days. The intent is sound and sourced. Nothing implements the "light" half.

## THIS NEEDS A RULING. Four options, none of them applied

| Option | What it does | Cost |
|---|---|---|
| **A. Make it a percentage of the heavy day** | The light block asks for a set fraction of the heavy day's working weight, say 80%, computed and shown. `suggest` would take a `loadFactor`. Gated, checkable | The only option that makes "light" mean what the word says. Needs a number from him, and one more field |
| **B. Give it its own exercise id** | `romanian-deadlift-light`, its own history and ladder, exactly like the front squat | Simple, uses machinery that already works. Splits the history: the ladder restarts, and 11 logged RDL sessions stop informing it |
| **C. Drop the light hinge** | Lower A loses a block. One heavy hinge a week, and the frequency argument for the hinge goes with it | Smallest file. Contradicts the twice-a-week rule the whole 2026-08-16 rebuild was built on |
| **D. Rename it, claim nothing** | "Second hinge, two sets". No load claim, so nothing to be false | Free and honest today. Leaves the progression cross-feed in place, which is the part that can actually cost him a lift |

Note that D does not fix the feedback problem and A, B and C all do.
