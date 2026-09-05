/* CAN THESE TWO EXERCISES SHARE ONE REST WINDOW. One implementation, three callers.
 *
 * His rule, HealthOS/HANDOFF.md, 2026-05-23, in his own words: superset partners must be
 * "(a) same equipment, (b) bodyweight/floor partner of the main lift, or (c) adjacent equipment in
 * arm's reach". It sat as prose for ninety-nine days and was broken five times, every one of which
 * he found by standing in the gym holding a phone: "Realistically there's no way I can do a lat
 * pulldown and a dead bug. I'm not going to lay on the floor at that cable machine."
 *
 * IT BECAME EXECUTABLE IN PIECES AND THAT IS WHY IT KEPT FAILING. Cases (a) and (b) were coded into
 * validate.mjs on 2026-08-16. Case (c) was not implemented until 2026-08-30, so for a fortnight the
 * gate refused every pairing across two fixtures however close together they stood, which is the
 * mechanical reason he kept being told no partner existed. His words on that: "why in the world
 * moving an exercise means the other lift stay solo, is there no more exercises in the world? ...
 * that just seems to me to be a lazy answer."
 *
 * AND scripts/gym-catalogue.mjs STILL HAS NOT IMPLEMENTED CASE (c), which is why `--fill`, the tool
 * AGENTS.md names for exactly this work, cannot see the pairing he asked for three times: `rack` and
 * `rack-pullup-bar` are declared adjacent, and hanging knee raises in the RDL's rest is precisely
 * that case. A tool that cannot represent the answer will never suggest it however often it is run.
 *
 * So the rule lives in ONE file now and the callers ask it rather than reimplementing it:
 *
 *   content/gym/validate.mjs      the build gate, which maps each refusal to its own message
 *   src/lib/gym/fill.ts           the list of partners he picks from at the rack
 *   scripts/gym-catalogue.mjs     the terminal tool
 *
 * Same move as structural-hash.mjs, and for the same reason: two copies of one rule drift while both
 * keep printing plausible answers, and this one has drifted three times already. A comment claiming
 * agreement with another file is worth exactly as much as the code under it, so
 * content/gym/validate.test.mjs asserts every caller reaches the same verdict.
 *
 * FAIL-CLOSED THROUGHOUT. A station nobody has ruled on refuses rather than permits, because a wrong
 * "you can" costs him a session and a wrong "you cannot" costs a walk.
 */

/** Why a pairing is refused, or null when it is legal.
 *
 *  A CODE RATHER THAN A BOOLEAN, because validate.mjs has a distinct, sourced message for each
 *  refusal and a shared boolean would have flattened three of them into one. The codes:
 *
 *    two-stations       two fixtures, not declared adjacent
 *    adjacent-crosszone declared adjacent but in different zones, which arm's reach cannot be
 *    station-not-shared both on ONE fixture that has not been declared shareable
 */
export function pairingRefusal(a, b, stationOf) {
  // DISTINCT stations: two exercises using the same bench occupy one bench. Counting raw entries
  // instead flagged a single-leg RDL alternating with a Copenhagen plank on that bench, which is the
  // one arrangement that is obviously fine.
  const stations = [...new Set([a.station, b.station].filter((s) => s != null))];

  if (stations.length > 1) {
    /* ADJACENCY IS DECLARED, NOT ASSUMED, and it must be MUTUAL. Without the second half, one
     * station naming another would be enough, and "adjacent" becomes a way to pair anything with
     * anything by editing one entry. */
    const sx = stationOf(a.zone, a.station);
    const sy = stationOf(b.zone, b.station);
    const mutual = Boolean(sx?.adjacentTo?.includes(b.station)) && Boolean(sy?.adjacentTo?.includes(a.station));
    if (!mutual) return { code: 'two-stations', stations };
    /* Arm's reach is a fact about ONE place. */
    if (a.zone !== b.zone) return { code: 'adjacent-crosszone', stations };
    return null;
  }

  if (stations.length === 1 && a.station != null && b.station != null) {
    /* THE DEDUPE ABOVE IS WHY THIS CLAUSE HAS TO EXIST, and he found it at the rack on 2026-08-28.
     * His words, note #27: "You are still making pairings of two machines lat pull down and overhead
     * triceps cable can't be done at the same time, could be straight arm pull down not sure why
     * this same thing keeps happening after all.the audits."
     *
     * A `Set` collapses two exercises on ONE station to a single entry, so the count above can never
     * fire on them. The rule read "at most one station" and was silently enforcing "at most one
     * station NAME". A bench is shared without touching it, because you lie on it for one exercise
     * and put a foot on it for the other; a cable column is not, because the attachment and the seat
     * change between a pulldown and an overhead extension, so alternating means reconfiguring the
     * machine every set. That is two exercises with setup in between, not a superset. */
    if (stationOf(a.zone, a.station)?.sharedInOneWindow !== true) {
      return { code: 'station-not-shared', station: a.station };
    }
    return null;
  }

  /* Zero or one fixture between them: cases (a) and (b). A partner holding nothing is CARRIED to the
   * lead lift, which is the old unmodelled travelling-dumbbell convention. Read the SLOT's zone for
   * it, never the catalogue's: movements.json files every dumbbell under `benchDb` because that is
   * where the rack of them lives, not because that is where he stands. Comparing catalogue zones
   * called three legal blocks a walk on 2026-08-27. */
  return null;
}

/** The boolean, for callers that only need the verdict. */
export function pairingLegal(a, b, stationOf) {
  return pairingRefusal(a, b, stationOf) === null;
}
