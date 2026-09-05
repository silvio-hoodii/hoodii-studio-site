import 'server-only';
import { loadMovements, loadProgram } from './program';

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

  const family = new Set<string>([id]);
  for (const movement of Object.values(cat.movements)) {
    for (const variant of movement.variants) {
      const kin = [variant.id, ...(variant.aliases ?? [])];
      if (kin.includes(id)) for (const k of kin) family.add(k);
    }
  }

  /* ---- AND THE IDS THIS SLOT USED TO BE CALLED. Added 2026-09-05. -----------------------------
   *
   * `formerIds` WAS DECORATION FOR SEVEN DAYS, and that is the more useful half of this story.
   *
   * It shipped on 2026-08-29 for 10-gym P1-2, after six slot ids were rewritten and three cards went
   * back to reading "First time: log your working weight" for movements he had done two days
   * earlier. `content/gym/validate.mjs` gates its shape and `scripts/check-ladder.mjs` reports any
   * logged id the programme no longer claims. **Nothing read it at progression time.** So a slot
   * could declare its old name, satisfy the validator, clear the warning, and the card would still
   * offer him a first-time prompt for a lift with months of history: the fix silenced the alarm and
   * left the fire.
   *
   * Then the 2026-09-03 rebuild deleted every use of the field from program.json in one 1,197-line
   * replacement, and `grep '"formerIds"' content/gym/program.json` returned nothing at all. On
   * 2026-09-05 `single-leg-rdl` held 21 sets at 40 lb going back to May that no card could reach.
   *
   * A RENAME IS NOT AN ALIAS, and the two directions above are deliberately different. An alias in
   * movements.json means one movement with one load scale, and it is symmetric: the machine and
   * standing calf raise are each other's. A rename is one-way and about HISTORY: the old id is dead,
   * the new slot inherits what was logged under it, and nothing points back. validate.mjs enforces
   * that separation by refusing a `formerId` that is still a live id, so this cannot be used to
   * quietly merge two exercises that are two exercises.
   *
   * The programme is loaded rather than passed in, so a caller cannot reintroduce the split by
   * forgetting to hand it over. Failure here is non-fatal for the same reason as the catalogue read
   * above: this must never be the thing that takes /gym down. */
  try {
    const program = await loadProgram();
    for (const day of Object.values(program.days ?? {})) {
      for (const block of day.blocks ?? []) {
        for (const ex of block.exercises ?? []) {
          if (ex.id !== id || !ex.formerIds?.length) continue;
          for (const f of ex.formerIds) family.add(f);
        }
      }
    }
  } catch { /* see above: a programme that will not load must not narrow the history */ }

  return [...family];
}
