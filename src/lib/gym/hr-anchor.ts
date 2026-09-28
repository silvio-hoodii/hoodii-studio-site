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
 * So: when the database has no reading, `fill` returns null and the CALLER leaves the sentence out.
 * A page that cannot say the true thing says nothing. `fillCue` cuts only the sentence, not the card.
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

/** Drop every sentence that still carries a `{PEAK_*}` placeholder. Null when nothing is left. */
function dropUnfilled(text: string): string | null {
  const kept = text.split(/(?<=[.!?])\s+/).filter((sentence) => !/\{PEAK_[A-Z_]+\}/.test(sentence));
  return kept.length ? kept.join(' ') : null;
}

/** Fill every string field on one cue, or return null to drop the cue.
 *
 *  A REQUIRED FIELD LOSES THE SENTENCE, NOT THE CARD, since 2026-09-27. The first refusal dropped the
 *  whole cue when `name`, `cue` or `test` held a placeholder it could not fill, and the one cue that
 *  carries one is the stop rule on /bike: with no peak on record the knee, chest and head rules
 *  vanished with the heart-rate one. Now, with no peak, the sentences holding a placeholder are cut
 *  and the rest renders. The literal braces still never print, and no typed number stands in. A
 *  required field left empty by the cut still drops the cue.
 *
 *  So a sentence that carries `{PEAK_BPM}` must stand alone: the text around it must not count the
 *  items or point back at it, because it may not be there. An optional field that cannot be filled
 *  is dropped. The caller filters the nulls out. */
export function fillCue<T extends Cue>(cue: T, peak: PeakHr | null): T | null {
  const out = { ...cue } as Record<string, unknown>;
  for (const k of ['name', 'cue', 'test'] as const) {
    const v = out[k];
    if (typeof v !== 'string') continue;
    const filled = fill(v, peak) ?? (peak ? null : dropUnfilled(v));
    if (filled == null) return null;
    out[k] = filled;
  }
  for (const k of ['why', 'grounding', 'quote'] as const) {
    const v = out[k];
    if (typeof v === 'string') out[k] = fill(v, peak);
  }
  return out as T;
}
