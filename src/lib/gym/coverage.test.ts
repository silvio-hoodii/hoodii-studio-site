/**
 * THE TIER LOOKUP AND THE STRENGTH UNIT, watched refusing and watched permitting.
 *
 *   node --experimental-strip-types src/lib/gym/coverage.test.ts
 *
 * WHY THIS FILE EXISTS. Two bugs were found in `coverage.mts` in two days, and both were in code
 * that every gate in this repo passed over:
 *
 *   1. THE UNITS ERROR. `perLift.tier` graded a sum of `direct` sets against Pelland's Table 4,
 *      which is denominated in `fractional`. Nothing could catch it, because both numbers are
 *      plausible set counts and the wrong one is simply smaller.
 *   2. THE TIER GAP. Tiers carried a hand-typed `min` AND `max` from the paper's integer bands, and
 *      this file counts sets in halves. 10.5, 18.5, 29.5, 42.5 and 4.5 matched no tier, fell through
 *      to `?? tiers[tiers.length - 1]`, and were reported as the LAST tier in the list, which is
 *      `unclear: insufficient data, or potentially less hypertrophy`. Grip and forearms was sitting
 *      at 18.5 and reading `unclear` in production.
 *
 * Neither was a wrong formula. Both were an instrument answering a different question from the one
 * it was labelled with, which no typecheck, lint or build can see. Nine cases here PERMIT and are
 * there on purpose: a checker whose first real finding is false is a checker nobody runs, and this
 * repo has shipped one of those (four false findings out of four, on the bare-colour gate).
 */
import {
  HYPERTROPHY_TIERS, STRENGTH_TIERS, tierFor, tierBand, computeCoverage,
  type MovementCatalogue, type CoverageProgram,
} from './coverage.mts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`); failures++; }
}
function eq(name: string, got: unknown, want: unknown) {
  check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

console.log('\ntierBand reproduces the paper\'s own tables');
/* PERMITS. If these drift the labels on his phone stop matching Table 3 and Table 4, which is the
   whole basis for the numbers being defensible at all. */
eq('Table 3 bands', HYPERTROPHY_TIERS.map((t) => tierBand(HYPERTROPHY_TIERS, t)).join(' | '),
  '0-3 | 4 | 5-10 | 11-18 | 19-29 | 30-42 | 43+');
eq('Table 4 bands', STRENGTH_TIERS.map((t) => tierBand(STRENGTH_TIERS, t)).join(' | '),
  '0 | 1 | 2 | 3-4 | 5+');

console.log('\nno half-set can fall through a tier, which is the bug this replaced');
/* THE FIVE VALUES THAT USED TO FALL THROUGH. Each asserts the tier it should now get, so a
   reintroduced `max` field fails here rather than printing `unclear` at a muscle again. */
eq('hypertrophy 10.5', tierFor(HYPERTROPHY_TIERS, 10.5).tier, 'HIGHER EFF.');
eq('hypertrophy 18.5', tierFor(HYPERTROPHY_TIERS, 18.5).tier, 'intermediate');
eq('hypertrophy 29.5', tierFor(HYPERTROPHY_TIERS, 29.5).tier, 'lower eff.');
eq('hypertrophy 42.5', tierFor(HYPERTROPHY_TIERS, 42.5).tier, 'lowest eff.');
eq('strength 4.5', tierFor(STRENGTH_TIERS, 4.5).tier, 'intermediate');
/* THE EXHAUSTIVE VERSION, because naming five values is checking instances. Every half-set from 0
   to 60 must return a tier whose floor it has actually reached. */
let fellThrough = 0;
for (let n = 0; n <= 60; n += 0.5) {
  for (const tiers of [HYPERTROPHY_TIERS, STRENGTH_TIERS]) {
    const t = tierFor(tiers, n);
    if (!t || n < t.min) fellThrough++;
  }
}
eq('every half-set 0 to 60 lands in a reached tier', fellThrough, 0);

console.log('\nthe tier boundaries themselves still hold (permits)');
eq('hypertrophy 3.5 is below the minimum dose', tierFor(HYPERTROPHY_TIERS, 3.5).tier, 'BELOW MINIMUM');
eq('hypertrophy 4 is the minimum dose', tierFor(HYPERTROPHY_TIERS, 4).tier, 'minimum');
eq('hypertrophy 10 is the cheapest band', tierFor(HYPERTROPHY_TIERS, 10).tier, 'HIGHER EFF.');
eq('hypertrophy 11 steps up', tierFor(HYPERTROPHY_TIERS, 11).tier, 'intermediate');
eq('hypertrophy 43 is unclear', tierFor(HYPERTROPHY_TIERS, 43).tier, 'unclear');
eq('strength 0.5 is below the minimum dose', tierFor(STRENGTH_TIERS, 0.5).tier, 'BELOW MINIMUM');
eq('strength 1 is the minimum dose', tierFor(STRENGTH_TIERS, 1).tier, 'minimum');
eq('strength 5 is the open-ended top', tierFor(STRENGTH_TIERS, 5).tier, 'lower eff.');
eq('strength 500 is still the top, not off the end', tierFor(STRENGTH_TIERS, 500).tier, 'lower eff.');

console.log('\nthe top strength tier does not read as a ceiling');
/* Pelland 4.3, verbatim: "additional sets beyond this point may produce additional strength gains,
   albeit less than the SDES, prior to the functional plateau." A fabricated ceiling in this same
   file was used on 2026-08-29 to refuse 25 to 43 legal partner exercises per block, so the wording
   of this one note is load-bearing and is asserted. */
const top = STRENGTH_TIERS[STRENGTH_TIERS.length - 1]!;
check('top tier note says more sets may still add strength',
  /may still add strength/.test(top.note), top.note);
check('top tier note does not say sets stop paying',
  !/stop paying|do not consistently/.test(top.note), top.note);

console.log('\nfractional sets follow Pelland\'s worked example for STRENGTH');
/* THE PAPER'S OWN EXAMPLE, built as a programme. Lines 175-186 of the full text:
 *   "a study measuring back squat 1RM strength consisting of 5 sets of back squats in one session,
 *    5 sets of back squats in a second session, and 5 sets of leg presses in a third session would
 *    result in a weekly volume quantified as `total', `fractional', and `direct' of 15, 12.5, and
 *    10, respectively. This example would result in a frequency quantified as `total',
 *    `fractional', and `direct' of 3, 2.5, and 2, respectively."
 *
 * If this case does not reproduce 10 and 12.5, and 2 and 2.5, the instrument is not computing what
 * the table it grades against is denominated in. That is exactly the state it was in until today. */
const cat: MovementCatalogue = {
  muscles: { quads: 'Quadriceps', glutes: 'Glutes', hams: 'Hamstrings' },
  movements: {
    squat: {
      name: 'Squat', primary: ['quads'], secondary: ['glutes'], confidence: 'sourced',
      variants: [{ id: 'back-squat', name: 'Back Squat', zone: 'rack', station: null, loadable: true }],
    },
    press: {
      name: 'Leg Press', primary: ['quads'], secondary: ['glutes'], confidence: 'sourced',
      variants: [{ id: 'leg-press', name: 'Leg Press', zone: 'machines', station: null, loadable: true }],
    },
    curl: {
      name: 'Leg Curl', primary: ['hams'], secondary: [], confidence: 'sourced',
      variants: [{ id: 'leg-curl', name: 'Leg Curl', zone: 'machines', station: null, loadable: true }],
    },
  },
};
const day = (id: string) => ({ blocks: [{ label: 'Main', role: 'main', exercises: [{ id, name: id, sets: 5 }] }] });
const program: CoverageProgram = {
  days: { a: day('back-squat'), b: day('back-squat'), c: day('leg-press') },
};
const cov = computeCoverage(program, cat);
const squat = cov.perLift.find((l) => l.id === 'back-squat')!;
eq("paper's example: back squat DIRECT sets", squat.sets, 10);
eq("paper's example: back squat FRACTIONAL sets", squat.fractionalSets, 12.5);
eq("paper's example: back squat DIRECT frequency", squat.days.length, 2);
eq("paper's example: back squat FRACTIONAL frequency", squat.fractionalFrequency, 2.5);
/* THE TIER IS ON THE FRACTIONAL COUNT. Both land in the same tier here (10 and 12.5 are both 5+),
   so asserting the tier proves nothing; assert that the two counts DIFFER and that `directTier` is
   still available, which is what makes the correction showable rather than silent. */
check('direct and fractional are different numbers', squat.sets !== squat.fractionalSets);
check('directTier is still reported', typeof squat.directTier?.tier === 'string');

console.log('\na lift sharing NO muscle with the week gets no indirect credit (permits)');
/* The mirror case, and the one that catches an indirect test that matches everything. A leg curl on
   its own day, hamstrings only, must sit at its direct count exactly. */
const program2: CoverageProgram = {
  days: { a: day('back-squat'), c: day('leg-curl') },
};
const cov2 = computeCoverage(program2, cat);
const curl = cov2.perLift.find((l) => l.id === 'leg-curl')!;
eq('leg curl direct sets', curl.sets, 5);
eq('leg curl fractional sets, no shared primary', curl.fractionalSets, 5);
eq('leg curl fractional frequency, no indirect day', curl.fractionalFrequency, 1);

console.log('\nfractional frequency never double-counts a direct day');
/* THE OFF-BY-A-HALF THIS GUARDS. A day carrying the lift itself is a direct session, and if the
   indirect-day set is not cleaned of the direct days the paper's example returns 3.5, not 2.5.
   Monday and Tuesday both hold the squat AND both hold quad work, so both would qualify twice. */
eq('squat frequency is 2.5, not 3', squat.fractionalFrequency, 2.5);

console.log('\nsaturation is reported rather than printed as a finding');
/* One lift is not saturation, whatever its tier: `strengthTierSaturated` must be false on a
   single-row table or the message fires on every trivial programme. */
eq('two lifts in one tier is saturated', cov.totals.strengthTierSaturated, true);
eq('tiers seen on the paper example', cov.totals.strengthTiersSeen, 1);
const cov3 = computeCoverage({ days: { a: day('back-squat') } }, cat);
eq('a single lift is not saturation', cov3.totals.strengthTierSaturated, false);

console.log('-'.repeat(70));
if (failures) {
  console.log(`RED. ${failures} case(s) failed.`);
  process.exit(1);
}
console.log('GREEN. every case passed.');
