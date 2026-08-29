/* WHERE A WEIGHT CHANGE WENT, AND WHEN THAT SENTENCE IS ALLOWED TO CARRY A PERCENTAGE.
 *
 * Extracted 2026-08-28, when /health/deep needed the same arithmetic the Weight tab already ran.
 * It is one function and not two because the rule it encodes was got wrong once already and the
 * second copy is how a fix reaches one surface and not the other.
 *
 * THE RULE, and the incident behind it (09-health P1-1). The Weight tab used to render
 * `Math.round((dFat / dKg) * 100)` through `Math.abs()`. `dFat / dKg` is only a SHARE while fat and
 * total weight move the same way and fat moves no further than the total. When lean mass moves the
 * other way, the ratio passes 100%; when fat moves the other way from total weight, it goes
 * negative and `Math.abs()` then prints it as a confident positive percentage of a change that went
 * the opposite direction. Replaying the page's own 120-day window across all 167 readings, 23
 * windows printed an impossible share, including 233%, and one attributed a percentage of a weight
 * GAIN to fat on a stretch where fat actually fell.
 *
 * The trigger is losing weight while holding or gaining lean mass, which is the outcome the whole
 * programme exists to produce. So the sentence was built to break at the moment it finally had good
 * news, and to break in the direction Law 5 names as the worse one: a false "you have this".
 *
 * So a share is returned ONLY when it is one, and the opposed case is named instead. "You lost
 * 4.3 kg and your lean mass rose 0.8 kg" says more than "119% of the change was fat" ever could,
 * and it is true. */

export interface Split {
  dKg: number;
  dFat: number;
  dLean: number;
  /** Whole-percent share of the weight change that was fat, or null when that is not a share.
   *  Null is not missing data: it means the honest sentence is the one in `leanOpposed`. */
  fatShare: number | null;
  /** Lean mass went the OPPOSITE way from total weight. The case a percentage cannot express. */
  leanOpposed: boolean;
}

/** A weight change smaller than this is not worth splitting: a share of a delta near zero is a very
 *  large percentage of nothing, and both components are inside the bioimpedance noise. */
const MOVING_KG = 1;

export function splitOf(
  a: { kg: number; fat_kg: number | null; lean_kg: number | null },
  b: { kg: number; fat_kg: number | null; lean_kg: number | null },
): Split | null {
  if (a.fat_kg == null || a.lean_kg == null || b.fat_kg == null || b.lean_kg == null) return null;
  const dKg = round1(b.kg - a.kg);
  const dFat = round1(b.fat_kg - a.fat_kg);
  const dLean = round1(b.lean_kg - a.lean_kg);

  /* THE SHARE IS COMPUTED FROM THE ROUNDED DELTAS, on purpose. Those three numbers are the ones
     rendered, and he checks arithmetic: a share taken off the unrounded values can print "-4.3 kg,
     -5.1 of it fat, 118%" where dividing what is on the screen gives 119. Rounding first means the
     percentage is reproducible from the page. */
  const moving = Math.abs(dKg) > MOVING_KG;
  const sameDirection = dFat !== 0 && Math.sign(dFat) === Math.sign(dKg);
  const withinTotal = Math.abs(dFat) <= Math.abs(dKg);
  const fatShare = moving && sameDirection && withinTotal ? Math.round((dFat / dKg) * 100) : null;

  /* Only claimed while the weight is actually moving, for the same reason the share is. `dLean` of
     exactly 0 counts as opposed to a fall, because "the lean line held" is the true and useful
     sentence there and it is not a percentage. */
  const leanOpposed = moving && Math.sign(dLean || 0) !== Math.sign(dKg);

  return { dKg, dFat, dLean, fatShare, leanOpposed };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* THE TWO ENDS OF A SPLIT MUST COME OFF THE SAME MACHINE.
 *
 * 09-health P2-3, and it is the `pace_per_100m_ms` lesson with different columns. `health_body_comp`
 * carries readings from a Scale and from a Watch, and on the 36 days holding both they agree about
 * WEIGHT to a worst case of 0.05 kg and disagree about FAT MASS by up to 2.45 kg. Weight is
 * therefore safe to compare across instruments and the fat/lean split is not: with a real change of
 * one to three kilos, a 2.45 kg artifact can be larger than the thing being measured, and it lands
 * in the one sentence on the page that claims to be exact.
 *
 * Replaying /health's own 120-day window across all 167 readings, 40 of 165 windows had endpoints
 * from different sources. It is not firing today only because both current endpoints happen to be
 * Watch readings, and the most recent Scale row sits inside the live window.
 *
 * WHY WALK INWARD RATHER THAN REFUSE. Restricting the whole series to Watch would be simpler and
 * would throw away every Scale-only stretch. Walking inward keeps a true answer over a shorter
 * interval, and the caller renders the interval it was actually given rather than the one it asked
 * for, so the shortening is visible instead of silent.
 */
export function sameSourcePair<T extends { source: string; fat_kg: number | null; lean_kg: number | null }>(
  readings: T[],
): [T, T] | null {
  const usable = readings.filter((r) => r.fat_kg != null && r.lean_kg != null);
  for (let i = 0; i < usable.length; i++) {
    const a = usable[i] as T;
    for (let j = usable.length - 1; j > i; j--) {
      const b = usable[j] as T;
      if (a.source === b.source) return [a, b];
    }
  }
  return null;
}
