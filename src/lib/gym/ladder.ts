/** WHICH WEIGHTS EXIST for a given lift, read off the real gym.
 *
 * `progression.ts` is a pure function with no I/O by design, so it takes the rack as an argument.
 * This is the one place that goes and gets it, and it is imported by the plan route and by
 * `scripts/check-ladder.mjs`, which are the two things that decide what number a card shows.
 *
 * WHY THIS IS DERIVED AND NOT A FIELD ON 32 SLOTS. `movements.json` already records the implement
 * of every variant, and `equipment.json` already records what the gym holds. A `ladder` field
 * copied onto each dumbbell slot would be a third statement of the same fact, and this repo has
 * lost that argument three times: `inProgramme` was restated on 103 variants and nine were wrong the
 * day the file shipped, the body-metrics rule exists because a weight was copied into four files,
 * and the immigration rule exists for the same reason. Every copy of a fact is a fact that goes
 * stale silently.
 *
 * ONLY DUMBBELLS GET ONE, today. The barbell reaches any multiple of 5 with the plates in
 * `PLATES`, and the cable stacks step by a constant 2.5 lb that the per-exercise `increment`
 * already describes correctly. A machine with a pin whose positions are NOT evenly spaced would
 * belong here too, and none has been measured; that is an absence of data, not a decision that
 * machines are even.
 */
import equipment from '../../../content/gym/equipment.json';
import movements from '../../../content/gym/movements.json';
import program from '../../../content/gym/program.json';

interface Variant { id: string; implement?: string; aliases?: string[] }
interface Movement { variants: Variant[] }

const IMPLEMENT_BY_ID: Map<string, string> = (() => {
  const out = new Map<string, string>();
  for (const m of Object.values((movements as { movements: Record<string, Movement> }).movements)) {
    for (const v of m.variants) {
      if (!v.implement) continue;
      out.set(v.id, v.implement);
      // Aliases resolve too, for the same reason every history read does: an alt that is an alias of
      // its slot's own variant is the SAME exercise, and reading it as a different one split twelve
      // bodyweight sets from three at 210 lb on 2026-08-28.
      for (const a of v.aliases ?? []) out.set(a, v.implement);
    }
  }
  return out;
})();

/** Ascending, de-duplicated, positive. Sorted here as well as in `suggest` because a caller that
 *  skips the engine (check-ladder does its own arithmetic) would otherwise read it positionally. */
const DUMBBELLS: number[] = (() => {
  const raw = (equipment as { portable?: { dumbbells?: { ladderLb?: unknown } } })
    .portable?.dumbbells?.ladderLb;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((n): n is number => typeof n === 'number' && n > 0))]
    .sort((a, b) => a - b);
})();

/** The rack for one exercise id, or null when the implement has no fixed set of weights. Null and
 *  an empty array mean the same thing to `suggest`, which falls back to `increment` arithmetic. */
export function ladderFor(id: string): number[] | null {
  return IMPLEMENT_BY_ID.get(id) === 'dumbbell' && DUMBBELLS.length ? DUMBBELLS : null;
}

/** Exported for the tests and for check-ladder, which reports on the rack itself. */
export const dumbbellLadder = (): number[] => DUMBBELLS;

/* ---- `progression: "fixed"`, resolved the same way and for the same reason ---------------------
 *
 * Whether a lift's rep count may move is a property of the lift, identical for every caller, and it
 * already lives in program.json. Sending it from the client would be a fourth field crossing a seam
 * that has silently dropped two: `rangeWidth` sat dead for five days and `assistance` was added in
 * the commit that documented the hazard. So it is read here.
 *
 * An id appearing on two days with two different `progression` values would be a contradiction in
 * the file rather than a case to model, so the first one found wins and `validate.mjs` is where a
 * disagreement should be caught. Today no id does. */
const FIXED_REPS: Set<string> = (() => {
  const out = new Set<string>();
  const prog = program as { days: Record<string, { blocks: { exercises: { id: string; progression?: string }[] }[] }> };
  for (const day of Object.values(prog.days)) {
    for (const b of day.blocks) {
      for (const e of b.exercises) if (e.progression === 'fixed') out.add(e.id);
    }
  }
  return out;
})();

/** True when the rep count on this lift is a ceiling a person set and the engine may not move it. */
export const hasFixedReps = (id: string): boolean => FIXED_REPS.has(id);
