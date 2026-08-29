/* REGRESSION SUITE FOR THE BODY-COMPOSITION SPLIT.
 *
 *   node --experimental-strip-types src/lib/health/split.test.ts
 *
 * TWO RULES ARE UNDER TEST AND BOTH SHIPPED BROKEN ON /health BEFORE 2026-08-28.
 *
 * 1. A SHARE IS ONLY A SHARE SOMETIMES. `Math.round((dFat / dKg) * 100)` through `Math.abs()`
 *    printed 233% over one window in 2025 and prints 119% over the 34-day trend the Weight tab
 *    itself displays, because a ratio of two deltas stops being a share the moment lean mass moves
 *    the other way from total weight. Losing weight while holding lean is the outcome the whole
 *    programme exists to produce, so the sentence was built to break on good news, and it broke in
 *    the false "you have this" direction Law 5 names as the worse one.
 *
 * 2. THE TWO ENDS MUST COME OFF ONE MACHINE. The split took `both[0]` and `both.at(-1)` with no
 *    source condition. The Scale and the Watch agree about weight to 0.05 kg and disagree about fat
 *    mass by up to 2.45 kg on the same day, so across an ordinary one to three kilo change the
 *    artifact can be larger than the thing being measured.
 *
 * EVERY FIX IS PAIRED WITH THE CASE THAT WOULD CATCH IT OVERSHOOTING. A gate that refuses
 * everything is as useless as one that refuses nothing, so the ordinary cut MUST still print its
 * percentage and a straightforward Watch-only series MUST still return its own two endpoints. Four
 * of the ten cases below assert the rules PERMIT.
 *
 * THE NUMBERS ARE HIS. Every fixture is a real row out of `health_body_comp`, because a fixture
 * invented to suit the fix only proves the fix agrees with itself.
 */
import { splitOf, sameSourcePair } from './split.ts';

let failed = 0;

function check(name: string, got: unknown, want: boolean, expected: string) {
  if (want) {
    console.log(`ok    ${name}`);
    return;
  }
  failed++;
  console.log(`FAIL  ${name}`);
  console.log(`        expected ${expected}`);
  console.log(`        got ${JSON.stringify(got)}`);
}

const r = (kg: number, fat: number | null, lean: number | null) => ({ kg, fat_kg: fat, lean_kg: lean });
const src = (date: string, source: string, fat: number | null, lean: number | null) =>
  ({ date, source, fat_kg: fat, lean_kg: lean });

/* ---- the share, refusing -------------------------------------------------------------------- */

/* The live 34-day window on the Weight tab, 2026-07-21 to 2026-08-24. Weight fell 4.3 while lean
   ROSE 0.8, which is what made the old clause print 119%. */
{
  const s = splitOf(r(108.0, 35.1, 72.9), r(103.7, 29.98, 73.72));
  check(
    'weight down, lean UP: no percentage at all',
    s,
    s !== null && s.fatShare === null && s.leanOpposed === true,
    'fatShare null and leanOpposed true (the old clause printed 119%)',
  );
}

/* 2025-06-23 as the audit replayed it: weight ROSE 1.2 while fat FELL 4.1. The old clause printed
   "332% of the change was fat" about a period when fat went the other way. */
{
  const s = splitOf(r(114.0, 40.0, 74.0), r(115.2, 35.9, 79.3));
  check(
    'weight up, fat DOWN: no percentage, and never a positive one',
    s,
    s !== null && s.fatShare === null,
    'fatShare null (the old clause printed 332%, positive, through Math.abs)',
  );
}

/* 2025-06-13 as the audit replayed it: both moved the same way but fat moved further than the
   total, because lean fell. 233%. */
{
  const s = splitOf(r(112.0, 36.0, 76.0), r(114.3, 41.5, 72.8));
  check(
    'fat moves further than the total: no percentage',
    s,
    s !== null && s.fatShare === null && s.leanOpposed === true,
    'fatShare null (the old clause printed 233%)',
  );
}

/* A share of a delta near zero is a very large percentage of nothing. */
{
  const s = splitOf(r(103.9, 31.5, 72.4), r(103.7, 29.98, 73.72));
  check(
    'weight barely moved: no percentage',
    s,
    s !== null && s.fatShare === null,
    'fatShare null below the 1 kg floor',
  );
}

/* ---- the share, PERMITTING ------------------------------------------------------------------ */

/* The year, peak to latest: 118.9 to 103.7, fat 41.36 to 29.98, lean 77.54 to 73.72. This is the
   headline on /health/deep and it MUST print 75%. A rule that refused this would be useless. */
{
  const s = splitOf(r(118.9, 41.36, 77.54), r(103.7, 29.98, 73.72));
  check(
    'the year: an ordinary cut still prints its share',
    s,
    s !== null && s.fatShare === 75 && s.dKg === -15.2 && s.dFat === -11.4 && s.dLean === -3.8,
    'fatShare 75, dKg -15.2, dFat -11.4, dLean -3.8',
  );
}

/* The share must be reproducible by dividing the two numbers on the screen. */
{
  const s = splitOf(r(118.9, 41.36, 77.54), r(103.7, 29.98, 73.72));
  const reproduced = s ? Math.round((s.dFat / s.dKg) * 100) : null;
  check(
    'the printed share equals the printed numbers divided',
    { share: s?.fatShare, reproduced },
    s !== null && s.fatShare === reproduced,
    'the rendered percentage recomputed from the rendered deltas',
  );
}

/* A gain that really was fat is a share too, and must still print one. */
{
  const s = splitOf(r(103.7, 29.98, 73.72), r(107.0, 32.9, 74.1));
  check(
    'a fat gain still prints its share',
    s,
    s !== null && s.fatShare !== null && s.fatShare > 0 && s.fatShare <= 100,
    'a share between 0 and 100 on a genuine fat gain',
  );
}

/* Missing columns are missing, not zero. A Scale row with no fat figure must not read as no change. */
{
  const s = splitOf(r(108.0, null, null), r(103.7, 29.98, 73.72));
  check(
    'a reading with no fat or lean returns nothing, not a zero',
    s,
    s === null,
    'null rather than a split built on absent columns',
  );
}

/* ---- the same-source pair, refusing and permitting ------------------------------------------ */

/* The mixed case: the widest pair is Watch to Scale, so it must shorten to the widest Watch pair
   rather than return the edges or give up. */
{
  const pair = sameSourcePair([
    src('2026-05-06', 'Watch', 38.02, 73.88),
    src('2026-06-23', 'Watch', 34.85, 74.85),
    src('2026-07-21', 'Scale', 35.1, 72.9),
  ]);
  check(
    'mixed endpoints: walks inward to a matching pair instead of crossing machines',
    pair?.map((p) => `${p.date}/${p.source}`),
    pair != null && pair[0].date === '2026-05-06' && pair[1].date === '2026-06-23',
    'the widest Watch-to-Watch pair, not Watch-to-Scale',
  );
}

/* The ordinary case: every reading is a Watch reading, so it must return the actual edges. A rule
   that quietly narrowed this window would be worse than the bug it replaced. */
{
  const pair = sameSourcePair([
    src('2026-05-06', 'Watch', 38.02, 73.88),
    src('2026-06-23', 'Watch', 34.85, 74.85),
    src('2026-08-24', 'Watch', 29.98, 73.72),
  ]);
  check(
    'all one source: the full window is kept',
    pair?.map((p) => p.date),
    pair != null && pair[0].date === '2026-05-06' && pair[1].date === '2026-08-24',
    'the first and last readings, unshortened',
  );
}

/* And a series with no two readings sharing a source has no answer, which is not the same as zero. */
{
  const pair = sameSourcePair([
    src('2026-07-21', 'Scale', 35.1, 72.9),
    src('2026-08-24', 'Watch', 29.98, 73.72),
  ]);
  check(
    'no two readings share a machine: returns nothing rather than crossing them',
    pair,
    pair === null,
    'null',
  );
}

/* Rows missing fat or lean are skipped when choosing the pair, not treated as usable endpoints. */
{
  const pair = sameSourcePair([
    src('2026-05-06', 'Watch', null, null),
    src('2026-06-23', 'Watch', 34.85, 74.85),
    src('2026-08-24', 'Watch', 29.98, 73.72),
  ]);
  check(
    'endpoints without a fat figure are not eligible',
    pair?.map((p) => p.date),
    pair != null && pair[0].date === '2026-06-23' && pair[1].date === '2026-08-24',
    'the first usable reading, not the first row',
  );
}

console.log(failed ? `\n${failed} FAILED` : '\nall split cases pass');
process.exit(failed ? 1 : 0);
