import 'server-only';
import { loadMovements } from './program';

/* ONE EXERCISE, ONE HISTORY, EVEN WHEN IT HAS TWO IDS.
 *
 * THE INCIDENT, 2026-08-28, and he found it at the rack. The Monday and Thursday calf raise card
 * offered him about 5 lb for a machine he works at 180 to 210. His own words: "the calf raise thing I
 * swapped to machine calf raise, so it was not DB calf raise."
 *
 * What was actually happening. `standing-calf-raise` is the slot, and `machine-calf-raise` is one of
 * its ALTS. In `movements.json` the second is an ALIAS of the first, so the catalogue considers them
 * one exercise. The gym log does not: `autosave` writes `eff.id`, which after a swap is the alt's id,
 * and it is right to, because the log is the record of what he DID. So one exercise ended up with two
 * histories:
 *
 *     standing-calf-raise    12 sets, 2026-06-09 to 2026-08-08, weight 0 throughout
 *     machine-calf-raise      3 sets, 2026-08-27, 180 to 210 lb
 *
 * `getLastSession` filters `exercise_id = $1` exactly, so the card read the twelve bodyweight sets,
 * saw a top weight of zero, and suggested the smallest step above it. The 210 lb he had done the
 * previous evening was invisible to the one query that decides what to put on the bar.
 *
 * WHY THE FIX IS HERE AND NOT IN THE WRITE. Rewriting the alt's id at write time would make the log
 * say he did the slot's exercise when he did the alt, and `swapped_from` exists precisely so that
 * distinction survives. The log is correct. The READ was asking a narrower question than the
 * catalogue answers: "what did he do under this exact string" instead of "what did he do on this
 * exercise". Aliases exist to say two strings mean one movement, and every reader should honour that.
 *
 * The catalogue is the authority, so nothing here is a list to maintain: add an alias in
 * `movements.json` and the history follows on its own.
 *
 * SEPARATELY, that alt should not have existed. An alt resolving to the SLOT'S OWN variant is a
 * choice between an exercise and itself, and `content/gym/validate.mjs` refuses it now. This module
 * is the belt: the gate stops new ones, this makes the ones already in his log read correctly.
 */

/** Every `gym_set.exercise_id` that means the same movement as `id`, including `id` itself.
 *
 *  Returns `[id]` unchanged when the catalogue does not know it, which is the honest answer for an
 *  off-plan exercise he typed into the capture box: those are real rows and they are not aliases of
 *  anything. */
export async function equivalentIds(id: string): Promise<string[]> {
  let cat;
  try {
    cat = await loadMovements();
  } catch {
    /* A catalogue that will not load must not silently narrow the history to one id, because that is
     * the exact failure this module exists to fix and it would come back looking like correct
     * behaviour. Returning the bare id is the same answer the old code gave, so nothing gets worse,
     * and the caller is reading a database anyway: this cannot be the thing that takes /gym down. */
    return [id];
  }

  for (const movement of Object.values(cat.movements)) {
    for (const variant of movement.variants) {
      const family = [variant.id, ...(variant.aliases ?? [])];
      if (family.includes(id)) return [...new Set(family)];
    }
  }
  return [id];
}
