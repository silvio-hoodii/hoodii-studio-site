/** Pure program helpers, no filesystem access, safe to import from client components too.
 *  Split out of program.ts (which is 'server-only' because it reads content/gym/*.json off disk)
 *  so GymClient.tsx can share the exact same budget/plate-math/swap logic instead of reimplementing
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
/** The session lengths he said on 2026-08-21 he would actually defend: 45 default, 25 floor,
 *  60 ceiling. It was [45, 60, 90] with a "Full" default of no cap at all, on a programme whose days
 *  this model puts at 100 to 106 minutes and whose real sessions ran 81 to 120. An uncapped default
 *  is not a default, it is the absence of one. */
export const BUDGETS = [25, 45, 60] as const;

/** Selected on load. The floor is what a bad day looks like, so the streak survives it; the ceiling
 *  exists so a 90-minute session reads as a failure rather than as a good day. */
export const DEFAULT_BUDGET = 45;

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
 *  budgetKeep = PRESCRIPTIVE. What fits in a cap if he runs it as written, which includes doing the
 *    fill partner inside the lead's rest. There the partner costs NOTHING, because the rest window
 *    is being paid for either way. That is the whole reason 'fill' exists. */
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

/* Priority now reads `role`, which says what a block is FOR, instead of sniffing the label with a
 * regex. The old version tested /^Main\b/ against the label text, so renaming a block from "Main
 * Lift" to "Main Lift: Back Squat" would have silently demoted the squat out of priority 1 and let
 * a 45-minute budget drop it. A label is a display string; it should never have been load-bearing. */
function exPriority(block: { role: string }, idx: number, isLeadMain: boolean): number {
  if (block.role === 'main') return idx === 0 && isLeadMain ? 1 : 2;
  if (block.role === 'primer') return 2;
  return idx === 0 ? 2 : 3;
}

/** Which exercise ids survive a time budget. Priority 1 (the main lift) is unconditional: a short
 *  session that skips it is worse than no session. Then fill by priority, program order, and STOP at
 *  the first thing that doesn't fit (never let a cheap accessory displace something more important
 *  just for being short). Ported verbatim from HealthOS/gym.html's budgetKeep(). */
export function budgetKeep(day: Day, minutes: number | null): Set<string> | null {
  if (!day || !minutes) return null; // null budget = run the whole day
  /* Only the FIRST `main` block of the day is unconditional. Since 2026-08-16 each day carries two
   * main blocks, the heavy pattern and a light second exposure of the complementary one (squat
   * heavy + hinge light, and vice versa). Both are "main" in role, but on a 45-minute day the heavy
   * lift is the one that must survive; the light technical exposure is the first thing to lose. */
  const leadMainIdx = day.blocks.findIndex((b) => b.role === 'main');
  const items: { id: string; pri: number; mins: number; order: number; ridesWith?: string }[] = [];
  day.blocks.forEach((block, bi) =>
    block.exercises.forEach((ex, i) => {
      /* A 'fill' partner is done inside the lead's rest, so it costs only its own overhead and it
       * RIDES WITH the lead rather than competing against it for the budget. Before 2026-08-21 it
       * was priced at full rest and ranked at priority 3, so it was both the most expensive and the
       * first thing dropped, and a 45-minute Tuesday came out as a bench press and a dead bug with
       * no pulling anywhere in it. The partner is the rotator-cuff and anti-valgus work; dropping it
       * to save time it does not take is the wrong trade in both directions.
       *
       * It costs ZERO, not its own overhead. Three sets of dead bug at 30 to 45 seconds fit inside
       * four squat rests of three minutes with ten minutes to spare, so the time is already spent.
       * Pricing it at overhead instead made a 45-minute cap estimate 57 minutes, which is a cap
       * that does not cap. */
      const isFillPartner = block.pairing === 'fill' && i === 1;
      const lead = block.exercises[0];
      items.push({
        id: ex.id,
        pri: exPriority(block, i, bi === leadMainIdx),
        mins: isFillPartner ? 0 : exMinutes(ex),
        order: bi * 100 + i,
        ridesWith: isFillPartner && lead ? lead.id : undefined,
      });
    }),
  );
  const keep = new Set<string>();
  let spent = FIXED_MIN;
  const take = (it: { id: string; mins: number }) => {
    keep.add(it.id);
    spent += it.mins;
  };
  for (const it of items.filter((x) => x.pri === 1)) take(it);
  for (const it of items.filter((x) => x.pri > 1 && !x.ridesWith).sort((a, b) => a.pri - b.pri || a.order - b.order)) {
    if (spent + it.mins > minutes) break;
    take(it);
  }
  // Riders come along after the fact: a partner is kept if and only if its lead survived, whatever
  // the clock says, because it consumes rest that is being spent either way.
  for (const it of items.filter((x) => x.ridesWith)) {
    if (keep.has(it.ridesWith!)) take(it);
  }
  return keep;
}

export function budgetedBlocks(day: Day, budgetMinutes: number | null) {
  const keep = budgetKeep(day, budgetMinutes);
  if (!keep) return day.blocks;
  return day.blocks
    .map((b) => ({ ...b, exercises: b.exercises.filter((e) => keep.has(e.id)) }))
    .filter((b) => b.exercises.length > 0);
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
