# The gym programme: everything still open, as questions you can answer inline

Reply to this email under each ANSWER line. Short is fine, one word is fine, "leave it" is fine.
Nothing below has been done. The full audit with the evidence for every claim is at
`C:\Users\sneyr\Desktop\HOODII\hoodii-studio-site\docs\GYM-AUDIT-AND-PLAN-2026-08-27.md`.

---

## THE ONE NUMBER TO READ FIRST

The programme quotes your goal in its own header: **"I don't want to lose track of my main lifts."**

Weekly sets, counted from the file:

```
  12  DB Reverse Fly            partner
  12  DB Lateral Raise          partner
   9  Dead Bug                  partner
   8  Single-Leg Glute Bridge   partner
   6  Romanian Deadlift         MAIN LIFT
   6  Standing Calf Raise       partner
   4  BB Back Squat             MAIN LIFT
   4  DB Bench Press            MAIN LIFT
   4  BB Row                    MAIN LIFT
```

**Rear delts get three times the weekly volume of your back squat.** The four largest exercises in
the programme are all partners and not one is a main lift.

How it happened, and no single step was crazy:

```
goal: don't lose the main lifts
  -> each pattern twice a week      sourced, and it checks out
  -> more blocks                    arithmetic
  -> "just pair everything"         your instruction, 2026-08-22, for a good reason
  -> every new block needs a partner
  -> a partner must hold no fixture (your gym, and it is true)
  -> so: dumbbell isolation and floor holds
  -> 41 sets a week of that, against 4 of back squat
```

Step three is the multiplier. It was asked for because one-exercise blocks kept making you ask why
they were there. Nobody counted what it would cost.

---

# BATCH 1: what the programme is for

### 1. Is the goal still "don't lose the main lifts while the weight comes off"?

Everything else depends on this. If the goal has changed, most of the questions below change with it.

ANSWER:

### 2. What should a session actually be?

Today: Lower A 29 sets, Upper A 42, Lower B 35, Upper B 42. Your watch says you train 60 to 130
minutes. There is no version of 42 sets that fits 40 minutes.

    a) ~16 sets, 5 blocks, finishable in 45 minutes
    b) keep the size, mark the spine clearly so what is optional is obvious
    c) something else, say what

ANSWER:

### 3. Why light days exist, and whether you want them

The intent is sourced and holds up: strength rises with frequency at matched volume, so 6 squat sets
split 4 and 2 over two days beats 6 in one. The light day is meant to be the same weekly volume, in a
cheaper half.

That is not what happens. Verified against the live app:

```
  Lower B  Main Lift: RDL     prescribed 4x6   app suggests 185 lb x 6
  Lower A  Hinge, LIGHT       prescribed 2x8   app suggests 185 lb x 8
```

Same weight, more reps. **The light day is the harder day per set.** On 2026-08-20 you got 185x6 and
185x5 against a prescription of 2x8, because the weight you were given was the heavy day's weight.

Cause: both days share one exercise id, so they share one history and one working weight. Worse, a
good light day at 2x8 satisfies the heavy day's rep target and adds 5 lb to your 4x6, from two sets.

    a) make it a real percentage of the heavy day (you pick: 80%? 70%?)
    b) give it its own exercise id and its own ladder, the way the front squat already works
    c) drop the light hinge, one hinge a week
    d) keep two exposures but make them two DIFFERENT lifts, like the squat already does

ANSWER:

---

# BATCH 2: which exercises are in it

### 4. The ten partner slots that work a muscle the lead lift already uses

Including BB RDL with a glute bridge (both hip extension), back squat with the same, BB Row with dead
bugs (a bent-over row is the biggest trunk brace in the week).

    a) cut only the three on heavy lifts: 7 sets out of the week
    b) cut all ten: 26 sets out of the week
    c) keep them and stop claiming a physiological rule for them

You leaned toward (a) before we stopped. Confirm or change it.

Note: cutting a partner leaves a one-exercise block, which your own "every block is a pair" rule
forbids. That rule needs an exception for main lifts either way.

ANSWER:

### 5. The glute bridge is on all four days

It went from 2 places to 3 to 4 across three unrelated commits, each locally justified as cheap
rest-gap filler. No file anywhere says "it belongs on every day" and nobody ever decided it. You asked
why it was there on 2026-08-25 and the answer was two more copies of it.

    a) once a week    b) twice    c) leave it on four    d) cut it

ANSWER:

### 6. The EZ preacher curl

On 2026-08-15 you asked for the EZ bar as a **swap option** on the DB curl card, in a note about
alternatives being too thin. The next commit created a zone, a station and the exercise, made it the
**lead** of Friday's block, and demoted the DB curl you were asking about. The commit message never
mentions biceps. Nothing in this workspace has ever compared a preacher curl to a standing curl.

    a) put it back as a swap, DB curl leads again (and add the cable curl you also asked for)
    b) cut the biceps block: biceps still get two exposures from the hammer curl
    c) leave it

ANSWER:

### 7. Upper A's pushup primer, which I added today

You said Upper A was the only day with no primer, and I copied Friday's. Its partner is the glute
bridge, and the card says "a pushup uses nothing below the waist" while the pushup's own cue says
"squeeze your bum and your stomach". Pushups before a DB bench press also pre-fatigue the same
muscles, which is the opposite of why jumps go first on lower days. You accepted that knowingly.

    a) keep it    b) different primer, not a pushup    c) remove it and remove Friday's too

ANSWER:

### 8. The RIR guide

Still on the page, folded, last item before the note box. It was kept on purpose when the dead `rir`
column was dropped, on the argument that teaching what reps-in-reserve means is useful even if
nothing records it. You thought it had gone.

    a) keep it    b) cut it

ANSWER:

---

# BATCH 3: the text

### 9. A ceiling on text, with something that enforces it

Right now every text rule in the gym is a MINIMUM. Three of them, all forcing text longer. Nothing
anywhere refuses a string for being too long.

Current: 50 exercise cues totalling **29,325 characters**, average 587, longest 1,212 (DB Bench
Press). They are folded behind "How to do it", so they do not show unless tapped.

Proposed caps, gated in the validator. Change any number or reject the idea:

```
  whyHere                   120 chars   (longest today 145)
  block why                 400 chars   (longest today ~900)
  exercise cue              700 chars   (average 587, longest 1,212)
  any always-visible string 120 chars
```

The cue cap is the real question: they are long because you were a beginner in May. If they are
noise now, that is a different programme than if they are still doing work.

ANSWER:

### 10. "0/29 sets"

Monday's 29 is 17 spine sets plus 12 optional, and the number says nothing about which.

    a) count only the spine    b) show "17 + 12 optional"    c) leave it

ANSWER:

---

# BATCH 4: sourcing

### 11. Do you still have the Motion Blueprint guide?

Nine citations in the programme rest on it, and they are the only basis for the pushup primer on both
upper days, the leg curl, where the calf raise sits, and the "eight core patterns" claim behind the
Pallof press. Its entire trace in this workspace is a log line saying a YouTube Short's page was
"thin (title only)" and a one-line digest summary mentioning a free 20-page guide.

If you still have that guide, dropping it in the repo settles five exercises at once. If not, they
have no checkable basis.

ANSWER:

### 12. The evidence contract

The programme opens with "if a decision here is not defensible from a row in the evidence file, it
should not be here". That file was last written 2026-08-16. The superset rebuild is 2026-08-22 and was
never sourced back into it. Two more citations cannot be verified either: Iversen 2021, which is the
sole basis for the whole superset design, and Nunes 2021, the sole basis for the overhead press slot.

    a) enforce it: the validator refuses a `why` that does not cite a real line
    b) retire the promise and stop claiming sourcing the file does not have
    c) rebuild the evidence file for everything after 2026-08-16

ANSWER:

---

# BATCH 5: smaller, still yours

### 13. `/bike` says "this is the only one the watch has ever recorded"

It reads a table with one cycling row. The watch holds **76 rides back to 2021**. The new `/bike/log`
shows the real number, but that false sentence is still on the bike page, and the same component
serves all five surfaces.

    a) fix the component to read the deeper table    b) leave it, the log link is enough

ANSWER:

### 14. The bike resistance form has never been used

`bike_ride` has zero rows. It captures the one thing the watch cannot see.

    a) keep it    b) remove it    c) it needs to be easier, say how

ANSWER:

### 15. Nine lifts still cannot reach their next weight

All dumbbell lateral raises, reverse flys, and the assisted pull-up. To progress, the rep range would
have to run 12 to 23, which is absurd. The real fix is a smaller weight step, which depends on what
your gym actually stocks.

    Are there dumbbells between 20 and 25 lb? And does the assisted pull-up stack move in less
    than 10 lb?

ANSWER:

### 16. Day size

Lower A 5 blocks, Upper A 7, Lower B 6, Upper B 7. The main-block count is derivable from the
twice-a-week rule. The accessory count (2, 2, 3, 2) is decided by nothing at all.

ANSWER:

---

## What is already fixed, so you do not re-report it

Farmer carry in seconds. The streak, deleted. The note box instructions, deleted. "Warmup (4 min)",
which was the count of warmup exercises with a time unit stuck on it. The 164-minute session model,
deleted. Ten false claims in the programme text. The two-table log, now one table. An em dash that was
reaching your screen from the database. The notes count, now real rather than capped at 20. The trend
caption, now "over the last 8". Session history, which did not exist: `/gym/log`, `/run/log`,
`/bike/log`, plus the last five on `/gym`. And the ladder fix from 2026-08-22 that had been silently
dropped by the plan API for five days.
