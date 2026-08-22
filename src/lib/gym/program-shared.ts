/** Pure program helpers, no filesystem access, safe to import from client components too.
 *  Split out of program.ts (which is 'server-only' because it reads content/gym/*.json off disk)
 *  so GymClient.tsx can share the exact same plate-math/swap logic instead of reimplementing
 *  a second copy that could drift from what the server actually computed. */
import type { Day, DayKey, Exercise, Alt, ExerciseType } from './types';

export const DAY_ORDER: DayKey[] = ['monday', 'tuesday', 'thursday', 'friday'];

/* The keys above are weekday names, and the cycle is rolling: computeNextUp picks the next day from
 * what was actually logged, so the app selects "thursday" on a Tuesday. GymClient has derived a
 * readable split name from the day's own title since 2026-08-11 ("Lower B: Hinge" -> "Lower B")
 * rather than carrying a second field that could drift from what it labels. The hub row was still
 * printing the raw key, so the front door said "Next up monday" while the page it linked to said
 * "Lower B". Same function now, both places. */
export function splitName(d: { title: string; name: string }): string {
  const head = d.title.split(/:\s/)[0]?.trim();
  return head || d.name;
}
/* THE TIME BUDGET IS DELETED, 2026-08-22. BUDGETS, DEFAULT_BUDGET, exPriority, budgetKeep and
 * budgetedBlocks all lived here and all went together.
 *
 * They asked him to predict the length of a session before starting it, and he gets that wrong in
 * both directions. He also worked out what the cap was actually doing: "what you do between the
 * full and the 25 is just you're taking out everything that comes after the main lift. Why don't
 * you just have one and I'll check everything that I will do?"
 *
 * The block ORDER and `role` already carry that priority, so the page states the drop direction in
 * one sentence and shows the whole day. Deleted rather than left unused, because dead code that
 * still typechecks is how a "budget" reappears in a payload nobody meant to send.
 * Recoverable from git history: this file at ba3385c. */

export function exType(ex: Exercise | Alt): ExerciseType {
  return ex.timed ? 'timed' : ex.bodyweight ? 'bodyweight' : 'weighted';
}

export function parseTargetReps(reps: string | undefined): number | null {
  const m = String(reps ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

export function restSeconds(rest: string | undefined): number {
  const m = String(rest || '').match(/([\d.]+)\s*(min|s)/i);
  if (!m) return 60;
  return m[2]!.toLowerCase() === 'min' ? Math.round(parseFloat(m[1]!) * 60) : parseFloat(m[1]!);
}

/** Everything a set costs that is NOT prescribed rest: setup, plate changes, walking between zones,
 *  waiting for equipment, and the set itself. Fitted from his real logged sessions by
 *  HealthOS/server/fit-session-time.mjs, not guessed, and kept at the same value rather than
 *  re-derived here.
 *
 *  TWO THINGS TO KNOW BEFORE TRUSTING IT. It is 2.5 minutes PER SET, which is the dawdling
 *  quantified: the watch export shows 45 to 75% of every session below 110 bpm and a 28-minute hole
 *  inside Thursday 20 August. And the fit is stale, because fit-session-time.mjs reads gym.html and
 *  the local SQLite `sets` table, both retired: the table stopped being written on 2026-08-09 when
 *  the app moved to Neon. So this predicts how long a session HAS taken him, which is exactly what
 *  the page claims when it prints it, and it is not a claim about how long the work needs. */
const SET_OVERHEAD_SEC = 150;
const FIXED_MIN = 10; // warmup + cooldown

export function exMinutes(ex: Exercise): number {
  return ((ex.sets || 1) * (restSeconds(ex.rest) + SET_OVERHEAD_SEC)) / 60;
}

/* TWO MODELS, ON PURPOSE, AND THEY ANSWER DIFFERENT QUESTIONS. Conflating them is a mistake I made
 * and then measured: charging a fill partner nothing in the DESCRIPTIVE total made Tuesday come out
 * at 63 minutes on a day the watch says took him about 100.
 *
 *  dayMinutes / dayTimeBreakdown  = DESCRIPTIVE. How long this day HAS taken him. Every set is
 *    charged its own prescribed rest plus SET_OVERHEAD_SEC, because that is precisely how
 *    fit-session-time.mjs summed rest when it fitted the constant. Changing the shape of the sum
 *    here without re-fitting the constant would silently invalidate it.
 *
 *  The prescriptive half of this pair, budgetKeep, is gone with the time budget it served (see the
 *    note above). What it knew is still true and still worth knowing: a 'fill' partner is done
 *    inside the lead's rest and costs NOTHING, because that window is paid for either way. That is
 *    the whole reason 'fill' exists, and it is why the page can show the day as one list. */
export function dayMinutes(day: Day): number {
  return Math.round(
    FIXED_MIN + day.blocks.reduce((a, b) => a + b.exercises.reduce((x, e) => x + exMinutes(e), 0), 0),
  );
}

/** The total, and what it is made of. Printed on the page instead of the typed "75-85 min" string
 *  that used to sit in program.json, because the split is the finding: the sessions are long because
 *  of rest and overhead, not because of the amount of work in them. */
export function dayTimeBreakdown(day: Day): {
  total: number;
  restMin: number;
  overheadMin: number;
  sets: number;
} {
  let restSec = 0;
  let sets = 0;
  for (const block of day.blocks) {
    for (const ex of block.exercises) {
      sets += ex.sets || 1;
      restSec += (ex.sets || 1) * restSeconds(ex.rest);
    }
  }
  return {
    total: dayMinutes(day),
    restMin: Math.round(restSec / 60),
    overheadMin: Math.round((sets * SET_OVERHEAD_SEC) / 60),
    sets,
  };
}

// ---- plate math + warmup ramp ----

// Barbell lifts that get plate math and, on main blocks, a warmup ramp. Same set as
// HealthOS/gym.html's PLATE_IDS.
export const PLATE_IDS = new Set([
  'bb-back-squat', 'front-squat', 'romanian-deadlift', 'bench-press', 'bb-ohp', 'bb-row',
  'good-morning', 'bb-hip-thrust', 'paused-back-squat',
]);
const BAR = 45;
const PLATES = [45, 35, 25, 10, 5, 2.5];

export function plateMath(w: number | string | null | undefined): string | null {
  const weight = typeof w === 'string' ? parseFloat(w) : w;
  if (weight == null || isNaN(weight) || weight < BAR) return null;
  let per = (weight - BAR) / 2;
  const out: number[] = [];
  for (const p of PLATES) {
    while (per >= p - 0.01) {
      out.push(p);
      per -= p;
    }
  }
  return out.length ? `${out.join(' + ')} per side` : 'empty bar';
}

/** bar x10, 50% x5, 70% x3, and (>=185 lb target) 85% x1. Only shown for barbell main lifts loaded
 *  heavy enough (>=95 lb target) that a ramp is worth the time. Ported from gym.html's inline ramp
 *  block in render(). */
export function warmupRamp(targetWeight: number | null): string | null {
  if (targetWeight == null || targetWeight < 95) return null;
  const r5 = (w: number) => Math.max(BAR, Math.round(w / 5) * 5);
  let ramp = `bar×10 · ${r5(targetWeight * 0.5)}×5 · ${r5(targetWeight * 0.7)}×3`;
  if (targetWeight >= 185) ramp += ` · ${r5(targetWeight * 0.85)}×1`;
  return ramp;
}

// ---- swap resolution ----

/** The exercise as actually being performed today, given a swap map of { originalId: Alt }. */
export function effectiveExercise(ex: Exercise, swap: Alt | undefined): Exercise {
  return swap ? ({ ...ex, ...swap } as Exercise) : ex;
}

export function findExercise(day: Day, id: string): Exercise | null {
  for (const b of day.blocks) {
    for (const e of b.exercises) if (e.id === id) return e;
  }
  return null;
}
