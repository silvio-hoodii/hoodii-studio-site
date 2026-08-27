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

  const sets = last && Array.isArray(last.sets) ? last.sets.filter((s) => (s.reps ?? 0) > 0) : [];
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
      const next = roundLoad(ww + increment, increment);
      return { weight: next, reps: bottom, reason: `Last log ${gap}d ago, probe: old weight +${increment} lb, adjust live.` };
    }
  }

  // ---- bodyweight / timed: progress on reps (or seconds), then add load ----
  if (type === 'bodyweight' || type === 'timed') {
    const repsList = sets.map((s) => s.reps ?? 0);
    const minReps = Math.min(...repsList);
    if (minReps >= top) {
      return { weight: null, reps: top, reason: `Hit ${repsList.join('/')}: add load or progress the movement.` };
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
  const rec = Array.isArray(plan.recent) ? plan.recent : null;
  if (rec && rec.length >= 3) {
    const last3 = rec.slice(0, 3).map((sess) => {
      const ss = (sess.sets || []).filter((s) => (s.reps ?? 0) > 0);
      const w = workingWeight(ss);
      const reps = ss.filter((s) => s.weight === w).map((s) => s.reps ?? 0);
      return { w, min: reps.length ? Math.min(...reps) : null };
    });
    const sameW = last3.every((x) => x.w != null && x.w === last3[0]!.w);
    const noProgress =
      last3[0]!.min != null && last3[1]!.min != null && last3[2]!.min != null
      && last3[0]!.min! <= last3[1]!.min! && last3[1]!.min! <= last3[2]!.min!;
    if (sameW && noProgress && last3[0]!.min! < top && last3[0]!.w != null) {
      const dl = roundLoad(last3[0]!.w! * 0.9, increment);
      return { weight: dl, reps: bottom, reason: `Stalled 3 sessions at ${last3[0]!.w}: deload to ${dl}, build back up.` };
    }
  }

  if (minReps >= top && ww != null) {
    const next = roundLoad(ww + increment, increment);
    return { weight: next, reps: bottom, reason: `Hit ${wd} at ${ww}: +${increment} lb.` };
  }
  const goal = minReps < bottom ? bottom : top;
  return { weight: ww, reps: goal, reason: `Got ${wd} at ${ww}: hold, build to ${goal}.` };
}
