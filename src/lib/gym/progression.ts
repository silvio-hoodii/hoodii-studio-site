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
   *  positions the single increment already describes correctly. */
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
 *  single (e.g. 185x3) in favour of the real work weight (145x8x8). Tie-break: the lower weight. */
export function workingWeight(sets: SetRecord[]): number | null {
  const counts = new Map<number, number>();
  for (const s of sets) {
    if (s.weight == null) continue;
    counts.set(s.weight, (counts.get(s.weight) || 0) + 1);
  }
  if (counts.size === 0) return null;
  let best: number | null = null;
  let bestN = -1;
  for (const [w, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && w < best)) {
      best = w;
      bestN = n;
    }
  }
  return best;
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
    return {
      weight: null,
      reps: bottom,
      reason: `${bottom} a set, on purpose: this trains how fast you leave the floor, and a tired rep is a slow one. More work means more SETS, not more reps.`,
    };
  }

  if (sets.length === 0) {
    return { weight: null, reps: bottom, reason: 'First time: log your working weight.' };
  }

  // Long logging gap: probe one step above the old baseline instead of assuming continuity.
  if (plan.today && last?.date) {
    const gap = Math.round((Date.parse(plan.today) - Date.parse(last.date)) / 86400000);
    if (gap > GAP_DAYS) {
      if (type === 'timed') {
        const best = Math.max(...sets.map((s) => s.reps ?? 0));
        return { weight: null, reps: best + 2, reason: `Last log ${gap}d ago, probe: old best +2s, see where you are.` };
      }
      if (type === 'bodyweight') {
        const best = Math.max(...sets.map((s) => s.reps ?? 0));
        return { weight: null, reps: best + 1, reason: `Last log ${gap}d ago, probe: old best +1 rep, see where you are.` };
      }
      const ww = workingWeight(sets) ?? 0;
      const next = stepUp(ww, increment, ladder);
      return { weight: next, reps: bottom, reason: `Last log ${gap}d ago, probe: ${ww} up one step to ${next}, adjust live.` };
    }
  }

  // ---- bodyweight / timed: progress on reps (or seconds), then add load ----
  if (type === 'bodyweight' || type === 'timed') {
    const repsList = sets.map((s) => s.reps ?? 0);
    const minReps = Math.min(...repsList);
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
        reason: `Hit ${repsList.join('/')}, past the top of the range: hold here, or add load and drop back to ${bottom}.`,
      };
    }
    return { weight: null, reps: Math.min(minReps + 1, top), reason: `Got ${repsList.join('/')}: add a rep where you can.` };
  }

  // ---- weighted: double progression on the working weight ----
  const ww = workingWeight(sets);
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
  if (rec && rec.length >= 3) {
    const last3 = rec.slice(0, 3).map((sess) => {
      const ss = (sess.sets || []).filter((s) => (s.reps ?? 0) > 0);
      const w = workingWeight(ss);
      const reps = ss.filter((s) => s.weight === w).map((s) => s.reps ?? 0);
      return { w, min: reps.length ? Math.min(...reps) : null, sets: ss.length };
    });
    const sameW = last3.every((x) => x.w != null && x.w === last3[0]!.w);
    const noProgress =
      last3[0]!.min != null && last3[1]!.min != null && last3[2]!.min != null
      && last3[0]!.min! <= last3[1]!.min! && last3[1]!.min! <= last3[2]!.min!;
    if (sameW && noProgress && last3[0]!.min! < top && last3[0]!.w != null) {
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

  if (minReps >= top && ww != null) {
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
    const assisted = plan.assistance === true;
    const next = assisted
      ? Math.max(increment, stepDown(ww, increment, ladder))
      : stepUp(ww, increment, ladder);
    const reason = assisted
      ? `Hit ${wd} at ${ww}: take ${r1(ww - next)} lb of assistance off, down to ${next}.`
      : `Hit ${wd} at ${ww}: up to ${next}${next === ww ? ', the top of the rack' : `, +${r1(next - ww)} lb`}.`;
    return { weight: next, reps: bottom, reason };
  }
  const goal = minReps < bottom ? bottom : top;
  return { weight: ww, reps: goal, reason: `Got ${wd} at ${ww}: hold, build to ${goal}.` };
}
