#!/usr/bin/env node
/**
 * Answers "how do we know the exercise list is complete?" and "what else can this be done with?"
 *
 *   node scripts/gym-catalogue.mjs                  # the completeness audit
 *   node scripts/gym-catalogue.mjs --options        # every movement, every way to do it, by station
 *   node scripts/gym-catalogue.mjs --pairing        # what each day costs in walking between stations
 *
 * WHY IT EXISTS, and it is a correction to my own method. On 2026-08-27 scripts/gym-coverage.mjs
 * reported that no muscle was below its minimum dose and concluded nothing was missing. He replied:
 * "you are going about the list that we already have, but how do we know if that list is complete?"
 *
 * He is right and the reasoning was circular. Coverage measured against the exercises already chosen
 * can only ever come back complete, because the exercises define the muscles that get counted.
 *
 * THE FIX IS TO MEASURE AGAINST A DIFFERENT CLOSED SET. You cannot enumerate every exercise that
 * exists, so completeness in the abstract is unprovable. But HIS GYM IS FINITE AND ALREADY WRITTEN
 * DOWN, in content/gym/equipment.json: 8 zones, 24 stations, every one with a confidence level. So:
 *
 *   1. Every station the gym HAS that no movement reaches. That is a hole you can actually name.
 *   2. Every muscle with no LOADABLE direct option, and whether the gym offers one anyway.
 *   3. Every movement with no option at a given zone, so "can I do this at the rack instead" has an
 *      answer instead of a shrug.
 *
 * That does not prove the catalogue is complete against the world. It proves it is complete against
 * the building, which is the only claim worth making and the only one that can be re-checked when
 * the gym changes.
 *
 * AND THE STATION-WALK REPORT exists because of his other point: "if I am about to do a straight-arm
 * pulldown and I was going to pair that with something for biceps, you might as well [use] the cable
 * [curl] instead of" walking to the dumbbells. A pairing whose two halves sit at different stations
 * cannot be done in the rest gap, which is the entire mechanism that makes a paired block cost no
 * extra time. --pairing lists them.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));

const program = read('content/gym/program.json');
const cat = read('content/gym/movements.json');
const equip = read('content/gym/equipment.json');

const mode = process.argv.includes('--options') ? 'options'
           : process.argv.includes('--pairing') ? 'pairing'
           : process.argv.includes('--fill') ? 'fill'
           : 'audit';

const pad = (s, n) => String(s).padEnd(n);
const rule = (c = '-') => console.log(c.repeat(78));
/** Fractional sets are halves. One decimal, and no trailing ".0" to read as false precision. */
const r1 = (n) => String(Math.round(n * 10) / 10);

/* ---- flatten the catalogue ---- */

const variants = [];               // every way to do anything
const byId = new Map();
for (const [mid, m] of Object.entries(cat.movements)) {
  for (const v of m.variants) {
    const flat = {
      ...v,
      movement: mid,
      movementName: m.name,
      primary: v.primary ?? m.primary,
      secondary: v.secondary ?? m.secondary,
      confidence: v.confidence ?? m.confidence,
    };
    variants.push(flat);
    if (byId.has(v.id)) console.error(`DUPLICATE variant id: ${v.id}`);
    byId.set(v.id, flat);
    // program.json's per-slot alts carry older ids for jobs the catalogue already names. Resolving
    // them here rather than rewriting 50 slots keeps the rename out of the same commit as the audit.
    for (const a of v.aliases ?? []) byId.set(a, flat);
  }
}

/* ---- every station the gym has ---- */

// cardio and pool are not lifting stations. conditioning.json owns the run, the bike and the swim,
// and counting a treadmill as a hole in a lifting catalogue would be a false finding on every run.
const NOT_LIFTING = new Set(['cardio', 'pool']);
const stations = [];
for (const [zid, z] of Object.entries(equip.zones)) {
  if (NOT_LIFTING.has(zid)) continue;
  for (const [sid, s] of Object.entries(z.stations ?? {})) {
    stations.push({ zone: zid, station: sid, name: s.name, confidence: s.confidence });
  }
}

/* ---- what the programme actually prescribes ---- */

const prescribed = new Set();
const days = program.days ?? program;

/* WHETHER A VARIANT IS PRESCRIBED IS DERIVED, NEVER STORED. movements.json carried an
 * `inProgramme` boolean until 2026-08-27 and nine of the 103 were already wrong on the day the file
 * shipped, because that morning's rebuild edited program.json and left the flags behind. This
 * function reads the one place that knows. Aliases count: program.json still names some slots by an
 * older id that the catalogue resolves through `aliases`, and a variant reached that way is just as
 * prescribed as one reached by its own id. */
const isPrescribed = (v) => prescribed.has(v.id) || (v.aliases ?? []).some((a) => prescribed.has(a));
const dayBlocks = [];
for (const [dayKey, day] of Object.entries(days)) {
  if (!day?.blocks) continue;
  for (const b of day.blocks) {
    dayBlocks.push({ day: dayKey, label: b.label, role: b.role, pairing: b.pairing, exercises: b.exercises });
    for (const ex of b.exercises) prescribed.add(ex.id);
  }
}

/* ==================== OPTIONS ==================== */

if (mode === 'options') {
  console.log('\nEVERY MOVEMENT, EVERY WAY TO DO IT, GROUPED BY WHERE YOU STAND');
  console.log('* = currently in the programme.  "no load" = cannot be progressed by weight.');
  rule('=');
  for (const [mid, m] of Object.entries(cat.movements)) {
    console.log(`\n${m.name}   [${mid}]`);
    console.log('  trains: ' + m.primary.map((x) => cat.muscles[x]).join(', ') +
                (m.secondary.length ? '   assists: ' + m.secondary.map((x) => cat.muscles[x]).join(', ') : ''));
    const byZone = {};
    for (const v of m.variants) (byZone[v.zone] ??= []).push(v);
    for (const [zone, vs] of Object.entries(byZone)) {
      const zname = equip.zones[zone]?.name ?? zone;
      console.log(`    ${pad(zname, 30)} ${vs.map((v) => (isPrescribed(v) ? '*' : '') + v.name + (v.loadable ? '' : ' (no load)')).join(',  ')}`);
    }
  }
  console.log('');
  process.exit(0);
}

/* ==================== PAIRING ==================== */

/* THE FREE-PARTNER TEST, AND IT IS ABOUT STATIONS, NOT ZONES.
 *
 * From the handoff of 2026-08-27, learned by making the mistake:
 *
 *     A fill partner must EITHER hold no fixture at all, so he carries it to the lead lift,
 *     OR hold the exact same fixture.
 *
 * SAME ZONE IS NOT SAME STATION, and this function compared zones until 2026-08-27. The cable
 * section is one zone and three separate columns: the seated row holds the low pulley, a cable
 * lateral raise needs the adjustable one, and nobody can do both in one rest gap. So the zone
 * comparison called three impossible swaps free and PRINTED THEM UNDER THE WORD "station":
 * cable lateral raise behind the seated row, cable curl behind the pushdown, reverse pec deck
 * behind the machine shoulder press. All three were tried on 2026-08-27 and reversed within the
 * hour, all three fail content/gym/validate.mjs today, and this tool was recommending them back.
 *
 * A tool that suggests work the gate will reject is worse than no tool: the suggestion is free and
 * the rejection arrives after the work is done. Same rule as validate.mjs's one-station check, so
 * the suggestion and the gate cannot disagree.
 *
 * AND IT READS THE SLOT, NOT THE CATALOGUE, FOR WHAT IS ALREADY PRESCRIBED. Second correction the
 * same day. A dumbbell holds no fixture, so it is CARRIED to whatever lift it partners: the
 * catalogue files every dumbbell variant under `benchDb` because that is where the rack of them
 * lives, and program.json records the zone he actually stands in. Comparing catalogue zones called
 * three legal blocks a walk (lateral raise behind the seated row, hammer curl behind the pushdown,
 * reverse fly behind the machine press) when the whole point of choosing a dumbbell there was that
 * it travels. content/gym/validate.mjs compares slot zones and passes all three, so this now agrees
 * with the gate in both directions.
 *
 * The catalogue is still the authority for CANDIDATES, which is the one question it can answer:
 * what else could do this partner's job, and where does that thing stand.
 *
 * ONE THING THIS DOES NOT CHECK: whether a partner needing the floor has floor in that zone.
 * movements.json carries no `needsFloor`; program.json does, per slot, and validate.mjs checks it
 * there. A candidate below can still be refused for that reason. */
const holdsNothing = (v) => v.station === null || v.station === undefined;
const stationName = (v) => (holdsNothing(v) ? 'no fixture' : (equip.zones[v.zone]?.stations?.[v.station]?.name ?? v.station));
/* At most ONE fixture across the two: a lead that holds nothing leaves the partner free to hold
 * something, and two exercises on the same bench occupy one bench.
 *
 * THE SAME-STATION CLAUSE NEEDS A PERMISSION, and this said "validate.mjs's own test verbatim"
 * while that stopped being true on 2026-08-28. The gate gained a second half that day, on his note
 * #27: two exercises on ONE station pass the count (a `Set` collapses them to a single entry) and
 * are then refused unless that station declares `sharedInOneWindow`. It defaults to false, so today
 * exactly two stations qualify, the bench and the plyo box. Without this clause the tool offers
 * every cable-column pairing the validator refuses, which is the failure mode already written up
 * for `--pairing`: the suggestion is free and the rejection arrives after the work is done.
 *
 * A comment claiming agreement with another file is worth exactly as much as the code under it. */
const sharedStation = (v) => equip.zones[v.zone]?.stations?.[v.station]?.sharedInOneWindow === true;
const ridesFree = (partner, lead) =>
  partner.zone === lead.zone &&
  (holdsNothing(partner) || holdsNothing(lead)
    || (partner.station === lead.station && sharedStation(lead)));

if (mode === 'pairing') {
  console.log('\nWHAT EACH PAIRED BLOCK COSTS IN WALKING');
  console.log('A partner rides free in the lead lift\'s rest gap only if it is in the same ZONE and');
  console.log('either holds NO fixture (dumbbell, handheld band, bodyweight) or holds the lead\'s OWN');
  console.log('fixture. Same zone is not the same station: the cable section is three columns.');
  console.log('Where a partner fails that, the catalogue is asked what else could do its job on the spot.');
  rule('=');
  let splits = 0;
  let sequences = 0;
  for (const b of dayBlocks) {
    if (b.exercises.length < 2) continue;
    /* A `sequence` BLOCK IS NOT A WALK, IT IS TWO EXERCISES DONE IN TURN, and content/gym/validate.mjs
     * exempts it from the one-station rule for exactly that reason: you finish the first and walk
     * away before starting the second, so occupying two fixtures one after the other is fine.
     * Reporting them here as blocks that "cost him a walk" was a false finding on two of the five,
     * and both of them are the calf raise, whose Monday block says in its own `why` that it follows
     * rather than alternating. A tool that reports a cost the programme deliberately chose teaches
     * the reader to discount the other three. */
    if (b.pairing === 'sequence') { sequences++; continue; }
    const leadSlot = b.exercises[0];
    const lead = byId.get(leadSlot.id);
    if (!lead) continue;
    // Where he actually stands for the lead lift, which for a travelling implement is the slot's
    // answer and not the catalogue's. `where` is the placement; `lead` stays the catalogue entry
    // because only it knows the movement and the muscles.
    const leadAt = { zone: leadSlot.zone, station: leadSlot.station ?? null };
    const leadWhere = `${equip.zones[leadAt.zone]?.name ?? leadAt.zone} / ${stationName(leadAt)}`;
    for (const ex of b.exercises.slice(1)) {
      const p = byId.get(ex.id);
      if (!p) continue;
      const pAt = { zone: ex.zone, station: ex.station ?? null };
      if (ridesFree(pAt, leadAt)) continue;
      splits++;
      const why = pAt.zone !== leadAt.zone ? 'different zone, a walk every set'
                                           : 'same zone, but a second fixture he cannot also hold';
      console.log(`\n  ${b.day}  ${b.label}`);
      console.log(`    lead    ${pad(lead.name, 30)} at ${leadWhere}`);
      console.log(`    partner ${pad(p.name, 30)} at ${equip.zones[pAt.zone]?.name ?? pAt.zone} / ${stationName(pAt)}`);
      console.log(`            ${why}`);
      /* A candidate that holds NOTHING travels to the lead wherever the lead is, so it is judged at
         the lead's own zone rather than at the one the catalogue files it under. */
      const here = cat.movements[p.movement].variants
        .map((v) => ({ ...v, primary: v.primary ?? cat.movements[p.movement].primary }))
        .filter((v) => v.id !== p.id && ridesFree(holdsNothing(v) ? { zone: leadAt.zone, station: null } : v, leadAt));
      if (here.length) {
        console.log(`    same job WITHOUT leaving the lead: ${here.map((v) => v.name + (v.loadable ? '' : ' (no load)')).join(',  ')}`);
      } else {
        console.log(`    same job WITHOUT leaving the lead: NONE in the catalogue.`);
      }
    }
  }
  console.log(`\n${splits} paired block(s) cost him a walk or a second fixture mid-block.`);
  console.log(`${sequences} block(s) skipped: they are "sequence", where doing one then the other is the point.`);
  console.log('');
  process.exit(0);
}

/* ==================== FILL ==================== */

/* WHAT COULD RIDE IN A LEAD LIFT'S REST, FOR THE LEADS THAT HAVE NOTHING IN IT.
 *
 * --pairing answers "does an existing pair cost a walk", and as of 2026-08-27 the answer is none:
 * every pair in the week is already legal. That is not the complaint. The complaint is:
 *
 *   "I have all this time between the sets on the 2, 3, and 4 lifts that I'm just resting. The whole
 *    thing was supposed to save time."
 *
 * The 2026-08-27 rebuild applied "a partner may not share a muscle with the lead" by DELETING
 * partners rather than replacing them, so ten blocks are a single lift with three minutes of rest
 * between sets, while the accessories with forty-five-second rests kept theirs. Exactly backwards.
 * --pairing could not see that at all: a block of one has nothing to compare.
 *
 * THREE FILTERS, AND EVERY ONE OF THEM IS A RULE THAT ALREADY EXISTS SOMEWHERE ELSE:
 *
 *   rides free    same zone as the lead, and holds either no fixture or the lead's own. Identical
 *                 to content/gym/validate.mjs's one-station rule, so nothing suggested here can
 *                 fail the build.
 *   no overlap    no shared PRIMARY muscle with the lead. Zhang 2025, the rule that replaced
 *                 "every block is a pair" and made a block of one legal in the first place.
 *   with a price  every candidate carries what it would do to the week's volume, because the answer
 *                 to "what can go here" is worthless without it: abdominals are already at 16
 *                 fractional sets against an efficient zone that tops out at 10.
 *
 * The last one is why this imports src/lib/gym/coverage.mts rather than counting sets itself.
 *
 * IT PROPOSES, IT DOES NOT CHOOSE. Which partner goes where is his call, and the two things this
 * cannot know are whether he wants the extra volume and whether the cue would be followable.
 */
if (mode === 'fill') {
  const { computeCoverage } = await import('../src/lib/gym/coverage.mts');
  const coverage = computeCoverage(program, cat);
  const setsFor = new Map(coverage.perMuscle.map((m) => [m.muscle, m.sets]));
  const SHOW = Number(process.env.FILL_SHOW || 8);

  /* WHERE an exercise already sits, WITH THE REST IT IS SITTING IN, because that rest is the whole
     argument. His complaint is not that the week is short of exercises, it is that the three-minute
     rests are empty while the forty-five-second ones are full:

       "I have all this time between the sets on the 2, 3, and 4 lifts that I'm just resting."

     So a move is only worth making in one direction, from a short rest into a long one, and a line
     that does not print both numbers cannot be read as a decision. It also records whether the
     block it would leave becomes a single lift, which is the cost side of the same move. */
  const prescribedAt = new Map();
  for (const b of dayBlocks) {
    for (const e of b.exercises) {
      if (prescribedAt.has(e.id)) continue;
      prescribedAt.set(e.id, { day: b.day, label: b.label, rest: e.rest, leavesSolo: b.exercises.length === 2 });
    }
  }

  console.log('\nWHAT COULD RIDE IN THE REST OF A LIFT THAT HAS NOTHING IN IT');
  console.log('Filters: rides free at the lead (validate.mjs\'s own one-station rule), shares no main');
  console.log('muscle with the lead (Zhang 2025), and every option priced in weekly sets.');
  console.log('"in the week" = already prescribed somewhere, so using it here MOVES work instead of');
  console.log('adding it. That is the only kind of fill that costs nothing.');
  rule('=');

  const soloBlocks = dayBlocks.filter((b) => b.exercises.length === 1);

  /* TWO PASSES, BECAUSE THIS TOOL HAD NO MEMORY AND IT MADE ONE EXERCISE LOOK LIKE NINE.
   *
   * It priced every block against the CURRENT programme and never against the blocks it had already
   * reported, so DB Calf Raise came out top in all nine solo blocks, each time reading "calves 9 to
   * 12" as if it were a fresh opportunity. It is one exercise offered nine times, and the nine
   * cannot all be taken: filling every empty rest costs 27 to 36 sets, while the five muscles still
   * at or under the efficient zone top have SIX sets of headroom between them.
   *
   * A per-block price with no budget above it reads as nine cheap decisions. The budget is the
   * finding, so it is computed first and printed first, and each option carries the number of blocks
   * it also appears in. Nothing here chooses; it stops the report from implying a choice is free. */
  const blockOptions = new Map();
  const offeredIn = new Map();
  const optionsFor = (b) => {
    const slot = b.exercises[0];
    const lead = byId.get(slot.id);
    if (!lead) return null;
    const leadAt = { zone: slot.zone, station: slot.station ?? null };
    const leadPrimary = new Set(lead.primary);
    return { slot, lead, leadAt, leadPrimary };
  };

  /* THE BUDGET. Headroom is counted per muscle and only where it is positive: a muscle already past
     10 has none, and a negative does not offset another muscle's spare set. Separate denominators,
     the same reason `price` reports per muscle rather than summing. */
  const headroomByMuscle = coverage.perMuscle
    .map((m) => ({ m: m.muscle, left: 10 - m.sets }))
    .filter((x) => x.left > 0)
    .sort((a, x) => x.left - a.left);
  const totalHeadroom = headroomByMuscle.reduce((n, x) => n + x.left, 0);
  const fillCost = soloBlocks.reduce((n, b) => n + Number(b.exercises[0].sets || 0), 0);
  console.log(`  BUDGET. Filling all ${soloBlocks.length} empty rests costs ${fillCost} sets, one per set of each lead.`);
  console.log(`  Muscles still under the efficient zone top have ${r1(totalHeadroom)} sets of headroom BETWEEN THEM:`);
  console.log(`    ${headroomByMuscle.map((x) => `${cat.muscles[x.m] ?? x.m} ${r1(x.left)}`).join(', ') || 'none, every muscle is past 10'}`);
  console.log('  So most of these cannot be taken together. Each price below is "if you take only this one".');
  rule('-');

  for (const b of soloBlocks) {
    const ctx = optionsFor(b);
    if (!ctx) continue;
    for (const v of variants) {
      if (v.id === ctx.lead.id) continue;
      if (!ridesFree(holdsNothing(v) ? { zone: ctx.leadAt.zone, station: null } : v, ctx.leadAt)) continue;
      if (v.primary.some((m) => ctx.leadPrimary.has(m))) continue;
      offeredIn.set(v.id, (offeredIn.get(v.id) ?? 0) + 1);
    }
  }

  for (const b of soloBlocks) {
    const ctx = optionsFor(b);
    if (!ctx) continue;
    const { slot, lead, leadAt, leadPrimary } = ctx;

    /* The role is printed because it changes the answer. A `primer` is pinned first and done fresh
       (Deng 2024, quoted in content/gym/validate.mjs's zone-order rule), so filling its rest with
       fatiguing work is a different proposition from filling a main lift's three minutes. This tool
       does not decide that; it declines to hide it. */
    console.log(`\n  ${b.day}  ${b.label}   [${b.role}]`);
    console.log(`    lead    ${pad(lead.name, 30)} ${slot.sets} x ${slot.reps}, rest ${slot.rest}`);
    console.log(`            at ${equip.zones[leadAt.zone]?.name ?? leadAt.zone} / ${stationName(leadAt)}`);
    console.log(`            trains ${lead.primary.map((x) => cat.muscles[x]).join(', ')}`);

    const options = variants
      .filter((v) => v.id !== lead.id)
      .filter((v) => ridesFree(holdsNothing(v) ? { zone: leadAt.zone, station: null } : v, leadAt))
      .filter((v) => !v.primary.some((m) => leadPrimary.has(m)))
      .map((v) => {
        const where = prescribedAt.get(v.id) ?? (v.aliases ?? []).map((a) => prescribedAt.get(a)).find(Boolean);
        return {
          v,
          where,
          /* THE PRICE OF AN OPTION ALREADY IN THE WEEK IS ZERO, and the first version of this
             printed the ADD price for those too. Moving three sets of dead bug out of Tuesday and
             into this rest window does not create three sets; it relocates them. Printing "abs 16
             to 19" next to a move is a false number, and a false number beside a real one is worse
             than no report. Priced at the lead's own set count, because a partner runs one set per
             set of the lead, and reported per muscle rather than summed: separate denominators. */
          price: where ? null : v.primary.map((m) => {
            const now = setsFor.get(m) ?? 0;
            return { m, now, then: now + Number(slot.sets || 0) };
          }),
          /* How much room its worst-served muscle has left before the efficient zone runs out.
             Negative means it is already past 10, which is where 11 of 16 muscles sit. */
          headroom: Math.min(...v.primary.map((m) => 10 - (setsFor.get(m) ?? 0))),
        };
      })
      /* Already in the week first: those move work rather than adding it, and are the only option
         that does not have to argue with the volume numbers at all. Then whichever adds to the
         muscle with the most room left. */
      .sort((a, x) => Number(Boolean(x.where)) - Number(Boolean(a.where))
        || x.headroom - a.headroom
        || a.v.name.localeCompare(x.v.name));

    if (!options.length) {
      console.log('    nothing in the catalogue rides free here without sharing a muscle.');
      continue;
    }
    /* CAPPED, and the cap is the point. Twenty-four options is not a decision, it is a wall, and a
       wall is what note #12 is about. The sort puts the ones worth reading first. */
    for (const o of options.slice(0, SHOW)) {
      const price = o.where
        ? `move from ${o.where.day} ${o.where.label}, rest ${o.where.rest} to ${slot.rest}` +
          (o.where.leavesSolo ? ', leaves that block solo' : '')
        : o.price.map((p) => `${cat.muscles[p.m] ?? p.m} ${p.now} to ${p.then}${p.then > 10 ? ' PAST 10' : ''}`).join(', ');
      /* "also fits N others" is the memory this tool did not have. Without it the same DB Calf
         Raise reads as nine separate cheap wins, and its price is only true for the first one. */
      const n = (offeredIn.get(o.v.id) ?? 1) - 1;
      const also = n > 0 ? `  (also fits ${n} other empty rest${n === 1 ? '' : 's'})` : '';
      console.log(`      ${o.where ? '*' : ' '} ${pad(o.v.name, 28)} ${o.v.loadable ? '        ' : 'no load '}${price}${also}`);
    }
    if (options.length > SHOW) {
      console.log(`        ... and ${options.length - SHOW} more that ride free here, all of them adding sets to a muscle already past 10.`);
    }
  }

  console.log(`\n${soloBlocks.length} block(s) are a single lift with nobody in the rest.`);
  console.log('* = already in the week, so it MOVES rather than adds. Read the two rests: a move out');
  console.log('of a 45s rest into a 3 min rest is the whole point. Anything without a star ADDS the');
  console.log('sets shown, to a muscle whose current count is printed beside it.');
  console.log('');
  console.log('Every price is measured against the programme as it stands, so THE PRICES DO NOT ADD UP.');
  console.log('Taking the same option in two blocks costs twice what one line says, and taking a starred');
  console.log('one twice is not possible at all. The budget at the top is the number that binds.');
  console.log('');
  process.exit(0);
}

/* ==================== AUDIT ==================== */

console.log('\nIS THE EXERCISE LIST COMPLETE?');
console.log('Not against every exercise that exists, which is unprovable. Against HIS GYM, which is');
console.log(`finite: ${Object.keys(equip.zones).length - NOT_LIFTING.size} lifting zones, ${stations.length} stations, all in equipment.json.`);
console.log('(cardio and the pool are excluded: conditioning.json owns those.)');
rule('=');

/* 1. stations nothing reaches */
console.log('\n1. STATIONS THE GYM HAS THAT NO MOVEMENT USES\n');
const reached = new Set(variants.filter((v) => v.station).map((v) => `${v.zone}/${v.station}`));
const unreached = stations.filter((s) => !reached.has(`${s.zone}/${s.station}`));
if (!unreached.length) console.log('   none. Every station is reachable by something in the catalogue.');
for (const s of unreached) {
  console.log(`   ${pad(s.zone + '/' + s.station, 34)} ${pad(s.name, 32)} (${s.confidence})`);
}

/* 2. stations in the catalogue that nothing prescribes */
console.log('\n2. STATIONS THE CATALOGUE REACHES BUT THE PROGRAMME NEVER VISITS\n');
const usedInProgramme = new Set(
  variants.filter((v) => isPrescribed(v) && v.station).map((v) => `${v.zone}/${v.station}`));
const idle = stations.filter((s) => reached.has(`${s.zone}/${s.station}`) && !usedInProgramme.has(`${s.zone}/${s.station}`));
if (!idle.length) console.log('   none.');
for (const s of idle) {
  const opts = variants.filter((v) => v.zone === s.zone && v.station === s.station);
  console.log(`   ${pad(s.name, 32)} could run: ${opts.map((v) => v.name).join(', ')}`);
}

/* 3. muscles with no loadable direct option prescribed */
console.log('\n3. MUSCLES WITH NO LOADABLE DIRECT EXERCISE IN THE PROGRAMME\n');
console.log('   A muscle trained only by bodyweight work can never be progressed, whatever its set count.');
console.log('');
let gaps = 0;
for (const [mus, label] of Object.entries(cat.muscles)) {
  const inProg = variants.filter((v) => isPrescribed(v) && v.primary.includes(mus));
  const loadableInProg = inProg.filter((v) => v.loadable);
  if (inProg.length && !loadableInProg.length) {
    gaps++;
    const available = variants.filter((v) => v.loadable && v.primary.includes(mus));
    console.log(`   ${pad(label, 24)} prescribed: ${inProg.map((v) => v.name).join(', ')}  ALL BODYWEIGHT`);
    console.log(`   ${pad('', 24)} gym offers: ${available.length ? available.map((v) => v.name).join(', ') : 'nothing'}`);
  }
}
if (!gaps) console.log('   none.');

/* 4. per movement, which zones can serve it */
console.log('\n4. WHERE EACH JOB CAN BE DONE, so a slot can move to the station he is already at\n');
const zoneKeys = ['rack', 'benchDb', 'cable', 'machines', 'smith', 'ezPreacher'];
console.log('   ' + pad('movement', 28) + zoneKeys.map((z) => pad(z.slice(0, 9), 10)).join(''));
rule();
for (const [mid, m] of Object.entries(cat.movements)) {
  const cells = zoneKeys.map((z) => {
    const vs = m.variants.filter((v) => v.zone === z);
    if (!vs.length) return pad('.', 10);
    return pad(vs.some((v) => isPrescribed(v)) ? `${vs.length} *` : String(vs.length), 10);
  });
  console.log('   ' + pad(m.name.length > 27 ? m.name.slice(0, 26) + '…' : m.name, 28) + cells.join(''));
}
console.log('\n   * = the programme currently uses one of that zone\'s options. A number with no star is');
console.log('   an option that exists and is unused.');

/* 5. duplicate ids for one job, the drift the old per-slot alts produced */
console.log('\n5. THE OLD PER-SLOT `alts`, AND WHAT THEY DUPLICATED\n');
const altIds = new Set();
for (const b of dayBlocks) for (const ex of b.exercises) for (const a of ex.alts ?? []) altIds.add(a.id);
const orphanAlts = [...altIds].filter((id) => !byId.has(id));
console.log(`   program.json carries ${altIds.size} distinct alt ids across its slots.`);
console.log(`   ${altIds.size - orphanAlts.length} resolve to a catalogue variant.`);
if (orphanAlts.length) {
  console.log(`   ${orphanAlts.length} do NOT, and are duplicate ids for a job the catalogue already names:`);
  for (const id of orphanAlts.sort()) console.log(`      ${id}`);
}

console.log('');
rule('=');
const problems = unreached.length + gaps;
console.log(`${unreached.length} station(s) no movement reaches, ${idle.length} the programme never visits, ` +
            `${gaps} muscle(s) with no loadable option, ${orphanAlts.length} orphan alt id(s).`);
console.log(problems ? 'GAPS FOUND.' : 'COMPLETE against the gym as recorded.');
process.exit(problems ? 1 : 0);
