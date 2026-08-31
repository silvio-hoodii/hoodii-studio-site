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
 *   Hypertrophy and Strength Gains. Sports Med. doi:10.1007/s40279-025-02344-w
 *
 *   THE DOI, NOT A PAGE RANGE, since 2026-08-29. This cited "56(2):481-505" and nobody had opened
 *   the paper: he asked "where does the 10 come from, literally find me the citation" and the honest
 *   answer was a Springer landing page and a search summary. The full text was fetched that day and
 *   every number here checks out against it, but the copy available is the online-first version and
 *   carries no volume or pages, so the page range remains UNVERIFIED and is not printed.
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
  /** Read only so the week table can print it. Nothing counts reps: a set is a set here. */
  reps?: string;
  /** The lead's rest is what a partner would ride in, so an empty one is the size of the hole. */
  rest?: string;
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

/* ---- Pelland 2026 Tables 3 and 4, the efficiency tiers -----------------------------------------
 *
 * A TIER IS DEFINED BY ITS FLOOR ALONE, AND `max` IS GONE. Changed 2026-08-31, and this is the
 * second bug found in this file in two days.
 *
 * WHAT WAS WRONG. Every tier carried both a `min` and a `max`, hand-typed from the paper's printed
 * bands ("5-10", "11-18"), and `tierFor` was `find((t) => n >= t.min && n <= t.max)` with
 * `?? tiers[tiers.length - 1]` as the fallback. The paper prints INTEGER bands. This file counts
 * sets in HALVES, and says so in its own header. So 10.5, 18.5, 29.5 and 42.5 matched no tier at
 * all, fell through to the fallback, and were reported as the LAST tier in the list, which for
 * hypertrophy is `unclear: insufficient data, or potentially less hypertrophy` and for strength is
 * `lower eff.` The worst label in the table, printed for a value sitting mid-band.
 *
 * IT WAS LIVE. Grip and forearms carries 18.5 fractional sets this week and `MuscleRow.tier` reads
 * `unclear` for it right now. The reason nobody saw it is that scripts/gym-coverage.mjs prints
 * `loadedTier`, and grip's loaded figure is 17, an integer. A half-set only has to appear in the
 * column that IS displayed for this to reach his phone.
 *
 * THE FIX IS NOT TO WIDEN THE TWO NUMBERS. Making `max: 10` into `max: 10.99` fixes 10.5 and leaves
 * the class alive: two hand-typed numbers per row that have to agree with the next row's, seven rows,
 * and nothing checks the agreement. The tiers are a partition of the number line, so the honest
 * representation is one boundary per tier and the band derived from the ordering. A gap cannot be
 * expressed now, which is the difference between eliminating an error class and checking for it.
 *
 * A VALUE BETWEEN TWO BANDS TAKES THE LOWER BAND, and that is a rounding decision, not a finding:
 * 10.5 reads as `HIGHER EFF.` (the paper's 5-10) rather than `intermediate` (11-18), because 10.5 is
 * not yet 11. It is stated here rather than hidden in an inequality.
 *
 * The range as printed comes from `tierBand` below, derived from these floors, so the label a page
 * shows cannot disagree with the tier the lookup returned. */
export interface Tier {
  /** Inclusive floor. A tier runs from here up to the next tier's floor, exclusive. */
  min: number;
  tier: string;
  note: string;
}

/* THE PRINTED RANGE IS DERIVED FROM THE FLOORS, never typed beside them.
 *
 * The first draft of this change carried a `band: string` on every tier holding the paper's own
 * wording ("5-10", "43+"). That is the same defect as `max`, one step to the left: a second copy of
 * a boundary, hand-maintained, next to the copy that computes. It also had no reader, which is the
 * `rir` shape this repo has now dropped twice. Derived here, the label cannot disagree with the
 * lookup, and it reproduces Table 3 and Table 4 exactly.
 *
 * `hi - 1` and not the next floor: the bands the paper prints are integer-inclusive, so the tier
 * whose floor is 11 and whose successor's floor is 19 prints "11-18", as Table 3 does. */
export function tierBand(tiers: Tier[], t: Tier): string {
  const i = tiers.indexOf(t);
  const next = tiers[i + 1];
  if (!next) return `${t.min}+`;
  const hi = next.min - 1;
  return hi <= t.min ? String(t.min) : `${t.min}-${hi}`;
}

/* ---- Table 3, hypertrophy, fractional weekly sets PER MUSCLE ---- */
export const HYPERTROPHY_TIERS: Tier[] = [
  { min: 0, tier: 'BELOW MINIMUM', note: 'under the minimum effective dose of 4' },
  { min: 4, tier: 'minimum', note: 'sufficient to elicit detectable hypertrophy' },
  { min: 5, tier: 'HIGHER EFF.', note: '~6 more sets needed for the next detectable increment' },
  { min: 11, tier: 'intermediate', note: '~8.5 more sets needed for the next increment' },
  { min: 19, tier: 'lower eff.', note: '~10.75 more sets needed for the next increment' },
  { min: 30, tier: 'lowest eff.', note: '~12.5 more sets needed for the next increment' },
  { min: 43, tier: 'unclear', note: 'insufficient data, or potentially less hypertrophy' },
];

/* ---- Table 4, strength, fractional weekly sets PER ASSESSED EXERCISE ----
 *
 * THE TOP TIER IS OPEN-ENDED AND PAST IT IS A PRICE, NOT A WALL. Its note used to read "additional
 * sets do not consistently enhance strength > SDES", which is Table 4's own description cell and is
 * true, and which every reader of this file took as a ceiling. The paper says what happens past it,
 * verbatim, in section 4.3 of pelland-2025-dose-response-fulltext.txt (right column of lines 830-840
 * joining the left column of 841-845, the PDF extraction interleaves the two columns):
 *
 *   "Indeed, the estimated effect of one `fractional' weekly set exceeded the SDES; therefore, one
 *    set was identified as the minimum effective dose. Additional increments in the SDES were
 *    observed up to approximately 4 `fractional' weekly sets, but not beyond this point. However,
 *    the SDES of 3.96% may be greater than what some deem practically relevant; additional sets
 *    beyond this point may produce additional strength gains, albeit less than the SDES, prior to
 *    the functional plateau."
 *
 * So the top tier means "further sets still buy strength, just less than this study could detect".
 * The note says that now. A fabricated ceiling in this same file was used on 2026-08-29 to refuse 25
 * to 43 legal partner exercises per block, and that is what re-committing it costs. */
export const STRENGTH_TIERS: Tier[] = [
  { min: 0, tier: 'BELOW MINIMUM', note: 'under the minimum effective dose of 1' },
  { min: 1, tier: 'minimum', note: 'sufficient to elicit detectable strength gain' },
  { min: 2, tier: 'HIGHER EFF.', note: '~0.75 more sets for the next detectable gain' },
  { min: 3, tier: 'intermediate', note: '~2.25 more sets for the next detectable gain' },
  { min: 5, tier: 'lower eff.', note: 'more sets may still add strength, by less than this study could detect' },
];

export const MIN_EFFECTIVE_DOSE = 4;
export const EFFICIENT_ZONE_TOP = 10;

/** The last tier whose floor `n` has reached. Every real number lands in exactly one tier, by
 *  construction: the first floor is 0, the list is ordered, and there is no upper bound to fall off.
 *  Negative input cannot occur (sets are non-negative) and would return the first tier. */
export function tierFor(tiers: Tier[], n: number): Tier {
  let found = tiers[0]!;
  for (const t of tiers) {
    if (n >= t.min) found = t;
    else break;
  }
  return found;
}

/** The rotation, not the calendar week. The keys are weekday names and mean nothing of the sort:
 *  src/lib/gym/cycle.ts picks the next day from what was actually logged. Kept in this order because
 *  every per-day column in every report reads left to right as Lower A, Upper A, Lower B, Upper B. */
export const COVERAGE_DAY_ORDER = ['monday', 'tuesday', 'thursday', 'friday'];

/** One exercise's contribution to ONE muscle on ONE day. */
export interface Contribution {
  name: string;
  /** Fractional sets: the full count for a muscle the lift trains directly, half for a synergist. */
  sets: number;
  /** The set count actually prescribed, BEFORE halving. Returned because without it the cell is
   *  ambiguous and he said so: "There is one DB Romanian deadlift ... Is that because it is halved?"
   *  A cell reading "Front Squat 1" looks like one set and is two counted at half, while "BB Back
   *  Squat 4" is four counted in full. Same-looking number, two meanings, and nothing on the page
   *  said which. The page prints "half of 2" beside the halved ones now. */
  rawSets: number;
  primary: boolean;
  /** False for a jump, a carry or a hold. See `loadedSets` on MuscleRow. */
  loadable: boolean;
}

export interface MuscleRow {
  muscle: string;
  label: string;
  sets: number;
  /* A BOX JUMP IS NOT A SET OF SQUATS, AND THIS TABLE COUNTED IT AS ONE. Added 2026-08-30, on his
   * reading of the numbers: "I don't know if all the exercises should represent the same weight in
   * that table ... we're either misrepresenting or misadding the contribution of an exercise."
   *
   * He is right, and the size of it is not small. 35% of the quadriceps number and 39% of the
   * abdominals number came from exercises this same file's STRENGTH table labels "NO, cannot
   * progress": box jumps, lateral bounds, dead bugs, hanging knee raises, planks and carries.
   * Raising the box jump from 3 sets to 5 on 2026-08-29 added 2 quad and 2 glute "sets" that are
   * three explosive reps at bodyweight.
   *
   * Pelland's meta-regression is fitted on RESISTANCE TRAINING sets. A three-rep jump trained for
   * speed, a 30-second carry and an anti-rotation hold are real training and are in the programme
   * for real reasons, but they are not the unit the dose-response curve is denominated in, so
   * adding them to it inflates the number that every "is there room for more work" decision was
   * being made against.
   *
   * BOTH ARE REPORTED AND NEITHER IS HIDDEN, because the split is a judgement and not something the
   * paper hands over. `sets` is every fractional set as before, so nothing that read this number
   * before silently changes meaning. `loadedSets` excludes the non-loadable work. `loadable` in
   * movements.json means "weight can be added", which is a proxy for "the kind of set the curve was
   * fitted on" and not the same thing: a carry is loaded and still is not a hypertrophy set. Where
   * they disagree, the honest reading is the one that does not decide anything on its own. */
  loadedSets: number;
  tier: Tier;
  /** The tier of `loadedSets`, which is the one a dose decision should be read against. */
  loadedTier: Tier;
  belowMinimum: boolean;
  pastEfficient: boolean;
  byDay: number[];
  /* WHICH EXERCISES MAKE UP EACH OF THOSE DAY NUMBERS, added 2026-08-28 on his third attempt at
     asking for it: "you're saying glute, lower A, 13.5. Now I have to go up and somehow figure out
     glutes from lower A from the week, block by block, which doesn't really make sense."
     He was right and the two tables were the problem: one held the totals and the other held the
     exercises, and joining them was work he had to do by eye. One array per day, aligned with
     `byDay` and with `dayOrder`, so a cell can print its own arithmetic. */
  byDayDetail: Contribution[][];
}
/* ONE LIFT, AND THE UNIT IT IS GRADED IN. Rebuilt 2026-08-31.
 *
 * THE BUG. This row held `sets` (every set of this exact exercise, summed) and `tier`
 * (`tierFor(STRENGTH_TIERS, sets)`). Those two are in DIFFERENT UNITS. The sum is Pelland's
 * `direct` count; Table 4 is denominated in `fractional`, and the paper is explicit that direct is
 * the worst of the three, from pelland-2025-dose-response-fulltext.txt lines 516-519:
 *
 *   "Regarding weekly volume for muscle strength, there was very strong evidence that `fractional'
 *    outperforms `total' (2xLog(BF)=18.21) and `direct' (2xLog(BF)=45.96). Given the evidence was
 *    strongest for the `fractional' model, the following sections focus on the results for this
 *    quantification method."
 *
 * AND THE STRENGTH RULE IS NOT THE HYPERTROPHY RULE. Lines 175-186:
 *
 *   "For strength, direct sets were those that trained the exact exercise used for the strength
 *    assessment. Indirect sets were any that were likely to meaningfully train the muscle(s)
 *    involved in the strength assessment. This includes the primary force generator and synergists
 *    for the strength assessment. For example, a study measuring back squat 1RM strength consisting
 *    of 5 sets of back squats in one session, 5 sets of back squats in a second session, and 5 sets
 *    of leg presses in a third session would result in a weekly volume quantified as `total',
 *    `fractional', and `direct' of 15, 12.5, and 10, respectively."
 *
 * A leg press set counts HALF toward back squat strength. This file counted it as zero.
 *
 * WHAT THAT DID ON HIS PHONE. /health printed "BB Back Squat 4" under prose reading "past 5 the
 * extra sets stop paying", which reads as room to add. Recomputed here: the squat pattern is at 19.5
 * fractional sets, four times past the point where the paper stops finding detectable increments.
 * The instrument was recommending the one intervention that cannot work.
 *
 * BOTH UNITS ARE REPORTED AND `sets` KEEPS ITS MEANING, so nothing that read it silently changes.
 * `tier` moves to the fractional count, which is the one correction that had to happen, and
 * `directTier` preserves what the old field said for anything that wants to show the change. */
export interface LiftRow {
  id: string;
  name: string;
  /** Sets of THIS EXACT exercise, summed over the week. Pelland's `direct`. */
  sets: number;
  /** `sets` + 0.5 x the sets of every OTHER exercise in the week whose PRIMARY muscles intersect
   *  this lift's primary muscles. Pelland's `fractional`, read strictly. */
  fractionalSets: number;
  /** The same, with the indirect test widened: any other exercise that touches one of this lift's
   *  primary OR synergist muscles, in either of its own roles.
   *
   *  TWO STRICTNESSES, REPORTED SIDE BY SIDE, exactly as `redundantPairs` already does and for the
   *  same reason. "Likely to meaningfully train the muscle(s) involved" is a judgement, and tuning
   *  the catalogue until one number matches an expectation is confirmation bias with extra steps.
   *  Where the two disagree, the honest reading is the one that decides nothing on its own. */
  fractionalSetsLoose: number;
  days: string[];
  /** Days carrying this exact lift + 0.5 per day carrying only an indirect one. Pelland's
   *  `fractional` frequency, from the worked example above: 3 sessions, one of them leg press, is a
   *  fractional frequency of 2.5.
   *
   *  THIS IS THE NUMBER WITH THE LEVER IN IT, and it is here because the volume tier has stopped
   *  discriminating (see `strengthTierSaturated`). Verified in the full text, lines 544-546: the
   *  marginal slope of fractional FREQUENCY on strength is 3.27% per session [95% CrI 2.74, 3.84],
   *  credible interval excluding null. Lines 540-546 for hypertrophy: 0.32% [95% CrI -0.14, 0.82],
   *  interval containing null, "inconsistent and compatible with negligible effects". Against
   *  VOLUME's 0.21% per set for strength [95% CrI 0.16, 0.26]. One more session is worth more than
   *  a dozen more sets, and it costs almost nothing for size. */
  fractionalFrequency: number;
  loadable: boolean;
  /** Read off `fractionalSets`. Table 4's unit. */
  tier: Tier;
  /** Read off `sets`. What `tier` used to hold, kept so the correction is showable rather than
   *  silent, and so nothing has to trust this comment about which unit changed. */
  directTier: Tier;
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
/** One exercise, as the week table prints it. */
export interface WeekSlot {
  name: string;
  sets: number;
  reps: string;
  /** Primary muscles, then synergists, each with the WEEKLY total that muscle already carries. That
   *  pairing is the whole point of the table: it puts "this feeds triceps" next to "triceps are at
   *  22" on one line, which is the join he has been making in his head across two screens. */
  feeds: { label: string; weekly: number; primary: boolean }[];
}

/** One block of the week, and whether anything rides in its rest. */
export interface WeekBlock {
  day: string;
  label: string;
  role: string;
  /** The lead's rest, which is the size of the gap a partner would fill. */
  rest: string;
  slots: WeekSlot[];
  /** No partner. Nine blocks are in this state and nothing on any page has ever shown him where. */
  solo: boolean;
}

export interface Coverage {
  dayOrder: string[];
  muscleLabels: Record<string, string>;
  /* THE WEEK AS A LIST OF BLOCKS, added 2026-08-28 on his ask: "I need to view the whole thing in
     maybe just one big table because otherwise I can't understand everything you're saying."
     The per-muscle table has existed since 2026-08-27 and he had never seen it; what it cannot show
     is WHERE the sets come from and which rest windows are empty, which is the half every decision
     in front of him now depends on. Derived from the same pass, so it cannot disagree with the
     muscle totals printed beside it. */
  weekBlocks: WeekBlock[];
  /** Sorted by weekly sets, descending. */
  perMuscle: MuscleRow[];
  /** Sorted by weekly sets, descending. */
  perLift: LiftRow[];
  redundantPairs: RedundantPair[];
  unloadableInMain: UnloadableRow[];
  unsourced: UnsourcedRow[];
  /** Exercise ids the catalogue does not describe. Nothing above is true while this is non-empty. */
  missing: string[];
  totals: {
    below: number;
    pastEfficient: number;
    strictPairs: number;
    unsourcedNames: number;
    /* A TIER THAT GIVES EVERY ROW THE SAME LABEL IS NOT MEASURING ANYTHING, and it must say so
       rather than printing the label 35 times. Added 2026-08-31 with the fractional-set fix.
       See the note on `strengthTierSaturated` for what it costs to ignore this. */
    strengthTierSaturated: boolean;
    /** How many distinct strength tiers the week's lifts fall into. 1 means saturated. */
    strengthTiersSeen: number;
  };
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
  /** The same accumulation, excluding jumps, carries and holds. See loadedSets on MuscleRow. */
  const perMuscleLoaded = new Map<string, number>();
  const perMuscleByDay = new Map<string, Map<string, number>>();
  /** muscle -> day -> the exercises that fed it that day, in session order. */
  const perMuscleDetail = new Map<string, Map<string, Contribution[]>>();
  const perExercise = new Map<string, { sets: number; days: Set<string>; name: string; loadable: boolean }>();
  const redundantPairs: RedundantPair[] = [];
  const unloadableInMain: UnloadableRow[] = [];
  const unsourced: UnsourcedRow[] = [];
  /* `id` IS ON THIS AND `WeekBlock` DOES NOT PRINT IT. Added 2026-08-31: the fractional-set pass
     below needs to ask of every slot in the week "is this the same lift, and if not does it touch
     the same muscles", and the identity half of that question cannot be answered by a display name.
     The alternative was matching on `slot.name`, which is the drift that the equivalent-ids bug was:
     one exercise, two names, and a query that read only one of them offered him 5 lb for a machine
     he loads to 210. */
  const rawSlots: {
    day: string; block: string; role: string; rest: string; soloBlock: boolean; id: string;
    slot: { name: string; sets: number; reps: string; feeds: { muscle: string; primary: boolean }[] };
  }[] = [];

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

        /* THE CONTRIBUTION IS RECORDED WHERE THE SET IS COUNTED, in the same two loops, so a cell
           printing "BB Back Squat 4, Bulgarian Split Squat 3" is printing the very numbers that were
           added into the total beside it. Building this list from a second walk of the programme is
           how a breakdown comes to disagree with the sum it breaks down. */
        const note = (m: string, n: number, primary: boolean) => {
          let byDay = perMuscleDetail.get(m);
          if (!byDay) perMuscleDetail.set(m, (byDay = new Map()));
          const list = byDay.get(dayKey) ?? [];
          list.push({ name: ex.name, sets: n, rawSets: sets, primary, loadable: info.loadable });
          byDay.set(dayKey, list);
        };
        for (const m of info.primary) {
          bump(perMuscle, m, sets);
          bump(dayMap, m, sets);
          if (info.loadable) bump(perMuscleLoaded, m, sets);
          note(m, sets, true);
        }
        for (const m of info.secondary) {
          bump(perMuscle, m, sets * 0.5);
          bump(dayMap, m, sets * 0.5);
          if (info.loadable) bump(perMuscleLoaded, m, sets * 0.5);
          note(m, sets * 0.5, false);
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

        /* THE WEEK TABLE'S ROW, built in the same pass that counts the sets. The muscle names are
           captured here and the WEEKLY totals are filled in afterwards, because the total is not
           known until every day has been walked. Two passes over one array beats a second traversal
           of the programme: a table built from its own second walk is a table that can disagree with
           the numbers above it. */
        rawSlots.push({
          day: dayKey,
          block: block.label,
          role: block.role,
          rest: String(block.exercises[0]?.rest ?? ''),
          soloBlock: block.exercises.length === 1,
          id: ex.id,
          slot: {
            name: ex.name,
            sets,
            reps: String(ex.reps ?? ''),
            feeds: [
              ...info.primary.map((m) => ({ muscle: m, primary: true })),
              ...info.secondary.map((m) => ({ muscle: m, primary: false })),
            ],
          },
        });
      });
    }
  }

  const dayOrder = COVERAGE_DAY_ORDER.filter((d) => perMuscleByDay.has(d));

  const muscleRows: MuscleRow[] = [...perMuscle.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, sets]) => {
      const tier = tierFor(HYPERTROPHY_TIERS, sets);
      const loadedSets = perMuscleLoaded.get(muscle) ?? 0;
      return {
        muscle,
        label: cat.muscles[muscle] ?? muscle,
        sets,
        loadedSets,
        tier,
        loadedTier: tierFor(HYPERTROPHY_TIERS, loadedSets),
        belowMinimum: sets < MIN_EFFECTIVE_DOSE,
        pastEfficient: sets > EFFICIENT_ZONE_TOP,
        byDay: dayOrder.map((d) => perMuscleByDay.get(d)?.get(muscle) ?? 0),
        byDayDetail: dayOrder.map((d) => perMuscleDetail.get(muscle)?.get(d) ?? []),
      };
    });

  /* THE FRACTIONAL COUNT NEEDS EVERY OTHER SLOT IN THE WEEK, so it cannot be accumulated inside the
     walk above the way the per-muscle totals are: a lift's indirect volume depends on slots that
     have not been reached yet. It is a second pass over `perExercise` and `rawSlots`, both of which
     were built by the single walk, so it still cannot disagree with the numbers above it.

     O(lifts x slots) is 35 x 38 on the real programme. */
  const liftRows: LiftRow[] = [...perExercise.entries()]
    .sort((a, b) => b[1].sets - a[1].sets)
    .map(([id, v]) => {
      const me = byId.get(id);
      const mePrimary = new Set(me?.primary ?? []);
      const meAll = new Set([...(me?.primary ?? []), ...(me?.secondary ?? [])]);

      let fractionalSets = 0;
      let fractionalSetsLoose = 0;
      const indirectDaysStrict = new Set<string>();

      /* `rawSlots` holds one entry per exercise per day with its sets and the muscles it feeds,
         which is exactly what the indirect test needs and is already computed by the walk above. */
      for (const r of rawSlots) {
        if (r.id === id) {
          fractionalSets += r.slot.sets;
          fractionalSetsLoose += r.slot.sets;
          continue;
        }
        const otherPrimary = r.slot.feeds.filter((f) => f.primary).map((f) => f.muscle);
        const otherAll = r.slot.feeds.map((f) => f.muscle);
        if (otherPrimary.some((m) => mePrimary.has(m))) {
          fractionalSets += r.slot.sets * 0.5;
          if (r.day) indirectDaysStrict.add(r.day);
        }
        if (otherAll.some((m) => meAll.has(m))) fractionalSetsLoose += r.slot.sets * 0.5;
      }

      /* A day carrying the lift itself is a DIRECT session and must not also be counted as half an
         indirect one. The paper's example is 3 sessions to a fractional frequency of 2.5, not 3.5. */
      for (const d of v.days) indirectDaysStrict.delete(d);

      return {
        id,
        name: v.name,
        sets: v.sets,
        fractionalSets,
        fractionalSetsLoose,
        days: [...v.days],
        fractionalFrequency: v.days.size + 0.5 * indirectDaysStrict.size,
        loadable: v.loadable,
        tier: tierFor(STRENGTH_TIERS, fractionalSets),
        directTier: tierFor(STRENGTH_TIERS, v.sets),
      };
    });

  /* HOW MANY DISTINCT STRENGTH TIERS THE WEEK ACTUALLY FALLS INTO, and the reason this is computed
   * and reported rather than left for a reader to notice.
   *
   * Table 4 spans 1 to 5+, five tiers, and its top one is open-ended. Under the paper's own indirect
   * rule for strength (any set meaningfully training the muscles involved counts half) every
   * compound lift in a real four-day programme lands past 5. Measured on this programme on
   * 2026-08-31: 27 of 35 lifts are at or past 5 fractional sets on the strict reading and 35 of 35
   * on the loose one, so the tier label is identical for every row.
   *
   * THE PREVIOUS ATTEMPT AT THIS FIX SHIPPED THAT AS THE ANSWER. A column of 35 identical labels
   * looks like a measurement and carries no information, and printing it is worse than printing
   * nothing, because it invites a decision. So when the tier stops discriminating, the instrument
   * says the tier stopped discriminating and points at the number that has not: fractional
   * FREQUENCY, whose slope for strength is 3.27% per session against volume's 0.21% per set.
   *
   * `liftRows.length > 1` because one lift trivially occupies one tier and that is not saturation. */
  const strengthTiersSeen = new Set(liftRows.map((l) => l.tier.tier));

  /* THE WEEKLY TOTAL IS JOINED ON HERE, after every day has been counted. Doing it inside the walk
     would print each muscle's running subtotal at the moment that row was reached, which looks like
     a number and is not one. */
  const weekBlocks: WeekBlock[] = [];
  for (const r of rawSlots) {
    const last = weekBlocks[weekBlocks.length - 1];
    const slot: WeekSlot = {
      name: r.slot.name,
      sets: r.slot.sets,
      reps: r.slot.reps,
      feeds: r.slot.feeds.map((f) => ({
        label: cat.muscles[f.muscle] ?? f.muscle,
        weekly: perMuscle.get(f.muscle) ?? 0,
        primary: f.primary,
      })),
    };
    if (last && last.day === r.day && last.label === r.block) last.slots.push(slot);
    else weekBlocks.push({ day: r.day, label: r.block, role: r.role, rest: r.rest, slots: [slot], solo: r.soloBlock });
  }

  return {
    dayOrder,
    muscleLabels: cat.muscles,
    weekBlocks,
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
      strengthTiersSeen: strengthTiersSeen.size,
      strengthTierSaturated: liftRows.length > 1 && strengthTiersSeen.size === 1,
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
