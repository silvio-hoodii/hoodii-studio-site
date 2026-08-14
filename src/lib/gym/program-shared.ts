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
export const BUDGETS = [45, 60, 90] as const;

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

// WORK_SEC is fitted from real session timing data, not guessed: see HealthOS/gym.html's own
// comment pointing at server/fit-session-time.mjs. Kept as the same constant, not re-derived.
const WORK_SEC = 150;
const FIXED_MIN = 10; // warmup + cooldown

export function exMinutes(ex: Exercise): number {
  return ((ex.sets || 1) * (restSeconds(ex.rest) + WORK_SEC)) / 60;
}

export function dayMinutes(day: Day): number {
  return Math.round(
    FIXED_MIN + day.blocks.reduce((a, b) => a + b.exercises.reduce((x, e) => x + exMinutes(e), 0), 0),
  );
}

function exPriority(block: { type: string; label: string }, idx: number): number {
  if (/^Main\b/.test(block.label || '')) return idx === 0 ? 1 : 2;
  if (block.type === 'main') return 2; // Power Primer, Handstand Skill
  if (block.type === 'superset') return idx === 0 ? 2 : 3;
  return 3;
}

/** Which exercise ids survive a time budget. Priority 1 (the main lift) is unconditional: a short
 *  session that skips it is worse than no session. Then fill by priority, program order, and STOP at
 *  the first thing that doesn't fit (never let a cheap accessory displace something more important
 *  just for being short). Ported verbatim from HealthOS/gym.html's budgetKeep(). */
export function budgetKeep(day: Day, minutes: number | null): Set<string> | null {
  if (!day || !minutes) return null; // null budget = run the whole day
  const items: { id: string; pri: number; mins: number; order: number }[] = [];
  day.blocks.forEach((block, bi) =>
    block.exercises.forEach((ex, i) => {
      items.push({ id: ex.id, pri: exPriority(block, i), mins: exMinutes(ex), order: bi * 100 + i });
    }),
  );
  const keep = new Set<string>();
  let spent = FIXED_MIN;
  for (const it of items.filter((x) => x.pri === 1)) {
    keep.add(it.id);
    spent += it.mins;
  }
  for (const it of items.filter((x) => x.pri > 1).sort((a, b) => a.pri - b.pri || a.order - b.order)) {
    if (spent + it.mins > minutes) break;
    keep.add(it.id);
    spent += it.mins;
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
