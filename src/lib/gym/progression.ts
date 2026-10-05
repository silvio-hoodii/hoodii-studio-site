/** Double-progression engine. Pure functions, no I/O.
 *
 * Direct port of HealthOS server/progression.mjs: the algorithm itself is unchanged, only the
 * language. See that file's own comments (kept below) for the reasoning; this is not a redesign.
 *
 * Rep range = [targetReps, targetReps + rangeWidth], default width 2.
 *   Hit top on all working sets  -> +increment, reset to bottom reps
 *   Anything below top           -> hold weight, build reps toward top
 *
 * No auto-deload from a single session in v1: a deload is a MULTI-session stall signal (see the
 * 3-session check below), and one bad day never triggers it.
 */

export type ExerciseType = 'weighted' | 'bodyweight' | 'timed';

export interface SetRecord {
  weight: number | null;
  reps: number | null;
}

export interface LastSession {
  date: string;
  sets: SetRecord[];
}

export interface PlanInput {
  targetReps?: number;
  type?: ExerciseType;
  increment?: number;
  /** Width of the rep range above targetReps. Default 2. See RANGE_WIDTH below for why some
   *  exercises need a wider one. */
  rangeWidth?: number;
  today?: string;
  recent?: LastSession[] | null;
  /** True when the logged number is COUNTERWEIGHT rather than load, so progress means it goes DOWN.
   *
   *  The assisted pull-up is the case: less assistance is harder. Its cue has always said so, in the
   *  words he reads at the machine, while the engine added an increment and made the next set easier.
   *  This is a fact about the machine, not a judgement about his training. */
  assistance?: boolean;
  /** THE WEIGHTS THAT EXIST for this lift, ascending, when the implement has a fixed set of them.
   *
   *  Supplied for dumbbell lifts, out of `portable.dumbbells.ladderLb` in equipment.json. His rack
   *  steps by 2.5 lb up to 20 and by 5 lb after, which one `increment` plus a round-to-nearest-5
   *  cannot express: from 12.5 the old arithmetic returned 20, skipping two dumbbells that are on
   *  the rack. When this is present the engine reads the next entry instead of computing one.
   *
   *  Absent for the barbell (plates make any multiple of 5 reachable, and `PLATES` in
   *  program-shared.ts already tells him which to load) and for the cable stacks, whose 2.5 lb pin
   *  positions a single `increment` describes; the plan route derives that 2.5 from the implement
   *  (`incrementFor` in ladder.ts), because no slot in program.json sets one. */
  ladder?: number[] | null;
  /** The rep count is a CEILING SET BY A PERSON and the engine may not move it, in either
   *  direction. True for the two plyometric primers.
   *
   *  His words, 2026-08-28: "I NEVER KNEW 3 REPS WAS A THING I JUST THOUGHT I SHOULD DO AS MANY AS
   *  I CAN." The box jump card said 3 x 3 and he logged 10 reps a set for three sessions. The card
   *  was right and nobody had told him why, so he read the number as a floor. The engine then read
   *  his log and agreed with him: `progression: "reps"` means "add a rep where you can", so once
   *  the log said 10 the card asked for 10, and the app and its own cue gave opposite instructions
   *  on one screen with every gate green.
   *
   *  What a jump progresses on is SETS, which is contact count, which is what the evidence says
   *  (Deng 2024, section 4 of HealthOS/knowledge/training-programme-evidence.md: "Progress by
   *  quality and contact count, not height or distance"). The fourth jump of a set is slower than
   *  the first and a slow jump is a different exercise. That is a decision about dose, so it is
   *  made in program.json by changing `sets`, not by an engine reading a log. */
  fixedReps?: boolean;
  /** Whatever `reps` in program.json carries after its leading number: "/side", "/leg", "s/side".
   *  Only used to build a sentence he reads; the arithmetic is on the count alone. */
  repSuffix?: string;
  /** The weight to put on the card the FIRST time a lift is logged, and the sentence that says so,
   *  from the slot's `firstWeight` in program.json (derived in ladder.ts, never sent by the client).
   *  Added 2026-10-04 for the Smith hip thrust: "First time: log your working weight" left the one
   *  number he needed under a collapsed "How to do it". */
  firstWeight?: { weight: number; say: string } | null;
}

export interface Suggestion {
  weight: number | null;
  reps: number;
  reason: string;
}

/* THE LADDER HAS TO CLOSE. Default 2, overridable per exercise, and the reason is arithmetic.
 *
 * Double progression says: hold the weight until you hit the TOP of the range on every working
 * set, then add one increment and drop back to the BOTTOM. That only works if the strength banked
 * climbing bottom to top is at least what the next load step demands. Using Epley (e1RM = w *
 * (1 + reps/30)):
 *
 *   banked   = w * (1 + top/30)
 *   demanded = (w + increment) * (1 + bottom/30)
 *
 * If banked < demanded, completing the range STILL does not earn the jump. You take it, fail it,
 * fall back, and oscillate forever.
 *
 * Measured 2026-08-22 across the whole programme: eight of fifteen logged lifts were in that state,
 * and every one of them was a dumbbell or cable movement where 5 lb is a large fraction of the
 * load. The overhead press is the proof: 60x10x10x10, then 65x8x8x8, then back to 60, then 65
 * again, then back to 60. Six sessions in three months and an estimated max of 80, 82, 80, 82, 80,
 * 76. At 65 lb, three sets of ten banks 86.7 and the jump to 70 demands 88.7, so even doing
 * everything the app asked, the next rung was out of reach. Meanwhile every barbell lift, where
 * 5 lb is 3% rather than 8%, climbed: squat 135x10 to 185x6, RDL 165x8 to 225x4.
 *
 * content/gym/validate.mjs computes this for every logged exercise and fails the build on a gap. */
const RANGE_WIDTH = 2;
const FIRST_TIME = 'First time: log your working weight.';
/** Timed holds step by five seconds, not by one: a one-second step is inside the error of counting
 *  it, and "add a rep" is the wrong word for a hold. */
const TIMED_STEP = 5;
const GAP_DAYS = 21;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Round a barbell/dumbbell load to something loadable (nearest 5 lb), but keep sub-5 increments
 *  (cable stacks etc.) intact when increment < 5. */
function roundLoad(w: number, increment: number): number {
  if (increment && increment < 5) return r1(w);
  return Math.round(w / 5) * 5;
}

/* A RACK IS A LIST OF WEIGHTS THAT EXIST, NOT A STEP SIZE, and the engine had no way to say so.
 *
 * Every weighted lift carried one `increment`, and `roundLoad` then snapped the result to the
 * nearest 5 lb. His rack steps by 2.5 up to 20 and by 5 after it, so from 12.5 lb the old
 * arithmetic returned 20: it skipped 15 and 17.5, both of which are on the rack, and asked for a
 * 60% jump. No single increment is right at both ends, so the fix is not a better number.
 *
 * `ladder` is the rack itself, out of `equipment.json`. When one is supplied the engine asks it for
 * the next entry rather than doing arithmetic, and it does not know or care what the step is.
 *
 * The FLOOR clause matters as much as the ceiling. Off the top of the ladder the answer is the top,
 * not a weight that does not exist: 90 lb is the heaviest dumbbell in the building and a card asking
 * for 95 sends him looking for it. Off the bottom it returns the lowest rung, because he has to hold
 * something. Both directions are in the tests. */
function stepUp(w: number, increment: number, ladder?: number[] | null): number {
  if (!ladder || !ladder.length) return roundLoad(w + increment, increment);
  const next = ladder.find((x) => x > w);
  return next ?? ladder[ladder.length - 1]!;
}

function stepDown(w: number, increment: number, ladder?: number[] | null): number {
  if (!ladder || !ladder.length) return roundLoad(w - increment, increment);
  const below = ladder.filter((x) => x < w);
  return below.length ? below[below.length - 1]! : ladder[0]!;
}

/** The rung at or below a target. Used by the deload, which aims at ~90% of a stalled weight: the
 *  nearest rack weight NOT ABOVE that target, because a deload that rounds upward is not a deload. */
function stepTo(target: number, increment: number, ladder?: number[] | null): number {
  if (!ladder || !ladder.length) return roundLoad(target, increment);
  const at = ladder.filter((x) => x <= target);
  return at.length ? at[at.length - 1]! : ladder[0]!;
}

/** The weight actually worked at: the most-used weight across working sets. Drops a heavy top
 *  single (e.g. 185x3) in favour of the real work weight (145x8x8). Tie-break: the HEAVIER weight,
 *  since 2026-09-27. It was the lighter one, so a logged warm-up set (95x5 then 135x8) made 95 the
 *  working weight and the card suggested a load he had only ramped through. A tie between two work
 *  weights is a session that climbed, and the heavier one is where it ended. `getLoggedHistory` in
 *  db.ts breaks its `mode()` tie the same way. */
export function workingWeight(sets: SetRecord[], bottom?: number): number | null {
  const counts = new Map<number, number>();
  for (const s of sets) {
    if (s.weight == null) continue;
    counts.set(s.weight, (counts.get(s.weight) || 0) + 1);
  }
  if (counts.size === 0) return null;
  /* EVERY WEIGHT ONCE, since 2026-10-04: a ramp, not a working weight. His bench on 2026-10-03 was
   * 135x12, 155x9, 175x5, three weights one set each, and the heavier tie-break below made 175 the
   * working weight, so the card asked for 175 x 6 off one set of 5: his estimated max, three times.
   * When no weight was repeated, the working weight is the heaviest one he took into the rep range
   * (155 for 9 here). Only when nothing reached the range does the heaviest stand. A weight done for
   * two or more sets still beats any single set, which the mode below already guarantees. */
  if (bottom != null && Math.max(...counts.values()) === 1) {
    const inRange = sets.filter((s) => s.weight != null && (s.reps ?? 0) >= bottom).map((s) => s.weight as number);
    if (inRange.length) return Math.max(...inRange);
  }
  let best: number | null = null;
  let bestN = -1;
  for (const [w, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && w > best)) {
      best = w;
      bestN = n;
    }
  }
  return best;
}

/* THE RUNG THAT THE RANGE CANNOT EARN, and the two gates in this repo disagreed about it for a week.
 *
 * `banked` is the estimated max at the TOP of the prescribed range; `demanded` is the estimated max
 * the NEXT rung asks for at the BOTTOM of it. Where banked >= demanded the ladder closes and double
 * progression works: finish the range, take the step, keep it. Where it does not, finishing the
 * range still does not earn the jump, so he takes it, fails it, falls back, and oscillates. The
 * overhead press did that all year at 60 to 65 lb.
 *
 * ONE LIFT WAS LIVE IN THAT STATE, and this is what it cost. `a/db-lateral-raise` at 20 lb: a
 * window of 12 to 20 banks 33.3 and the next dumbbell, 25 lb, demands 35.0, a margin of -1.7.
 * `scripts/check-ladder.mjs` exited 1 on it for six of the seven days to 2026-09-04, writing its
 * warning into a log file nobody opens. Its suggested fix was `"rangeWidth": 11`, and
 * `content/gym/validate.mjs` REFUSES 11 with a sourced reason: a 12 to 23 window is past Iversen's
 * 15 RM ceiling, and the same message says what coaches do instead, which is
 * "two top-range sets before moving up, or a cable, not with eleven more reps".
 *
 * So one tool named a fix the other tool forbids, each was individually right, and the lift stayed
 * broken in the gap between them. That is the shape of complaint he made on 2026-09-04: "we fix
 * something, something else changes, something outbreaks".
 *
 * THE FIX IS THE ONE validate.mjs ALREADY NAMES, and it lives here rather than in the data because
 * it is arithmetic and it generalises: any lift whose next rung is not earned by its own range holds
 * at the top for a SECOND session before taking it. That is a real strength signal rather than a
 * wider rep window, it needs no per-exercise number to be maintained, and it costs nothing on the
 * lifts whose ladder already closes, which is every barbell lift on the page.
 *
 * Epley throughout, the same formula validate.mjs and check-ladder.mjs both use, so the three
 * cannot drift. */
function rungIsEarned(ww: number, next: number, bottom: number, top: number): boolean {
  if (next <= ww) return true;
  const banked = ww * (1 + top / 30);
  const demanded = next * (1 + bottom / 30);
  return banked >= demanded;
}

/** Did the session BEFORE the last one also finish at the top of the range, at the same weight?
 *  `recent[0]` is the same session as `last`, so the second entry is the one that answers this. */
function toppedPreviousSession(recent: LastSession[] | null | undefined, ww: number, top: number, bottom: number): boolean {
  const prev = recent?.[1];
  if (!prev) return false;
  const ss = (prev.sets || []).filter((x) => (x.reps ?? 0) > 0);
  if (!ss.length) return false;
  if (workingWeight(ss, bottom) !== ww) return false;
  const reps = ss.filter((x) => x.weight === ww).map((x) => x.reps ?? 0);
  return reps.length > 0 && Math.min(...reps) >= top;
}

export function suggest(last: LastSession | null, plan: PlanInput = {}): Suggestion {
  const type = plan.type || 'weighted';
  const bottom = Number(plan.targetReps) || (type === 'bodyweight' ? 8 : 6);
  const top = bottom + (plan.rangeWidth != null ? Number(plan.rangeWidth) : RANGE_WIDTH);
  const increment = plan.increment != null ? Number(plan.increment) : 5;
  /* Sorted and de-duplicated here rather than trusted from the caller: every function above reads
   * it positionally (`find` for the first entry above, `filter().at(-1)` for the last below), so an
   * unsorted array returns a silently wrong weight rather than throwing. `validate.mjs` gates the
   * stored file; this guards the seam. */
  const ladder = Array.isArray(plan.ladder) && plan.ladder.length
    ? [...new Set(plan.ladder.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
    : null;

  const sets = last && Array.isArray(last.sets) ? last.sets.filter((s) => (s.reps ?? 0) > 0) : [];

  /* A FIXED REP COUNT IS ANSWERED BEFORE ANYTHING ELSE IS CONSIDERED, including the long-gap probe
   * below and the "never suggest fewer than he already did" floor further down. Both of those exist
   * to stop the card going BACKWARDS against his log, and on a plyometric that protection is the
   * bug: his log says 10 and the prescription says 3, and 3 is the correct answer. See `fixedReps`.
   *
   * It says the number and the reason in the same breath, because "3" on its own is what he already
   * read as a floor. */
  if (plan.fixedReps) {
    /* "4 a set" WAS WRONG ON THE LATERAL BOUND and the screenshot is what caught it: the
     * prescription is 4/SIDE, `parseTargetReps` drops the unit for the arithmetic, and the sentence
     * built from the bare count said half the work. Same fault as the farmer carry's "40 reps" of
     * something measured in seconds. The unit travels with the number. */
    const unit = plan.repSuffix ? `${bottom}${plan.repSuffix}` : `${bottom} a set`;
    return {
      weight: null,
      reps: bottom,
      /* The unit and nothing else, on the four-kinds rule in AGENTS.md. Why a jump is three reps is
       * in the comment above and in the block `why`, not on the card. */
      reason: `${unit}.`,
    };
  }

  if (sets.length === 0) {
    if (plan.firstWeight && type === 'weighted') {
      return { weight: plan.firstWeight.weight, reps: bottom, reason: plan.firstWeight.say };
    }
    /* A hold or a bodyweight lift has no weight to log, so "log your working weight" was the wrong
       instruction on the side plank and the pull-up, both new on 2026-10-04. */
    if (type === 'timed') return { weight: null, reps: bottom, reason: 'First try: hold what you can, up to the time shown, and type the seconds.' };
    if (type === 'bodyweight') return { weight: null, reps: bottom, reason: 'First try: do what you can, up to the reps shown, and type the reps.' };
    return { weight: null, reps: bottom, reason: FIRST_TIME };
  }

  /* A WEIGHTED LIFT LOGGED WITHOUT A WEIGHT IS A FIRST TIME for the arithmetic, since 2026-09-27.
   * Reps typed with the weight box empty (or 0) reached the branches below as a working weight of
   * null, and the card printed "Got 8/8/8 at null: hold" or, after a gap, "Start at 0". There is no
   * load to build on, so the card asks for the one number it needs. */
  if (type === 'weighted') {
    const w0 = workingWeight(sets, bottom);
    if (w0 == null || w0 === 0) return { weight: null, reps: bottom, reason: FIRST_TIME };
  }

  // Long logging gap: probe one step above the old baseline instead of assuming continuity.
  if (plan.today && last?.date) {
    const gap = Math.round((Date.parse(plan.today) - Date.parse(last.date)) / 86400000);
    if (gap > GAP_DAYS) {
      if (type === 'timed') {
        const best = Math.max(...sets.map((s) => s.reps ?? 0));
        return { weight: null, reps: best + TIMED_STEP, reason: `Last log ${gap}d ago, probe: old best +${TIMED_STEP} s, see where you are.` };
      }
      if (type === 'bodyweight') {
        const best = Math.max(...sets.map((s) => s.reps ?? 0));
        return { weight: null, reps: best + 1, reason: `Last log ${gap}d ago, probe: old best +1 rep, see where you are.` };
      }
      const ww = workingWeight(sets, bottom) ?? 0;
      /* NO UPWARD PROBE FROM A WEIGHT HE COULD NOT HIT THE RANGE AT. Added 2026-09-06, found on his
       * real bench: last logged 2026-08-04 as 185x3, 185x3, 165x8 against a range of 6 to 10. The
       * working weight is 185 (two sets), so this branch printed "probe: 185 up one step to 190" on
       * a lift he had not touched in 33 days, for six reps, above a weight he managed for three. For
       * a beginner training alone under a bar, that card is the one that hurts him.
       *
       * The probe goes up only if he was inside the range at the working weight. Otherwise the card
       * offers the heaviest weight he DID hit the range at (165 here), and if there is none, the
       * working weight itself. The gap is still named, and "adjust live" still stands. */
      const repsAtWw = sets.filter((s) => s.weight === ww).map((s) => s.reps ?? 0);
      const madeRangeAtWw = repsAtWw.length > 0 && Math.min(...repsAtWw) >= bottom;
      if (!madeRangeAtWw) {
        const inRange = sets.filter((s) => (s.reps ?? 0) >= bottom && s.weight != null).map((s) => s.weight as number);
        const hold = inRange.length ? Math.max(...inRange) : ww;
        return {
          weight: hold,
          reps: bottom,
          reason: `Last log ${gap}d ago, and ${ww} was below the range then (${repsAtWw.join('/')}). Start at ${hold}, where you last made ${bottom}+, adjust live.`,
        };
      }
      /* NO UPWARD PROBE AT ALL, since 2026-10-04. After a gap he starts where he was. His ruling,
       * 2026-09-01: "I'm more worried on like keeping my form and maybe improving on that than going
       * heavier." The standing dumbbell press is the case that found it: 32 days since its last
       * standing set at 60, the card offered 65, while his last press of any kind (seated, 2026-09-28)
       * was 60 for 6 and 7. This engine cannot see another id's sets, so it may not climb past this one. */
      return { weight: ww, reps: bottom, reason: `Last log ${gap}d ago: start at ${ww}, where you were, adjust live.` };
    }
  }

  // ---- bodyweight / timed: progress on reps (or seconds), then add load ----
  if (type === 'bodyweight' || type === 'timed') {
    const repsList = sets.map((s) => s.reps ?? 0);
    const minReps = Math.min(...repsList);
    const timed = type === 'timed';
    const u = timed ? ' s' : '';
    /* A LOADED HOLD IS DOUBLE PROGRESSION TOO, since 2026-10-04. The farmer carry card read "x 125s"
     * against a prescription of 40 s at a heavier dumbbell, because this branch never looked at the
     * weight: past the top it held the seconds and left the load to him. When the sets carry a weight,
     * the top of the range earns the next dumbbell and the clock goes back to the bottom, exactly as a
     * weighted lift does. The card shows the load either way. A hold with no weight is unchanged. */
    const load = timed ? workingWeight(sets) : null;
    if (timed && load != null && load > 0 && minReps >= top) {
      const next = stepUp(load, increment, ladder);
      if (next > load) {
        return { weight: next, reps: bottom, reason: `Held ${repsList.join('/')} s at ${load}: up to ${next}, back to ${bottom} s.` };
      }
    }
    if (minReps >= top) {
      /* NEVER SUGGEST FEWER THAN HE ALREADY DID. This read `reps: top`, so once he passed the top of
       * the range the card asked him to go BACKWARDS, and the app wrote the number into his log:
       *
       *   box-jump      2026-08-27   reps 10    suggested_reps 5     (three sets, three sessions)
       *   farmer-carry  2026-08-25   reps 130   suggested_reps 40
       *   pushup        2026-08-25   reps 20    suggested_reps 8
       *
       * `top` is the ceiling of a prescribed RANGE, not a target, and for a bodyweight or timed
       * movement he can exceed it without anything being wrong. Found by 10-gym P1-3.
       *
       * This is the arithmetic half only. WHAT a box jump should actually progress on is his open
       * question in program.json, parked and due 2026-09-10, and it is not answered here: intent and
       * ground contact time are not things a card can measure. Holding is the honest instruction
       * until he rules. */
      return {
        weight: null,
        reps: Math.max(top, minReps),
        reason: `Hit ${repsList.join('/')}${u}, past the top of the range: hold here, or add load and drop back to ${bottom}${u}.`,
      };
    }
    /* WORDED PER TYPE, since 2026-09-27. A hold was told to "add a rep", and stepped by one second. */
    if (timed) {
      return {
        weight: load != null && load > 0 ? load : null,
        reps: Math.min(minReps + TIMED_STEP, top),
        reason: `Got ${repsList.join('/')} s: add ${TIMED_STEP} s where you can.`,
      };
    }
    return { weight: null, reps: Math.min(minReps + 1, top), reason: `Got ${repsList.join('/')}: add a rep where you can.` };
  }

  // ---- weighted: double progression on the working weight ----
  /* Never null here: the no-weight case returned FIRST_TIME above. */
  const ww = workingWeight(sets, bottom) as number;
  const assisted = plan.assistance === true;
  const workSets = sets.filter((s) => s.weight === ww);
  const repsAtWork = workSets.map((s) => s.reps ?? 0);
  const minReps = Math.min(...repsAtWork);
  const wd = repsAtWork.join('/');

  // Stall detection: 3 straight sessions at the same working weight with no rep progress, still
  // below the top of the range -> deload ~10% and rebuild. A multi-session signal, not a bad day.
  /* A DATE IS NOT A SESSION. `getRecentSessions` groups by date and takes whatever that date holds,
   * so a day with ONE logged set counted the same as a day with three, and the deload fired on the
   * strength of two single-set days:
   *
   *   2026-08-27   115x8  115x8  115x8     (three sets, against a prescription of two)
   *   2026-08-23   115x8                   (one set)
   *   2026-08-18   115x8                   (one set)
   *
   * The card then read "deload to 105" two days after he did MORE work than the day asked for. This
   * file's own header says a deload is a multi-session stall signal and that one bad day never
   * triggers it; a partial log is not a bad day, it is a missing one, and `/gym/log` exists because
   * his sessions are systematically under-logged: 31 lifting sessions in June and July have no app
   * rows at all. A detector that reads a partial log as a full session is guaranteed to misfire on
   * this user specifically. Found by 10-gym P1-4.
   *
   * Two sets is the floor, and it is deliberately not "half the prescription": that would need a
   * programme lookup in a pure function, and one logged set is the shape that carries no information
   * about whether he stalled, whatever the prescription was. */
  const MIN_SETS_FOR_A_SESSION = 2;
  const recAll = Array.isArray(plan.recent) ? plan.recent : null;
  const rec = recAll
    ? recAll.filter((sess) => (sess.sets || []).filter((s) => (s.reps ?? 0) > 0).length >= MIN_SETS_FOR_A_SESSION)
    : null;
  /* TWO EXEMPTIONS, both 2026-09-27.
   *
   * An ASSISTED lift never deloads here. The deload takes ten percent off the number, and on a
   * counterweight machine less of the number is a HARDER set, so a stall answered "deload to 35"
   * made the next session heavier, the opposite of what a deload is for.
   *
   * And a stall read off OLDER sessions does not outrank a heavier recent one. `rec` drops a session
   * with one logged set, so 125x8 on Thursday vanished from the window and three older sessions at
   * 115 read as a stall: the card said "deload to 105" the week he moved up. When the latest
   * session's working weight is above the stalled weight, he is not stalled. */
  if (rec && rec.length >= 3 && !assisted) {
    const last3 = rec.slice(0, 3).map((sess) => {
      const ss = (sess.sets || []).filter((s) => (s.reps ?? 0) > 0);
      const w = workingWeight(ss, bottom);
      const reps = ss.filter((s) => s.weight === w).map((s) => s.reps ?? 0);
      return { w, min: reps.length ? Math.min(...reps) : null, sets: ss.length };
    });
    const sameW = last3.every((x) => x.w != null && x.w === last3[0]!.w);
    const noProgress =
      last3[0]!.min != null && last3[1]!.min != null && last3[2]!.min != null
      && last3[0]!.min! <= last3[1]!.min! && last3[1]!.min! <= last3[2]!.min!;
    const movedUpSince = last3[0]!.w != null && ww > last3[0]!.w;
    if (sameW && noProgress && !movedUpSince && last3[0]!.min! < top && last3[0]!.w != null) {
      const dl = stepTo(last3[0]!.w! * 0.9, increment, ladder);
      /* The reason carries its own evidence. "Stalled 3 sessions" is not something he can judge;
       * "3 sessions (3, 2 and 2 sets logged)" is, and it is the sentence that would have made the
       * front-squat misfire obvious on the card rather than in an audit. */
      const counted = last3.map((x) => x.sets).join(', ');
      return {
        weight: dl,
        reps: bottom,
        reason: `Stalled 3 sessions at ${last3[0]!.w} (${counted} sets logged): deload to ${dl}, build back up.`,
      };
    }
  }

  if (minReps >= top) {
    /* HOLD ONE MORE SESSION WHEN THE RANGE DOES NOT EARN THE RUNG. See rungIsEarned above.
     *
     * Assistance lifts are exempt: the number goes DOWN there, so "the next rung demands a bigger
     * estimated max" is not what taking a step means, and the Epley comparison would be answering a
     * different question than the one asked. */
    /* `recAll` PRESENT, not `rec`. The stall detector above discards a session with fewer than two
     * logged sets, because a partial log is a missing session rather than a bad one. This question is
     * the opposite shape: it asks whether he has ALREADY earned the jump, and a session that shows
     * him at the top of the range is evidence of that whether he logged two sets or three.
     *
     * A caller that supplies no `recent` at all is not saying "no history", it is saying it is not
     * answering that question, so the hold does not apply and the old behaviour stands. Only the plan
     * route supplies it, and it always does. */
    const nextRung = assisted ? null : stepUp(ww, increment, ladder);
    if (
      recAll != null
      && nextRung != null
      && !rungIsEarned(ww, nextRung, bottom, top)
      && !toppedPreviousSession(recAll, ww, top, bottom)
    ) {
      return {
        weight: ww,
        reps: top,
        /* The instruction only, on the four-kinds rule. The percentage and why the range does not
           earn the jump are in the comment on rungIsEarned. */
        reason: `Do ${top} at ${ww} once more, then ${nextRung}.`,
      };
    }
    /* AN ASSISTANCE LIFT PROGRESSES DOWNWARD, and until 2026-08-28 nothing in the engine knew that.
     *
     * The assisted pull-up logs the COUNTERWEIGHT: less of it is harder, and getting stronger means
     * the number falls. Its own cue says so on the same card, in the same words he reads at the
     * machine: "it is the one number here that should go DOWN over time. When 6 feels easy, take
     * 10 lb of assistance off." The engine added. So the first time he got 8/8/8 at 40 lb the card
     * would have read "50 lb x 6, Hit 8/8/8 at 40: +10 lb", which is MORE help and an easier set,
     * directly contradicting the sentence underneath it. Found by 10-gym P1-5.
     *
     * `assistance: true` on the slot is the flag, and it is a fact about the machine rather than a
     * judgement about his training: on this equipment the weight opposes bodyweight instead of adding
     * to it. `check-ladder.mjs` inherited the same assumption and produced a finding out of it
     * (friday/assisted-pullup "+10 lb demands 60.0"), which is a report disagreeing with reality
     * rather than with a gate.
     *
     * Floored at one increment: a counterweight of zero is an unassisted pull-up, which is a
     * different exercise and a milestone he should reach on purpose rather than by the card silently
     * arriving there. */
    const next = assisted
      ? Math.max(increment, stepDown(ww, increment, ladder))
      : stepUp(ww, increment, ladder);
    /* NO STEP LEFT, since 2026-09-27. At the heaviest dumbbell `stepUp` returns the same weight,
     * and this branch printed "up to 90, the top of the rack" with the reps reset to the bottom of
     * the range: the same load for fewer reps, a step backwards dressed as progress. The lightest
     * counterweight did the same ("take 0 lb off, down to 10"). With nowhere to go, he holds the
     * weight at the top of the range. */
    if (assisted ? next >= ww : next <= ww) {
      return {
        weight: ww,
        reps: top,
        reason: assisted
          ? `Hit ${wd} at ${ww}, the least assistance here: hold at ${top}.`
          : `Hit ${wd} at ${ww}, the heaviest on the rack: hold at ${top}.`,
      };
    }
    const reason = assisted
      ? `Hit ${wd} at ${ww}: take ${r1(ww - next)} lb of assistance off, down to ${next}.`
      : `Hit ${wd} at ${ww}: up to ${next}, +${r1(next - ww)} lb.`;
    return { weight: next, reps: bottom, reason };
  }
  /* ONE MORE REP THAN HIS BEST SET, since 2026-10-04. This read `minReps < bottom ? bottom : top`,
   * so 8/8/8 on a pulldown in an 8 to 12 range put 12 on the card and prefilled it: four reps a set
   * in one session. And 6/6/5 on the row asked for 8. The weight holds; the target is his best set
   * plus one, never past the top of the range. The weight moves only from the branch above, when
   * every working set reached the top. */
  const best = Math.max(...repsAtWork);
  const goal = Math.min(top, best + 1);
  return { weight: ww, reps: goal, reason: `Got ${wd} at ${ww}: hold, build to ${goal}.` };
}
