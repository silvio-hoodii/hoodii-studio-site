/**
 * WHAT THE WEEK ACTUALLY DELIVERS, per muscle and per lift, against published dose-response
 * landmarks. Pure arithmetic: no filesystem, no database, no printing.
 *
 * TWO CALLERS, ONE IMPLEMENTATION, AND THAT IS THE ENTIRE POINT OF THIS FILE.
 * `scripts/gym-coverage.mjs` prints it in a terminal and gates a push on it. `/health?s=volume`
 * renders it on his phone. The computation lived only in the script until 2026-08-27, top-level
 * `process.argv` and no exports, so a page could not import it, and the obvious move was to
 * reimplement fractional sets in the page. Two implementations of one piece of arithmetic drift,
 * and the drift is invisible: both would keep printing plausible numbers. That is the same
 * stale-copy disease that put nine wrong `inProgramme` flags in movements.json and a stale body
 * weight in three projects at once.
 *
 * It is .mts and not .ts for one boring reason: node runs it directly (type stripping, no build
 * step, no tsx dependency) and a bare .ts triggers MODULE_TYPELESS_PACKAGE_JSON noise on every
 * script run. tsconfig.json's include list already covers .mts, so tsc checks it like anything else.
 *
 * THE LANDMARKS ARE NOT OURS AND ARE NOT ADJUSTABLE HERE.
 *
 *   Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC. The Resistance Training Dose
 *   Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle
 *   Hypertrophy and Strength Gains. Sports Med. 2026;56(2):481-505. doi:10.1007/s40279-025-02344-w
 *   67 studies, 2,058 participants. Tables 3 and 4.
 *
 * Its conclusion, verbatim, is why sets are counted in halves here: the dose-response relationships
 * "are best represented with the `fractional` quantification method, where indirect sets are counted
 * as half a set".
 *
 * TWO DENOMINATORS, AND CONFLATING THEM IS THE MISTAKE THIS FILE PREVENTS. Pelland's hypertrophy
 * tiers are per MUSCLE. Its strength tiers are per ASSESSED EXERCISE. A muscle can be well served
 * for size while the lift that trains it is under-dosed for strength, and the reverse. Both are
 * returned separately and must never be added together.
 */

/* ---- the shapes this reads, structural on purpose ---------------------------------------------
 * Minimal by design, so both callers fit without a cast: the script hands it `JSON.parse` output and
 * the page hands it a fully typed `Program`. Anything this file does not use is not named here. */

export interface CoverageExercise {
  id: string;
  name: string;
  sets: number;
}
export interface CoverageBlock {
  label: string;
  role: string;
  exercises: CoverageExercise[];
}
export interface CoverageDay {
  blocks: CoverageBlock[];
}
export interface CoverageProgram {
  days: Record<string, CoverageDay>;
}

export interface CatalogueVariant {
  id: string;
  name: string;
  zone: string;
  station: string | null;
  loadable: boolean;
  aliases?: string[];
  primary?: string[];
  secondary?: string[];
  confidence?: string;
  note?: string;
}
export interface CatalogueMovement {
  name: string;
  primary: string[];
  secondary: string[];
  confidence: string;
  note?: string;
  variants: CatalogueVariant[];
}
export interface MovementCatalogue {
  muscles: Record<string, string>;
  movements: Record<string, CatalogueMovement>;
}

/* ---- Pelland 2026 Table 3, hypertrophy, fractional weekly sets PER MUSCLE ---- */
export interface Tier {
  min: number;
  max: number;
  tier: string;
  note: string;
}
export const HYPERTROPHY_TIERS: Tier[] = [
  { min: 0, max: 3.99, tier: 'BELOW MINIMUM', note: 'under the minimum effective dose of 4' },
  { min: 4, max: 4.99, tier: 'minimum', note: 'sufficient to elicit detectable hypertrophy' },
  { min: 5, max: 10, tier: 'HIGHER EFF.', note: '~6 more sets needed for the next detectable increment' },
  { min: 11, max: 18, tier: 'intermediate', note: '~8.5 more sets needed for the next increment' },
  { min: 19, max: 29, tier: 'lower eff.', note: '~10.75 more sets needed for the next increment' },
  { min: 30, max: 42, tier: 'lowest eff.', note: '~12.5 more sets needed for the next increment' },
  { min: 43, max: 1e9, tier: 'unclear', note: 'insufficient data, or potentially less hypertrophy' },
];

/* ---- Pelland 2026 Table 4, strength, fractional weekly sets PER ASSESSED EXERCISE ---- */
export const STRENGTH_TIERS: Tier[] = [
  { min: 0, max: 0.99, tier: 'BELOW MINIMUM', note: 'under the minimum effective dose of 1' },
  { min: 1, max: 1.99, tier: 'minimum', note: 'sufficient to elicit detectable strength gain' },
  { min: 2, max: 2.99, tier: 'HIGHER EFF.', note: '~0.75 more sets for the next detectable gain' },
  { min: 3, max: 4, tier: 'intermediate', note: '~2.25 more sets for the next detectable gain' },
  { min: 5, max: 1e9, tier: 'lower eff.', note: 'additional sets do not consistently enhance strength > SDES' },
];

export const MIN_EFFECTIVE_DOSE = 4;
export const EFFICIENT_ZONE_TOP = 10;

export function tierFor(tiers: Tier[], n: number): Tier {
  return tiers.find((t) => n >= t.min && n <= t.max) ?? tiers[tiers.length - 1]!;
}

/** The rotation, not the calendar week. The keys are weekday names and mean nothing of the sort:
 *  src/lib/gym/cycle.ts picks the next day from what was actually logged. Kept in this order because
 *  every per-day column in every report reads left to right as Lower A, Upper A, Lower B, Upper B. */
export const COVERAGE_DAY_ORDER = ['monday', 'tuesday', 'thursday', 'friday'];

export interface MuscleRow {
  muscle: string;
  label: string;
  sets: number;
  tier: Tier;
  belowMinimum: boolean;
  pastEfficient: boolean;
  byDay: number[];
}
export interface LiftRow {
  id: string;
  name: string;
  sets: number;
  days: string[];
  loadable: boolean;
  tier: Tier;
}
export interface RedundantPair {
  day: string;
  block: string;
  lead: string;
  partner: string;
  shared: string[];
  alsoShared: string[];
  strict: boolean;
  sets: number;
}
export interface UnloadableRow {
  day: string;
  block: string;
  name: string;
  sets: number;
}
export interface UnsourcedRow {
  day: string;
  id: string;
  name: string;
  why: string;
}
export interface Coverage {
  dayOrder: string[];
  muscleLabels: Record<string, string>;
  /** Sorted by weekly sets, descending. */
  perMuscle: MuscleRow[];
  /** Sorted by weekly sets, descending. */
  perLift: LiftRow[];
  redundantPairs: RedundantPair[];
  unloadableInMain: UnloadableRow[];
  unsourced: UnsourcedRow[];
  /** Exercise ids the catalogue does not describe. Nothing above is true while this is non-empty. */
  missing: string[];
  totals: { below: number; pastEfficient: number; strictPairs: number; unsourcedNames: number };
}

interface FlatVariant extends CatalogueVariant {
  movement: string;
  primary: string[];
  secondary: string[];
  confidence: string;
  selection: string;
}

/** Every variant by id AND by alias. A movement owns the muscles; a variant overrides them only
 *  where the mechanics genuinely differ, so an attribution is written once and cannot drift. */
export function flattenCatalogue(cat: MovementCatalogue): Map<string, FlatVariant> {
  const byId = new Map<string, FlatVariant>();
  for (const [mid, m] of Object.entries(cat.movements)) {
    for (const v of m.variants) {
      const flat: FlatVariant = {
        ...v,
        movement: mid,
        primary: v.primary ?? m.primary,
        secondary: v.secondary ?? m.secondary,
        confidence: v.confidence ?? m.confidence,
        selection: v.note ?? m.note ?? '',
      };
      byId.set(v.id, flat);
      for (const a of v.aliases ?? []) byId.set(a, flat);
    }
  }
  return byId;
}

export function computeCoverage(
  program: CoverageProgram,
  cat: MovementCatalogue,
  opts: { onlyDay?: string | null } = {},
): Coverage {
  const byId = flattenCatalogue(cat);
  const onlyDay = opts.onlyDay ?? null;

  const missing: string[] = [];
  const perMuscle = new Map<string, number>();
  const perMuscleByDay = new Map<string, Map<string, number>>();
  const perExercise = new Map<string, { sets: number; days: Set<string>; name: string; loadable: boolean }>();
  const redundantPairs: RedundantPair[] = [];
  const unloadableInMain: UnloadableRow[] = [];
  const unsourced: UnsourcedRow[] = [];

  const bump = (map: Map<string, number>, key: string, by: number) => map.set(key, (map.get(key) ?? 0) + by);

  for (const [dayKey, day] of Object.entries(program.days ?? {})) {
    if (!day?.blocks) continue;
    if (onlyDay && dayKey !== onlyDay) continue;
    const dayMap = new Map<string, number>();
    perMuscleByDay.set(dayKey, dayMap);

    for (const block of day.blocks) {
      const lead = block.exercises[0];
      const leadInfo = lead ? byId.get(lead.id) : undefined;

      block.exercises.forEach((ex, idx) => {
        const info = byId.get(ex.id);
        if (!info) {
          missing.push(`${dayKey}/${block.label}/${ex.id}`);
          return;
        }
        const sets = Number(ex.sets) || 0;

        for (const m of info.primary) {
          bump(perMuscle, m, sets);
          bump(dayMap, m, sets);
        }
        for (const m of info.secondary) {
          bump(perMuscle, m, sets * 0.5);
          bump(dayMap, m, sets * 0.5);
        }

        const seen = perExercise.get(ex.id) ?? { sets: 0, days: new Set<string>(), name: ex.name, loadable: info.loadable };
        seen.sets += sets;
        seen.days.add(dayKey);
        perExercise.set(ex.id, seen);

        /* The Q4 rule, from Zhang 2025: a partner may not share a muscle with its lead lift.
         * "similar biomechanical supersets led to significantly less volume load than traditional
         * sets".
         *
         * TWO STRICTNESSES, ON PURPOSE. Whether an overlap counts depends on judgement calls in the
         * catalogue (is a bent-over row's trunk brace "abs"?), and tuning those calls until the
         * count matches a number someone already had in mind is confirmation bias with extra steps.
         * So both are reported and neither is hidden: STRICT is primary against primary and is not
         * arguable; LOOSE also catches a partner whose primary muscle is a synergist of the lead,
         * which is where the judgement lives. */
        if (idx > 0 && leadInfo && lead) {
          const leadAll = [...leadInfo.primary, ...leadInfo.secondary];
          const strict = info.primary.filter((m) => leadInfo.primary.includes(m));
          const loose = info.primary.filter((m) => leadAll.includes(m) && !strict.includes(m));
          if (strict.length || loose.length) {
            redundantPairs.push({
              day: dayKey,
              block: block.label,
              lead: lead.name,
              partner: ex.name,
              shared: strict,
              alsoShared: loose,
              strict: strict.length > 0,
              sets,
            });
          }
        }

        if (info.loadable === false && block.role === 'main') {
          unloadableInMain.push({ day: dayKey, block: block.label, name: ex.name, sets });
        }
        if (info.confidence === 'unsourced') {
          unsourced.push({ day: dayKey, id: ex.id, name: ex.name, why: info.selection });
        }
      });
    }
  }

  const dayOrder = COVERAGE_DAY_ORDER.filter((d) => perMuscleByDay.has(d));

  const muscleRows: MuscleRow[] = [...perMuscle.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, sets]) => {
      const tier = tierFor(HYPERTROPHY_TIERS, sets);
      return {
        muscle,
        label: cat.muscles[muscle] ?? muscle,
        sets,
        tier,
        belowMinimum: sets < MIN_EFFECTIVE_DOSE,
        pastEfficient: sets > EFFICIENT_ZONE_TOP,
        byDay: dayOrder.map((d) => perMuscleByDay.get(d)?.get(muscle) ?? 0),
      };
    });

  const liftRows: LiftRow[] = [...perExercise.entries()]
    .sort((a, b) => b[1].sets - a[1].sets)
    .map(([id, v]) => ({
      id,
      name: v.name,
      sets: v.sets,
      days: [...v.days],
      loadable: v.loadable,
      tier: tierFor(STRENGTH_TIERS, v.sets),
    }));

  return {
    dayOrder,
    muscleLabels: cat.muscles,
    perMuscle: muscleRows,
    perLift: liftRows,
    redundantPairs,
    unloadableInMain,
    unsourced,
    missing,
    totals: {
      below: muscleRows.filter((m) => m.belowMinimum).length,
      pastEfficient: muscleRows.filter((m) => m.pastEfficient).length,
      strictPairs: redundantPairs.filter((p) => p.strict).length,
      unsourcedNames: new Set(unsourced.map((u) => u.name)).size,
    },
  };
}

/* ---- the gated state, and why it is only three lists -------------------------------------------
 *
 * A GATE THAT IS EXPECTED TO FAIL CANNOT SIGNAL A REGRESSION. scripts/gym-coverage.mjs exited 1
 * every run before 2026-08-27 and its own handoff said that was correct: 11 of 16 muscles sit past
 * the efficient zone and four exercises have no source, all known and all accepted. A permanently
 * red light teaches everyone to ignore it, and it cannot get redder: pushing a muscle below its
 * minimum dose would not have changed the exit code by one bit.
 *
 * So the exit code is a comparison against an ACCEPTED, DATED baseline in
 * content/gym/coverage-baseline.json, and only these three lists are in it. Each is a state nobody
 * has ever argued should be tolerated:
 *
 *   belowMinimum   a muscle under 4 fractional sets a week. Pelland's own floor.
 *   strictPairs    a partner whose main muscle is the lead lift's main muscle. Zhang's finding.
 *   unsourced      an exercise in the week with no basis recorded anywhere.
 *
 * PAST THE EFFICIENT ZONE IS DELIBERATELY NOT IN IT. It is diminishing returns, not harm, and 11
 * muscles are there today. It is reported every run, and the per-muscle diff against the baseline
 * makes a change visible without pretending a judgement call is a rule. */
export interface CoverageState {
  belowMinimum: string[];
  strictPairs: string[];
  unsourced: string[];
  perMuscle: Record<string, number>;
}

/** One stable key per strict pairing, so the same pair on the same day compares equal across runs
 *  even when the exercise is renamed in the same edit. */
const pairKey = (p: RedundantPair) => `${p.day} | ${p.block} | ${p.lead} + ${p.partner}`;

export function coverageState(c: Coverage): CoverageState {
  return {
    belowMinimum: c.perMuscle.filter((m) => m.belowMinimum).map((m) => m.muscle).sort(),
    strictPairs: c.redundantPairs.filter((p) => p.strict).map(pairKey).sort(),
    unsourced: [...new Set(c.unsourced.map((u) => u.id))].sort(),
    perMuscle: Object.fromEntries(c.perMuscle.map((m) => [m.muscle, m.sets])),
  };
}

export interface CoverageDiff {
  regressions: { list: string; item: string }[];
  fixed: { list: string; item: string }[];
  muscleMoves: { muscle: string; from: number; to: number }[];
}

export function diffCoverage(baseline: CoverageState, current: CoverageState): CoverageDiff {
  const regressions: CoverageDiff['regressions'] = [];
  const fixed: CoverageDiff['fixed'] = [];
  for (const list of ['belowMinimum', 'strictPairs', 'unsourced'] as const) {
    const was = new Set(baseline[list] ?? []);
    const now = new Set(current[list] ?? []);
    for (const item of now) if (!was.has(item)) regressions.push({ list, item });
    for (const item of was) if (!now.has(item)) fixed.push({ list, item });
  }
  const muscleMoves: CoverageDiff['muscleMoves'] = [];
  const muscles = new Set([...Object.keys(baseline.perMuscle ?? {}), ...Object.keys(current.perMuscle)]);
  for (const m of [...muscles].sort()) {
    const from = baseline.perMuscle?.[m] ?? 0;
    const to = current.perMuscle[m] ?? 0;
    if (from !== to) muscleMoves.push({ muscle: m, from, to });
  }
  return { regressions, fixed, muscleMoves };
}
