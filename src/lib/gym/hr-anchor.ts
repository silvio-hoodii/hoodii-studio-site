import 'server-only';
import type { PeakHr } from './session';
import type { Cue } from './types';

/* THE PLACEHOLDER SUBSTITUTION, AND WHY IT REFUSES RATHER THAN DEGRADES.
 *
 * `content/gym/conditioning.json` carries `{PEAK_BPM}`, `{PEAK_DATE}` and `{PEAK_KIND}` in five
 * rendered strings on /bike, because those strings used to carry the number 175 and 175 was wrong:
 * the export's highest reading is higher, and 23 of his last 60 swims beat it. The whole point of
 * deriving it is that a typed figure goes stale silently. See `getPeakHr` in ./session.ts for the
 * incident.
 *
 * SO A MISSING SUBSTITUTION MUST NOT RENDER. Two failure modes were available and both are worse than
 * a refusal:
 *
 *   Leaving the placeholder in place puts the literal text "{PEAK_BPM}" on the page, in a stop rule,
 *   which is the one instruction on this route that has to be readable while he is out of breath.
 *
 *   Falling back to a default number puts a typed figure back into the sentence that exists because a
 *   typed figure was wrong. That is the same shape as the catch-and-return-a-default this repo forbids
 *   in `src/lib/music/spotify.ts`, where a dead token and a quiet evening became indistinguishable.
 *
 * So: when the database has no reading, `resolve` returns null and the CALLER renders the honest empty
 * state instead of the sentence. A page that cannot say the true thing says nothing.
 *
 * `lintPlaceholders` is the other half. It is called by `content/gym/validate.mjs`, so a new
 * placeholder nobody wired up fails the build rather than shipping as literal braces.
 */

/** Every placeholder this module knows how to fill. Adding one here without adding it to `fill` fails
 *  the validator, which is the point: the two lists are compared rather than trusted. */
export const HR_PLACEHOLDERS = ['{PEAK_BPM}', '{PEAK_DATE}', '{PEAK_KIND}'] as const;

/** Substitute the derived peak into one string. Returns null if any placeholder is left unfilled. */
export function fill(text: string, peak: PeakHr | null): string | null {
  if (!peak) return HR_PLACEHOLDERS.some((p) => text.includes(p)) ? null : text;
  const out = text
    .split('{PEAK_BPM}').join(String(peak.bpm))
    .split('{PEAK_DATE}').join(peak.date)
    .split('{PEAK_KIND}').join(peak.kind);
  /* A leftover brace pair means a placeholder exists that this function does not know about, which is
   * exactly what the validator is meant to have caught. Refuse rather than render it. */
  return /\{PEAK_[A-Z_]+\}/.test(out) ? null : out;
}

/** Fill every string field on one cue.
 *
 *  A field that cannot be filled falls back to its ORIGINAL text rather than to null, and that is a
 *  different decision from `fill`'s. `fill` guards a whole line the page can simply not render. A cue
 *  has REQUIRED fields (`name`, `cue`, `test`), so nulling one produces a cue with no instruction in
 *  it, which is worse than a cue with a brace in it: a missing instruction is invisible and a visible
 *  brace is a bug report. In practice neither happens, because `content/gym/validate.mjs` refuses a
 *  placeholder this module does not know how to fill. */
export function fillCue<T extends Cue>(cue: T, peak: PeakHr | null): T {
  const out = { ...cue };
  for (const k of ['name', 'cue', 'test', 'why', 'grounding', 'quote'] as const) {
    const v = (out as Record<string, unknown>)[k];
    if (typeof v === 'string') (out as Record<string, unknown>)[k] = fill(v, peak) ?? v;
  }
  return out;
}
