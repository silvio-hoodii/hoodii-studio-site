---
moved: 2026-10-18, verbatim from AGENTS.md, which now points here. Not re-audited beyond the dead paths fixed that day.
---

# Gym: the gates, then co-building with him

## The /gym row (moved from the routes table in AGENTS.md)

| Route | What | Writes gated |
|---|---|---|
| `/gym` | Lifting log + a note box, and lifting ONLY since 2026-08-27. **TWO FULL-BODY SESSIONS SINCE 2026-10-11, Session A (key `fa`, Mon and Thu) and Session B (`fb`, Tue and Fri), alternating: whatever the day, the next one is the other one. Three sets minimum on every exercise and about 90 minutes, his rulings that day ("why are there exercise of 2 sets thats a waste of time make ot 3 at leats"; "dont care about 80 or 90 if its a good enough program and reliable").** `goal.keep` in program.json lists what he asked for and validate.mjs refuses a week missing any of it. The four-session week of 2026-10-04 (`l1` `u1` `l2` `u2`) was an agent's call, never trained; his words on it: "I don't remember asking for any of this". A Free tab logs anything off-plan and never moves the rotation. **Passing the gates is not a good week**: show him the per-muscle table and an adversary's findings, never test counts. His binding rules: legs and glutes first, 80 minutes max, four lifting days, pairs, chest in the week, no calf raises, swim after, form over heavier, posture, stay athletic, step-ups. Old rows keyed `a`/`b` (Session A and B, 2026-09-06 to 2026-10-04) render by their stored title. The rotation starts on `ROTATION_SINCE` in `src/lib/gym/program-shared.ts`. Before that, TWO SESSIONS, A AND B, from 2026-09-06 on his word ("Just ship"), with the week frozen: `content/gym/program.json` carries `goal` (his words) and `frozen` (a structural hash `validate.mjs` refuses to let drift without his quoted words). Session C was folded into A and B; the calf raise is gone; the barbell bench is a tracked main lift again. Read `HealthOS/knowledge/PROPOSAL-2026-09-06-WHY-THREE-MONTHS-GOT-NOWHERE-AND-THE-FIX.md` before proposing any change to the week: it holds his five rulings, the log evidence (he completes 52.7% of prescribed sets and skips rather than improvises), and his ruling on gates, that a gate may enforce his rulings, his gym's layout and code correctness, and may never enforce a paper. The per-muscle gate and the per-lift strength gate are both gone and are not coming back. Lifting log + a note box. The notes are READABLE from the page as of the same day, collapsed at the bottom with the count of unanswered ones in the summary; `gym_note` was write-only from the web before that. `content/gym/` + `gym_*` tables | yes |

## The gym gates (moved from Commits and deploy)

- **Touching `content/gym/program.json`? Run `node scripts/check-ladder.mjs`.** It reads his real
  working weights out of Neon and asks one question of every logged lift: does maxing out the rep
  range actually earn the next weight? Double progression is a ladder, and a rung that cannot be
  reached from the one below means the app asks for a jump he fails, drops back from, and repeats.
  On 2026-08-22 eight of fifteen lifts were in that state, all dumbbell or cable, and it is why the
  overhead press was the only main lift flat all year: at 65 lb, three sets of ten banks an
  estimated max of 86.7 and the jump to 70 demands 88.7. Fixed by a 2.5 lb increment on the cable
  stack (evidenced by the 72.5 and 87.5 he has logged on it) and a per-exercise `rangeWidth` on the
  dumbbell lifts. It cannot live in `validate.mjs`, which is offline by design, so it runs inside the health sync
  (`run-health-sync.ps1`, started by an agent after each export) and `check-ladder.mjs` finishes it: the check depends on his current loads and can break with no file edited.
- **`.ex` ON /gym MEANS AN EXERCISE, and nothing else may answer to it.** `scripts/probe-gym.js`
  selects it to find the day's cards. On 2026-08-27 a notes block reused it and **all 22 tests
  passed** while the harness's `cardNames()` went from 10 entries to 28, because `wholeDayIsShown`
  compares that count against itself. Third borrow on this surface after `.tab`/`.surf-tab` (17
  failing tests) and swap-revert/swap-toggle, and the first two were each "fixed" with a comment
  saying not to do it again. `exSelectorMeansExercise` is the gate now: every `.ex` must carry
  `data-slot`. A shared look is a CSS decision; a shared class name is an API.
- **Touching `/gym`? Run `node scripts/gym-notes.mjs` FIRST.** There is a note box at the bottom of
  the workout, added 2026-08-16 at his request, and it writes to `gym_note`. It is the only place
  the app records anything in his own words: everything else is numbers typed into boxes, and a
  number cannot say "the racks were taken" or "my knee felt off". Act on what is there, then
  `node scripts/gym-notes.mjs --handled <id>`. The kitchen already learned what happens otherwise:
  a captured question nobody answers is worse than no capture, because he stops believing the box
  does anything.

  **That command also prints the `open` questions and exits non-zero on an overdue one.** See the
  co-build section below.
- **A PARTNER EXERCISE CARRIES `whyHere`, AND IT MAY NOT SAY ANYTHING NEW.** `validate.mjs` requires
  the last exercise of every block to have either a `whyHere` or an `open` question, and refuses a
  `whyHere` that is not a **verbatim span of its own block's `why`**, first-character case aside.

  **The failure it fixes was REACH, not reasoning, and that distinction is the whole design.** Five
  of his eighteen gym notes ask a version of "why is this here" (#6 #8 #9 #13 #17), and every
  exercise they name resolves to **eleven placements, all at partner position 2, not one a lead
  lift**. The answer was already there: `why` is required on all 24 blocks, is rendered, is backed by
  61 KB of sourced evidence in `HealthOS/knowledge/training-programme-evidence.md`, and **names the
  questioned partner in 10 of those 11 cases**. It shipped on 2026-08-16 for exactly this complaint.
  He then asked five more times over the next nine days, because the block heading said "Main Lift:
  BB Row", the control said "Why this is here", and he was looking at a calf raise in position 2.
  Nothing told him the tap would explain the calf raise.

  **A fix can ship, validate, render, and still not reach him, and every gate will call that done.**
  An agent handed "explain the programme better" writes more reasoning. There was already more
  reasoning than he had ever seen.

  **Why the verbatim-span gate and not a free-text field.** Note #12, eight days after the others:
  *"Walls of text again why do I need all this, just leave the cue and thats it, it can even be
  hidden"*. A per-exercise prose field is exactly how that wall comes back one honest-looking clause
  at a time, invisible in any diff review. Text that is not already in the accepted `why` does not
  compile. Measured at 390px on the shipped build: 4 to 6 clauses a day, 164 to 246px, **2.1% to
  3.2% of the page, nothing longer than three lines.** Re-measure if you touch it; do not estimate
  it from the source.

  A partner whose block `why` does not explain it **does not get a reason invented for it.** It gets
  an `open` question, which is the honest state. Three currently do.
- **`content/gym/validate.test.mjs` is that validator's regression suite, and `scripts/verify.mjs`
  runs it.** Ten cases; each mutates a copy of `content/gym` in a temp directory and asserts the real
  validator refuses it. **A gate that has only ever been seen to pass has not been seen to work**: it
  may be matching nothing. This one earned its place on its first run by catching a hole in the gate
  it was written to cover, which normalised the first character's case in one direction only. It is
  in `verify.mjs` and deliberately NOT in `pnpm build`: it spawns ten processes and copies a
  directory ten times, which belongs in what a person types before pushing, not in the deploy path.
- **AN OPEN QUESTION FOR SILVIO LIVES ON THE THING IT IS ABOUT.** An `open: [{q, asked, due}]` array
  on an exercise in `program.json` or a station in `equipment.json`. His ruling, 2026-08-27, chosen
  over a separate unknowns file: the question goes where the next agent is already reading.
  `validate.mjs` gates the shape; **`scripts/gym-notes.mjs` surfaces every one and exits non-zero
  past `due`**, which is the command AGENTS.md already requires before any `/gym` edit. It is not in
  the validator because a due date that turns the build red overnight with no file edited would
  block an unrelated deploy, the same reason `check-ladder.mjs` is not in there.

  **The failure it exists to stop:** the farmer carry had three contradictory answers live in the app
  for five days, the card saying 40 reps, his note saying seconds, the cue saying count steps. A
  2026-08-22 audit had already concluded it was *"a decision to put to Silvio, not to invent"*. Nobody
  put it to him. Put as three options with the cost of each, he answered in one word and it shipped
  the same hour. Cost to him: seconds.
- **Adding a POST route under `/gym/api`, `/swim/api` or `/bike/api`? It must go in `WRITE_ROUTES` in `scripts/probe-gym.js`.**
  Nothing is optional about this: the probe drives a real browser against the real Neon store, and
  an unstubbed write route means a test posts into his actual training log. `/gym/api/note` was
  added without it and the first probe went out over the network. `scripts/lint-probe-routes.mjs`
  now fails the build on it, so this is a description of a gate rather than a thing to remember.
  That linter hardcoded ONE directory until 2026-08-26, when the baseline write moved to
  `/swim/api/baseline` and would have left its scope silently. It walks a list of API roots now, and
  `src/proxy.ts` needed TWO edits for the same move: the path-prefix check AND `config.matcher`,
  which named no `/swim` path at all. A prefix added without the matcher reads as a gate and is none.
  **That was demonstrated rather than asserted on 2026-08-27**, when `/bike/api` was added: with
  the prefix present and the matcher entry deleted, an unauthenticated POST reached the handler
  and returned 400 from the route instead of 401 from the gate. Do the same to any new prefix.
- **Touching `/gym`? Run `node scripts/run-probe-gym.mjs <base-url>` as well**, and the reload pair
  with `node scripts/run-probe-gym.mjs <base-url> swapSurvivesReload`. Together that is 24 checks;
  it exits non-zero on any failure. The four other gates are static: they all passed on a build
  whose swap control silently reset on every page load, whose logged sets then became invisible,
  whose write recorded one exercise's id next to another's name, and which opened on the wrong day
  the moment the first set of a session landed. Silvio found all of that by training with it. The
  probe drives the real interactions in a real browser and stubs every write, so nothing reaches his
  log. It is the only test on this repo that presses a button.

  **The driver is in the repo now because a gate nobody can run is not a gate.** `agent-browser`,
  which the probe's header documents, hangs on this machine, so for two sessions the probe was
  driven by a throwaway script rewritten from scratch each time. On 2026-08-21 one of those opened a
  background tab, and Chrome fires no focus or blur events for a document without system focus:
  `el.focus()` moved `document.activeElement` while emitting no `focusout`, React's delegated
  `onBlur` never ran, and five write-path tests reported zero writes. That was written up as "the
  repo's only interaction test is dark on the write path" and queued as its own session. **The app
  was correct the whole time.** `run()` now measures whether the page can produce a blur at all and
  refuses to run rather than blaming the app, and `run-probe-gym.mjs` sets
  `Emulation.setFocusEmulationEnabled`. Verified both directions on one build: 5 failed without the
  flag, 0 with it.
- **`node scripts/gym-coverage.mjs` MEANS SOMETHING NOW, and it is in `verify.mjs`.** It exited 1
  on every run until 2026-08-27 and the handoff that shipped it said so and called that correct:
  11 of 16 muscles sit past the efficient zone and four exercises carry no source, all known. A
  light that is always red is not a light, and it could not get redder, so pushing a muscle BELOW
  its minimum dose would not have moved the exit code by one bit. It compares against
  `content/gym/coverage-baseline.json` instead, a dated snapshot of the three states nobody argues
  should be tolerated (a muscle under 4 fractional sets, a strict Zhang pairing, an unsourced
  exercise). Past-efficient is printed, never gated. Every run also prints which muscles moved and
  by how much since the baseline was stamped, which is how a pairing change gets quoted as a number
  rather than as an intention. To accept a change: `node scripts/gym-coverage.mjs --accept`, which
  REFUSES while a regression is present unless `--accept-regression` is also passed.
- **The arithmetic behind it is `src/lib/gym/coverage.mts`, and `/health?s=volume` imports the same
  file.** That page is the answer to a question he asked three times and got a document for three
  times: "how all those 4 days add up to volume within one period?" The alternative was
  reimplementing fractional sets in the page, which is two implementations of one computation, and
  they drift while both keep printing plausible numbers. It is `.mts` so node runs it with no build
  step; `tsconfig.json` carries `allowImportingTsExtensions` for it, because Turbopack resolves the
  literal path and will not rewrite a `.mjs` specifier to `.mts`.
- **`inProgramme` IS GONE FROM `movements.json` AND MAY NOT COME BACK.** All 103 variants carried
  it and nine were already wrong the day the file shipped, because that morning's rebuild edited
  `program.json` and never touched the flags. `gym-catalogue.mjs` derives the `*` marker now, and
  `validate.mjs` fails the build on the key's return with a regression case behind it. Same disease
  as the body-metrics and immigration copies: every copy of a fact is a fact that goes stale
  silently.
- **A SLOT MAY NOT DISAGREE WITH THE CATALOGUE ABOUT WHERE IT IS DONE.** Until 2026-08-27 nothing
  compared `program.json`'s per-slot zone and station against `movements.json`, so any slot could
  claim any placement. Four disagreed. One was load-bearing: Thursday's calf raise carried
  `station: null` while the catalogue correctly put it on the calf machine, and that null was the
  only reason a leg-curl-machine plus calf-machine block passed the one-station rule. **The block
  passed because the data lied.** The rule is derived rather than a new field: a catalogue station
  means the slot must name it in that zone, and a null station means the slot must be null too while
  its ZONE is free, because a thing that holds no fixture is carried to whatever lift it partners.
  That last clause is the old unmodelled "traveling dumbbell" convention, now executable. Two
  regression cases cover it.
- **AN ALIAS MEANS THE SAME JOB, NOT THE SAME FIXTURE.** Three alts were aliased onto a variant that
  stands somewhere else: a seated lateral raise holds the bench, a side plank is on the floor where
  the Copenhagen it pointed at holds the bench, and a banded straight-arm pulldown anchors to a rack
  post while the cable version is at the high pulley across the gym. All three are their own
  variants now. If the placement gate fires on an alias, the answer is a new variant, never a
  changed slot.
- **`node scripts/gym-catalogue.mjs --fill` is the tool for the partners work**, and `--pairing` is
  not. `--pairing` asks whether an existing pair costs a walk, and as of 2026-08-27 the answer is
  none: every pair in the week is already legal. His complaint is the other shape, ten blocks that
  are a single lift with nobody in the rest, eight of them `main` lifts on two or three minutes.
  `--fill` lists what could ride in each, filtered by the validator's own one-station rule and
  Zhang's no-shared-muscle rule, **with the price attached**: an option already in the week shows
  which block it would move out of and both rest lengths, because moving work from a 45s rest into a
  3 min rest is the entire point; anything else shows what it would do to that muscle's weekly sets.
  It imports `src/lib/gym/coverage.mts` rather than counting sets itself.
- **`--pairing` compares STATIONS, not zones**, and reads the SLOT rather than the catalogue for
  what is already prescribed. It also skips `sequence` blocks, which are two exercises done in turn
  by definition. Each of those three was a batch of false findings. It compared zones until 2026-08-27 and printed the
  results under the word "station", which made it recommend the exact three swaps that had been
  tried and reversed that same hour (cable lateral raise behind the seated row, cable curl behind
  the pushdown, reverse pec deck behind the machine shoulder press). All three fail `validate.mjs`.
  A tool that suggests work the gate will reject is worse than no tool: the suggestion is free and
  the rejection arrives after the work is done.

## CO-BUILDING WITH HIM, rather than designing for him

His ask, 2026-08-27: *"whenever i let the agents design we still have shortcomings so lets come up
with a way to co build it"*. This is that protocol. Four rules, each with the mechanism named, per
the meta-law in `.agents/ENGINEERING.md`: **a rule that does not execute is decoration.**

**1. Agents author MECHANISM. He authors JUDGMENT.** The kitchen's rule, transplanted. `AGENTS DO
NOT WRITE COOKING STEPS` was written 2026-08-09 after a dish that had passed a six-source
cross-check burnt anyway, because **all four failures came from a sentence an agent wrote and none
from a figure a source gave.** The gym produces the same shape of defect.

| An agent may author | Only he can author |
|---|---|
| Arithmetic, unit consistency, gates, validators | What is actually in the gym, and where |
| Evidence lookup and verbatim quotation from a source | How much time he really has that day |
| Rendering, refactors, migrations | Whether a cue he read at the machine actually worked |
| **Drafting a cue from a source**, including rewriting one for a new implement | |
| An option set with the cost of each attached | Whether a reason is legible where it appears |
| Anything a test can prove | How much text is too much |

*Mechanism:* `validate.mjs` refuses an exercise with no `cue`, `station` or `zone`, and refuses a
`whyHere` that is not a verbatim span of an accepted `why`. Agent prose in a judgment field does not
compile.

**THE CUE ROW MOVED ON 2026-08-30, and it moved because he pushed back on it.** It read "what a cue
must say to be followable" in HIS column, and the consequence was that six of eighteen parked
questions were variants of *"THE CUE STILL DESCRIBES THE OLD IMPLEMENT. Read it and say what it
should say."* His answer: *"why are you asking me this? you are the one that should find out"*, and
on the next three, *"same answer"*.

He is right, and the rule was transplanted from a place it does not fit. The kitchen's
`AGENTS DO NOT WRITE COOKING STEPS` exists because agent-written steps burnt a dish: all four
failures came from a sentence an agent wrote, none from a figure a source gave. **A gym cue that
names the wrong implement is not that.** It is research an agent can do from a published source and
did not do, and handing it back to him is asking him to do the agent's job in his own gym time.

The line is now between DRAFTING and REPORTING:

- An agent drafts a cue from a source, and labels it a draft until he has used it.
- Only he can report that a cue did not work at the machine, which is a fact about his body in that
  moment and cannot be looked up. The Pallof's *"feels weird no idea on how form should be"* and the
  success test that needed a second person are both that, and both stay his.

An `open` question with `topic: "cue"` is therefore almost always a smell. Draft it, ship it, and ask
him what broke.

**2. Judgment calls get batched into ONE pass, with costs, before anything is written.** Not buried
in prose: a real question with real options and the consequence of each. The farmer carry proved it
(see the `open` bullet under Commits and deploy): five days of three contradictory answers, then one
word from him and a same-hour ship.

**3. Every ruling is written where the thing lives, and he is never asked twice.** An unanswered
question is an `open` row on the exercise or station. An answered one is deleted and the answer
written into the `why`, the `cue` or `equipment.json`, dated, with the note number. *Mechanism:*
`gym-notes.mjs` prints every `open` row and exits non-zero past its `due` date.

**4. The pairing session has a fixed shape, so it does not become an audit.** An audit produces a
document. This produces a decision and a shipped change.

```
1. READ    gym-notes.mjs --all, program.json's $comment, and the block the notes point at.
           NO PROPOSALS YET.
2. LOCATE  which KIND of failure this is (table below). If it is a new kind, say so.
3. ASK     one batch of judgment calls, options plus costs, in his words not a field name.
4. BUILD   only what he ruled on. All the gates. Screenshot at 390px and LOOK at it. Ship.
5. CLOSE   mark the notes handled, write the ruling where the thing lives.
```

**Step 2 is the one that is new, and it is what stops the session becoming another redesign.** The
taxonomy, from all eighteen notes as of 2026-08-27:

| Kind of failure | Notes | What the work actually is |
|---|---|---|
| Placement unexplained at the point of asking | #6 #8 #9 #13 #17 | **Reach, not reasoning.** The answer usually already exists |
| Equipment reality an agent could not know | #14 #15 #16 #18 | Ask him, then write it into `equipment.json` |
| Unit guessed instead of declared | #5 #19 | Three options with costs; he rules |
| Time budget assumed, not asked | #2 #7 #11 | 40 minutes is the real constraint on at least three days |
| Form and feel, which only he can report | #3 #4 | Cannot be derived. Only he has the instrument |
| Volume of text | #12 | The counterweight to the five at the top. Measure at 390px |
| Improvisation the app did not offer | #10 | The app was missing an option, not wrong |

**THE LAST ROW WAS THE WHOLE TABLE, and it took twelve days and six notes to see it.** #10 became
#28, #50, #52, #54 and #55, always the same complaint: a main lift alone on a two or three minute
rest. Every answer was an agent choosing a partner and writing it into `program.json`, and #52 is
what that gets when the agent chooses differently from him: *"And we regressed to having a hanging
knee raises with a lat pill down wtf os this"*. His standing ruling, 2026-08-29, went unactioned for
six days: **"IN GENERAL I DONT WANT SOLO LIFTS OTHER THAN THE MAIN ONE."**

**Since 2026-09-05 he fills a rest himself, on the card, at the rack.** `src/lib/gym/fill.ts`
computes the legal partners for every solo block against `content/gym/pairing-legal.mjs`, the one
implementation of his pairing rule that `validate.mjs` now also calls. Sets land in `gym_set` with
`fill_for` naming the lead lift, so what he improvises is DATA the next session can read instead of
four sentences in a note box.

**Only ONE pairing went into the week, and the difference is the point.** #54 carries the word
"again" and is the third time he asked for knee raises in the RDL's rest (23 Aug, 3 Sep, 4 Sep):
a standing request, so it is prescribed. #55 records what he did on one evening; the step-back lunge
was tried in the week, the per-lift strength gate (deleted 2026-09-27) went red because a second unilateral squat moved five leg
lifts 33.5 fractional sets further past the strength optimum, and it came back out. **Reading a
record as a request is the reflex behind 53 commits to `program.json` in 24 days and 22 reversals.**

**Three tools carried three copies of that pairing rule and one had drifted.** `gym-catalogue.mjs
--fill`, the tool this file names for the partners work, implemented cases (a) and (b) of his
2026-05-23 rule and skipped (c), "adjacent equipment in arm's reach". `rack` and `rack-pullup-bar`
are declared adjacent, which is exactly what makes his own pairing legal, **so the tool built to
suggest partners could not see the one he asked for three times.** This file already records the
mirror image, that a tool suggesting work the gate rejects is worse than no tool. A tool that HIDES
work the gate allows is worse still: a wrong suggestion gets caught by the validator, and a missing
one reads as "there is nothing to pair with". `content/gym/validate.test.mjs` now asserts every
caller reaches the same verdict, in both directions, eleven cases.

**`check-ladder.mjs` and `validate.mjs` disagreed with each other for a week, and the lift stayed
broken in the gap.** The tool printed `"rangeWidth": 11` for `db-lateral-raise`; the gate refuses
anything above 8, with a source. Both were individually right. The engine handles it now: a lift
whose next rung is not earned by its own rep range holds at the top for a SECOND session before
taking it (`RUNG_NOT_EARNED` in `src/lib/gym/progression.ts`), which is the fix `validate.mjs`
already named in its own failure message. The tool no longer recommends what the gate refuses, and
the test suite asserts the two caps agree.

**`formerIds` DOES SOMETHING NOW.** It was added 2026-08-29 so a renamed slot could say what it used
to be called, was declared in the validator and reported by `check-ladder.mjs`, and **was read by
nothing at progression time**: it silenced the warning without fixing the card. The 2026-09-03
rebuild then deleted every use of it from `program.json`, so `single-leg-rdl` had 21 sets at 40 lb
that the app could not see and the card would have read "First time". Restore an id or declare it;
`equivalentIds` follows both.

**"Done" has to mean it changed what he knows, not that it was rendered.** The block `why` was
required by a validator, present on all 24 blocks, named the questioned exercise in 9 of 11 cases,
was backed by 61 KB of sourced evidence, and shipped specifically to answer this complaint. He asked
the same question five more times over nine days. Nothing was broken. **The note box is currently the
only instrument in this system that measures reach, which is why an unanswered note is worse than no
note box at all.**

