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
 * `PLATES`, and the cable stacks step by a constant 2.5 lb, which `incrementFor` below derives from
 * the implement. (This comment said the per-exercise `increment` in program.json described the
 * cable step. No slot in the 2026-09-06 week carries one, so every cable lift stepped by the engine
 * default of 5 until 2026-09-27.) A machine with a pin whose positions are NOT evenly spaced would
 * belong here too, and none has been measured; that is an absence of data, not a decision that
 * machines are even.
 */
import equipment from '../../../content/gym/equipment.json';
import movements from '../../../content/gym/movements.json';
import program from '../../../content/gym/program.json';

interface Variant {
  id: string; implement?: string; aliases?: string[];
  station?: string | null; loadable?: boolean; timed?: boolean; doseUnit?: string;
}
interface Movement { variants: Variant[] }

/** Every catalogue variant by id, aliases included, for the facts below. */
const VARIANT_BY_ID: Map<string, Variant> = (() => {
  const out = new Map<string, Variant>();
  for (const m of Object.values((movements as { movements: Record<string, Movement> }).movements)) {
    for (const v of m.variants) {
      out.set(v.id, v);
      for (const a of v.aliases ?? []) if (!out.has(a)) out.set(a, v);
    }
  }
  return out;
})();

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

/* ---- COUNTERWEIGHT, derived from the machine, 2026-09-27 ------------------------------------------
 *
 * THE ASSISTED PULL-UP WAS PROGRESSING UPWARD. The engine has handled `assistance: true` since
 * 2026-08-28, and the client sent `eff.assistance`, and no slot or alt in the 2026-09-06 week carries
 * the key. So the flag arrived false on every request and the card added weight to a counterweight,
 * which is MORE help and an easier set.
 *
 * movements.json has NO FIELD that marks a counterweight variant; both assisted variants say it only
 * in prose. What it does carry is the STATION, and on these two stations the weight opposes his
 * bodyweight instead of adding to it. That is a fact about the machine, the same kind of fact
 * `ladderFor` reads off the implement, so it is keyed here on the station rather than restated on a
 * slot. The step comes from the pull-up variant's own catalogue note ("Assistance moves in 10 lb
 * steps off 40 lb"); the dip machine's step is unmeasured, so it takes the default.
 *
 * A `counterweight: true` field on the variant in movements.json would be the better home, and this
 * table should then read it instead. The program.json flag still counts too, for a slot that ever
 * declares it. */
const COUNTERWEIGHT_STATIONS: Record<string, number | null> = { 'assisted-pullup': 10, 'assisted-dip': null };

const ASSISTED_IN_PROGRAM: Set<string> = (() => {
  const out = new Set<string>();
  const prog = program as { days: Record<string, { blocks: { exercises: { id: string; assistance?: boolean; alts?: { id: string; assistance?: boolean }[] }[] }[] }> };
  for (const day of Object.values(prog.days)) {
    for (const b of day.blocks) {
      for (const e of b.exercises) {
        if (e.assistance) out.add(e.id);
        for (const a of e.alts ?? []) if (a.assistance) out.add(a.id);
      }
    }
  }
  return out;
})();

const stationOf = (id: string): string | null => VARIANT_BY_ID.get(id)?.station ?? null;

/** True when the logged number on this lift is counterweight, so progress means it goes DOWN. */
export function isAssisted(id: string): boolean {
  const st = stationOf(id);
  return ASSISTED_IN_PROGRAM.has(id) || (st != null && st in COUNTERWEIGHT_STATIONS);
}

/** THE LOAD STEP for a lift that has no rack ladder, or undefined to let the engine use its default
 *  of 5. A cable stack moves in 2.5 lb pins (the catalogue says so on the seated row and the cable
 *  reverse fly, and he has logged 72.5 and 87.5 on one), and a counterweight station moves by its
 *  own measured step. An explicit `increment` on the slot in program.json still wins, at the caller. */
export function incrementFor(id: string): number | undefined {
  const st = stationOf(id);
  if (st != null && COUNTERWEIGHT_STATIONS[st] != null) return COUNTERWEIGHT_STATIONS[st]!;
  if (IMPLEMENT_BY_ID.get(id) === 'cable') return 2.5;
  return undefined;
}

/* ---- WHAT KIND OF SET a variant is, so an alternative stops inheriting its slot's ---------------
 *
 * `effectiveExercise` is `{ ...slot, ...alt }`, and alts carry no `timed` or `bodyweight` of their
 * own, so a Hollow Hold or Side Plank swapped in for the hanging knee raise kept the knee raise's
 * reps box, and a KB farmer carry kept whatever its slot said. The type is a property of the variant.
 *
 * Read from the catalogue where it says so (`timed`, a carry's `doseUnit`, `loadable`), and from the
 * alt's own prescription when that is written in seconds ("20s", "30s/side"): the catalogue has no
 * timed flag on the hollow hold or the side plank, while their prescriptions in program.json are
 * both in seconds. An alt's explicit flag in program.json wins over both. Returns null for an id
 * the catalogue does not know, so the caller leaves the inherited type alone rather than guessing. */
export function variantType(alt: { id: string; reps?: string; timed?: boolean; bodyweight?: boolean }): { timed: boolean; bodyweight: boolean } | null {
  const v = VARIANT_BY_ID.get(alt.id);
  if (!v) return null;
  const secondsInPrescription = /^\s*\d+\s*s\b/i.test(alt.reps ?? '');
  const timed = alt.timed ?? (v.timed === true || v.doseUnit === 'carry' || secondsInPrescription);
  const bodyweight = alt.bodyweight ?? (v.loadable === false);
  return { timed, bodyweight };
}

/** Every id (aliases included) whose implement is a barbell: the lifts where plate math means
 *  something. Replaces a hand-typed list in program-shared.ts that named `bench-press` and `bb-ohp`
 *  while the week's ids are `bb-bench-press` and `bb-overhead-press`, so the plates never showed on
 *  either. Sent to the page as data, which keeps the catalogue out of the phone's bundle. */
export function barbellIds(): string[] {
  return [...IMPLEMENT_BY_ID].filter(([, impl]) => impl === 'barbell').map(([id]) => id);
}
