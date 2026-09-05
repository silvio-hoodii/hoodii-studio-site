import 'server-only';
import { loadProgram, loadMovements } from './program';
import { loadEquipment } from './equipment';
import type { Day, DayKey, Exercise } from './types';

/* WHAT COULD RIDE IN THIS REST, COMPUTED FOR EVERY SOLO BLOCK, SO HE CAN PICK ONE AT THE RACK.
 *
 * ------------------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS A CONTROL RATHER THAN ANOTHER EDIT TO program.json.
 * ------------------------------------------------------------------------------------------------
 *
 * On 2026-09-04 he supersetted Session B himself, in three separate blocks, and then asked why he
 * had to. The word that matters is "again":
 *
 *   #10  2026-08-23  "I ended up doing knee raises with rdl"
 *   #28  2026-08-28  "Here you are adding superset to the first main lift and no superset for the
 *                     2nd lift? What's the logic in that"
 *   #50  2026-09-03  "Bb rdl 180x3x6 with hanging knee raises x10x3"
 *   #52  2026-09-03  "And we regressed to having a hanging knee raises with a lat pill down wtf os
 *                     this"
 *   #54  2026-09-04  "Why no superset again? Did hanging knee raises x10 with bb rdl"
 *   #55  2026-09-04  "Did step back lounges 3x6 x 30 lb per side with shoulder press"
 *
 * Six notes over twelve days, one complaint. Every previous answer was an agent choosing a partner
 * and writing it into the week; #52 is what that gets when the agent chooses differently from him.
 * The standing ruling underneath all of it, 2026-08-29: "IN GENERAL I DONT WANT SOLO LIFTS OTHER
 * THAN THE MAIN ONE."
 *
 * So the fix is not a better partner. It is that HE picks, at the rack, in the rest he is standing
 * in, and the app records it. Two of his own pairings are now in program.json because he did them
 * three times and wrote them down; the other eight solo blocks get this instead. That split is the
 * co-build rule in AGENTS.md applied literally: an agent authors the legality arithmetic, he
 * authors which exercise he actually wants.
 *
 * ------------------------------------------------------------------------------------------------
 * THE LEGALITY TEST IS validate.mjs's, TO THE LINE, AND THAT IS THE POINT.
 * ------------------------------------------------------------------------------------------------
 *
 * `scripts/gym-catalogue.mjs --fill` is the tool AGENTS.md names for this work and it CANNOT SEE
 * the pairing he asked for three times. Its `ridesFree` implements two of the three cases of his
 * 2026-05-23 rule ("(a) same equipment, (b) bodyweight/floor partner, or (c) adjacent equipment in
 * arm's reach") and skips (c). `rack` and `rack-pullup-bar` are declared adjacent in
 * equipment.json, which is exactly what makes hanging knee raises legal in the RDL's rest, and that
 * tool refuses it. A tool that cannot represent the answer will never suggest it however often it
 * is run.
 *
 * So this reimplements nothing by eye. `pairingLegal` below is the same three clauses in the same
 * order as `content/gym/validate.mjs` around its CONCURRENT block: at most one station unless the
 * two are mutually declared adjacent inside one zone, and two exercises on ONE station only where
 * that station declares `sharedInOneWindow`. Fail-closed in both files, for the same reason: a
 * wrong "you can" costs him a session and a wrong "you cannot" costs a walk.
 *
 * `content/gym/validate.test.mjs` asserts the two agree, so a rule changed in one file and not the
 * other fails the build rather than shipping a suggestion the gate would reject. That failure has
 * happened here before, in the other direction, and gym-catalogue.mjs's own header describes it:
 * "a tool that suggests work the gate will reject is worse than no tool: the suggestion is free and
 * the rejection arrives after the work is done."
 */

/* THE TWO TYPES LIVE IN types.ts, NOT HERE, and that is not tidiness. This module is `server-only`
 * because it reads the catalogue off disk, and GymClient is a client component that has to name the
 * shape of the prop it receives. A type re-exported from a server-only module is erased at compile
 * time and works right up until somebody adds a value export beside it, at which point the client
 * bundle imports `server-only` and the build dies with an error about the wrong file. Same reason
 * program-shared.ts was split out of program.ts in the first place. */
export type { FillCandidate, FillOptions } from './types';
import type { FillCandidate, FillOptions } from './types';

/** Every station in equipment.json, flattened, so a lookup does not have to know the zone. */
type StationRec = { name?: string; sharedInOneWindow?: boolean; adjacentTo?: string[] };

/* THE RULE ITSELF IS content/gym/pairing-legal.mjs AND THIS FILE DOES NOT CARRY A COPY.
 *
 * The first version of this module reimplemented the three clauses here, correctly, by reading
 * validate.mjs and writing them out again. That is how there came to be three implementations in the
 * first place, and one of the three (gym-catalogue.mjs) had already drifted far enough that the tool
 * AGENTS.md names for this exact work could not see the pairing he asked for three times. Copying a
 * rule accurately is still copying a rule. */
export { pairingLegal } from '../../../content/gym/pairing-legal.mjs';
import { pairingLegal } from '../../../content/gym/pairing-legal.mjs';

/* A rest shorter than this is not a rest anyone fills, and offering to fill it is a control on a
 * card that answers a question he did not ask. 45s partners (the lateral raise, the reverse fly)
 * are already the thing riding in somebody else's rest. */
const MIN_FILLABLE_REST_SECONDS = 60;

function restSecondsOf(rest: string | undefined): number {
  const m = String(rest || '').match(/([\d.]+)\s*(min|s)/i);
  if (!m) return 0;
  return m[2]!.toLowerCase() === 'min' ? Math.round(parseFloat(m[1]!) * 60) : parseFloat(m[1]!);
}

export async function computeFillOptions(
  loggedById: Map<string, { sets: number; weight: number | null }>,
): Promise<FillOptions> {
  const [program, cat, equip] = await Promise.all([loadProgram(), loadMovements(), loadEquipment()]);

  const stationOf = (zone: string, station: string | null): StationRec | undefined => {
    if (!zone || !station) return undefined;
    return (equip.zones as Record<string, { stations?: Record<string, StationRec> }>)[zone]?.stations?.[station];
  };

  /* EVERY ID PRESCRIBED ANYWHERE TODAY IS EXCLUDED, and it is a correctness requirement rather
   * than a nicety. A fill set is written through the ordinary upsert on
   * (date, exercise_id, set_idx), so offering an exercise the day already prescribes would let two
   * cards write over each other's rows. That is exactly the defect appendOffPlanSet was built to
   * stop in 2026-08-28's 10-gym P0-1, arriving by a different door: "Typing 'Dead Bug' into the
   * off-plan box on Tuesday wrote dead-bug, set_idx: 1 straight over the first prescribed dead-bug
   * set." Excluding them makes the collision unrepresentable instead of guarded. */
  const prescribedToday = (day: Day): Set<string> => {
    const ids = new Set<string>();
    for (const b of day.blocks) for (const ex of b.exercises) ids.add(ex.id);
    return ids;
  };
  /* ALTS ARE NOT EXCLUDED HERE ANY MORE, and the first version of this file got that wrong in the
   * direction that hides work. It excluded every alt of every slot, on the reasoning that a swap to
   * that alt plus a fill of the same id would collide on (date, exercise_id, set_idx). True, but the
   * reverse lunge is an alt of a squat on every day of the week, so the exercise he actually did in
   * the overhead press's rest on 2026-09-04 was offered NOWHERE, while the handoff and the reply to
   * him both said it was "in the fill list". A false "you have this" is the worse error.
   *
   * The collision is real and is now refused where it would happen instead of pre-empted by hiding
   * forty legal options: GymClient hides from this list any id currently EFFECTIVE on the day (a
   * swapped-in alt) or already appended through the off-plan box, hides from the swap picker any alt
   * that is a current fill, and `upsertSet` refuses to overwrite a row of the other kind (409). Three
   * layers, and only the last one is a gate; the first two are so the gate is rarely reached. */

  const out: FillOptions = {};

  for (const [dayKey, day] of Object.entries(program.days) as [DayKey, Day][]) {
    const taken = prescribedToday(day);

    day.blocks.forEach((block, bi) => {
      if (block.exercises.length !== 1) return;
      const lead = block.exercises[0] as Exercise;
      if (restSecondsOf(lead.rest) < MIN_FILLABLE_REST_SECONDS) return;

      const candidates: FillCandidate[] = [];

      for (const movement of Object.values(cat.movements)) {
        for (const v of movement.variants) {
          if (taken.has(v.id)) continue;

          /* THE SLOT'S ZONE, NOT THE CATALOGUE'S, FOR ANYTHING THAT HOLDS NO FIXTURE. A dumbbell
           * travels to the lead lift; the catalogue only records where the rack of them lives.
           * gym-catalogue.mjs got this wrong in the other direction on 2026-08-27 and called three
           * legal blocks a walk. */
          const station = v.station ?? null;
          const zone = station == null ? lead.zone : v.zone;

          if (!pairingLegal({ zone: lead.zone, station: lead.station }, { zone, station }, stationOf)) continue;

          /* THE FLOOR CLAUSE IS NOT FILTERED HERE, AND THAT IS DELIBERATE RATHER THAN AN OMISSION.
           *
           * validate.mjs also checks that a partner needing the floor is in a zone that HAS floor,
           * which is the clause his own words produced: "Realistically there's no way I can do a lat
           * pulldown and a dead bug. I'm not going to lay on the floor at that cable machine." That
           * check reads `needsFloor` off the SLOT in program.json. movements.json does not carry the
           * field, so nothing here can know it, and validate.mjs says so in its own comment.
           *
           * Rather than invent the flag across 103 variants, the list SHOWS what each option holds
           * ("no fixture", the station name) and the zone it would be done in, and he decides. That
           * is the co-build table applied as written: "what is actually in the gym, and where" is
           * his column, not an agent's. An option he scrolls past costs him nothing; a guessed flag
           * that hides a partner he wanted is the lazy answer he already called out on 2026-08-30. */
          const hist = loggedById.get(v.id);
          candidates.push({
            id: v.id,
            name: v.name,
            zone,
            station,
            group: movement.name,
            logged: hist?.sets ?? 0,
            lastWeight: hist?.weight ?? null,
            /* The fixture's own name out of equipment.json, never its key. See `where` in types.ts:
               the first version printed `cable-pulldown` and called a null station "nothing to
               carry", which is false of every dumbbell in the list. */
            where: station == null
              ? 'no machine needed'
              : (stationOf(zone, station)?.name ?? station),
          });
        }
      }

      /* HISTORY FIRST, THEN ALPHABETICAL. Something he has already loaded is a partner the card can
       * put a number on; everything else he has to judge cold, standing up, mid-rest. The tool this
       * replaces buried his own repeated pairing at rank 40 of 43 because it ordered by muscle
       * coverage, which is a fact about the programme rather than about him. */
      candidates.sort((a, b) => (b.logged - a.logged) || a.name.localeCompare(b.name));
      out[`${dayKey}:${bi}`] = candidates;
    });
  }

  return out;
}
