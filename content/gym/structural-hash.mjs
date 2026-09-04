/* THE STRUCTURAL HASH OF THE WEEK, shared by validate.mjs (the freeze gate) and validate.test.mjs
 * (the case that proves the gate can be unlocked with his words).
 *
 * It covers what the week IS: session keys, the weekdays each is scheduled on, block roles and
 * pairings, and every exercise's id, sets and reps. It does NOT cover cues, block reasons, labels,
 * rest strings, zones or alts, so a wording fix never trips the freeze and a set count always does.
 *
 * Sixteen hex characters, which is enough to make an accidental match impossible and short enough
 * to read out of a commit message. */
import { createHash } from 'node:crypto';

export function structuralHash(days) {
  const shape = Object.entries(days ?? {}).map(([k, d]) => ({
    k,
    on: d.scheduledOn,
    blocks: (d.blocks ?? []).map((b) => ({
      role: b.role,
      pairing: b.pairing,
      ex: (b.exercises ?? []).map((e) => [e.id, e.sets, e.reps]),
    })),
  }));
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 16);
}
