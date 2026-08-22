#!/usr/bin/env node
/**
 * Gym program validator. Same discipline as content/kitchen/validate.mjs: the rules that matter are
 * enforced mechanically, not left as prose someone has to remember to re-check.
 *
 * Run: node content/gym/validate.mjs
 * Zero dependencies on purpose.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(readFileSync(join(HERE, f), 'utf8'));

const program = readJson('program.json');
const warmups = readJson('warmups.json');
const cooldowns = readJson('cooldowns.json');
const equipment = readJson('equipment.json');
const conditioning = readJson('conditioning.json');

let FAIL = 0;
const out = [];
function fail(where, msg) { FAIL++; out.push(`FAIL  [${where}] ${msg}`); }

const REQUIRED_EX_FIELDS = ['id', 'name', 'sets', 'reps', 'rest', 'cue', 'zone', 'station'];
const REQUIRED_ALT_FIELDS = ['id', 'name', 'cue', 'zone', 'station'];
const ROLES = new Set(['primer', 'main', 'accessory']);
// 'fill' added 2026-08-21: the partner is done inside the lift's rest gaps. It is bound by the SAME
// physical rule as 'alternate' below, and more strictly if anything, because you are standing at the
// lift's own fixture while you do it.
const PAIRINGS = new Set(['alternate', 'sequence', 'fill']);
// Pairings whose two halves are in the gym AT THE SAME TIME, and so must fit in one place.
const CONCURRENT = new Set(['alternate', 'fill']);

// ---------------------------------------------------------------------------------------------
// The equipment map, flattened once. `station: null` is legal and means "occupies no fixture".
// Anything else must name a station that equipment.json actually lists, so a typo cannot invent a
// machine that is not in the building.
// ---------------------------------------------------------------------------------------------
const ZONES = equipment.zones;
const STATION_ZONE = new Map();
for (const [zoneKey, zone] of Object.entries(ZONES)) {
  for (const stationKey of Object.keys(zone.stations || {})) {
    if (STATION_ZONE.has(stationKey)) {
      fail('equipment.json', `station "${stationKey}" is declared in two zones`);
    }
    STATION_ZONE.set(stationKey, zoneKey);
  }
}

/** Every place `station` and `zone` are checked, for exercises and alts alike. An alt gets the same
 *  treatment as the exercise it replaces, because a swap that moves the partner to another machine
 *  recreates the exact defect this file exists to prevent. */
function checkPlacement(where, item, kind) {
  if (item.zone !== undefined && !ZONES[item.zone]) {
    fail(where, `${kind} "${item.id}" has zone "${item.zone}", which is not in equipment.json`);
    return;
  }
  if (item.station === null || item.station === undefined) return;
  const zoneOfStation = STATION_ZONE.get(item.station);
  if (!zoneOfStation) {
    fail(where, `${kind} "${item.id}" names station "${item.station}", which is not in equipment.json`);
    return;
  }
  if (zoneOfStation !== item.zone) {
    fail(where, `${kind} "${item.id}" is in zone "${item.zone}" but station "${item.station}" lives in zone "${zoneOfStation}"`);
  }
}

for (const [dayKey, day] of Object.entries(program.days)) {
  if (!day.name || !day.title) fail(dayKey, 'missing name/title');
  if (!warmups[day.warmup]) fail(dayKey, `warmup "${day.warmup}" not found in warmups.json`);
  for (const cdKey of day.cooldown || []) {
    if (!cooldowns[cdKey]) fail(dayKey, `cooldown key "${cdKey}" not found in cooldowns.json`);
  }

  if (!Array.isArray(day.blocks) || !day.blocks.length) { fail(dayKey, 'no blocks'); continue; }

  const idsInDay = new Set();
  for (const block of day.blocks) {
    const where = `${dayKey}/${block.label || block.role}`;

    if (!ROLES.has(block.role)) fail(where, `role must be one of ${[...ROLES].join('|')}, got "${block.role}"`);
    if (!PAIRINGS.has(block.pairing)) fail(where, `pairing must be one of ${[...PAIRINGS].join('|')}, got "${block.pairing}"`);

    // Every block says WHY it is in the programme. He stopped believing the programme because he had
    // never seen the evidence behind it, and a block added later with no reason attached is how that
    // comes back. 40 chars is not a quality bar, it just refuses "because" and an empty string.
    if (typeof block.why !== 'string' || block.why.trim().length < 40) {
      fail(where, `block needs a "why" of at least 40 characters, got ${JSON.stringify(block.why ?? null)}`);
    }

    if (!Array.isArray(block.exercises) || !block.exercises.length) {
      fail(where, 'empty exercises[]');
      continue;
    }
    // `alternate` means the two share one rest window, which only makes sense for exactly two.
    if (CONCURRENT.has(block.pairing) && block.exercises.length !== 2) {
      fail(where, `${block.pairing} block has ${block.exercises.length} exercises, expected exactly 2`);
    }

    for (const ex of block.exercises) {
      for (const f of REQUIRED_EX_FIELDS) {
        if (ex[f] === undefined || ex[f] === '') fail(where, `exercise missing "${f}": ${JSON.stringify(ex).slice(0, 60)}`);
      }
      if (ex.id) {
        if (idsInDay.has(ex.id)) fail(where, `duplicate exercise id "${ex.id}" within ${dayKey}`);
        idsInDay.add(ex.id);
      }
      checkPlacement(where, ex, 'exercise');

      // A timed exercise MUST say whether it carries load, because two different parts of the app
      // ask that question and they read different fields. progression.ts keys off `timed` and gets
      // it right; GymClient keys off `bodyweight` and, finding nothing, enables the weight box and
      // labels it "lb". So a plank asked Silvio for a weight on 2026-08-15.
      //
      // This check already existed here, as an empty if-block with a comment reading "not a hard
      // failure but worth a look". It identified the defect exactly and did nothing about it for as
      // long as it has been here, which is what ENGINEERING.md means by a rule that does not execute.
      // Guessing the answer is not available either: farmer-carry is timed AND loaded, so the author
      // has to say. Making it unrepresentable is the fix; being vigilant about it is not.
      if (ex.timed && typeof ex.bodyweight !== 'boolean') {
        fail(where, `timed exercise "${ex.id}" must declare bodyweight: true or false. Without it the weight box is enabled and asks for lb.`);
      }

      for (const alt of ex.alts || []) {
        for (const f of REQUIRED_ALT_FIELDS) {
          if (alt[f] === undefined || alt[f] === '') fail(where, `alt of "${ex.id}" missing "${f}": ${JSON.stringify(alt).slice(0, 60)}`);
        }
        checkPlacement(where, alt, `alt of "${ex.id}",`);
        if (alt.timed && typeof alt.bodyweight !== 'boolean') {
          fail(where, `timed alt "${alt.id}" of "${ex.id}" must declare bodyweight: true or false`);
        }
        // No alt should point back at its own exercise's id: a real bug that once slipped through
        // the hand-authored gym.html would silently make "swap" a no-op.
        if (alt.id === ex.id) fail(where, `"${ex.id}" lists itself as its own alt`);
      }
    }

    // -----------------------------------------------------------------------------------------
    // THE PAIRING RULE. A superset may occupy AT MOST ONE STATION, and if either half needs the
    // floor, the zone has to have floor.
    //
    // This is the check that did not exist. Every superset in the old program.json paired a
    // station lift with a floor or band exercise somewhere else in the gym, five times, and
    // Silvio found all five by standing there with a phone: "Realistically there's no way I can do
    // a lat pulldown and a dead bug. I'm not going to lay on the floor at that cable machine."
    // "Where am I supposed to put the band off standing calf raise? That's a machine, so you're
    // saying on the fore exercise I should use two machines."
    //
    // The rule itself is not new. It was written into HealthOS/HANDOFF.md on 2026-05-23, in prose,
    // and then broken five times, because prose does not execute. This does.
    //
    // `sequence` blocks are exempt by definition: you finish the first exercise and walk away
    // before starting the second, so occupying two stations in turn is fine.
    // -----------------------------------------------------------------------------------------
    if (CONCURRENT.has(block.pairing) && block.exercises.length === 2) {
      const [a, b] = block.exercises;

      // DISTINCT stations, because two exercises that use the same bench occupy one bench. Counting
      // raw entries instead flagged single-leg RDL alternating with a Copenhagen plank on the same
      // bench, which is the one arrangement that is obviously fine.
      const stations = [...new Set([a.station, b.station].filter((s) => s != null))];
      if (stations.length > 1) {
        fail(where, `${block.pairing} block occupies ${stations.length} stations (${stations.join(' + ')}). Two exercises done in one window may occupy at most one: the partner must need no fixture (floor, handheld band, bodyweight, dumbbells).`);
      }

      if (a.zone !== b.zone) {
        fail(where, `${block.pairing} block spans two zones ("${a.zone}" and "${b.zone}"). Doing both in one window means walking back and forth between them every set.`);
      }

      for (const ex of [a, b]) {
        if (!ex.needsFloor) continue;
        const zone = ZONES[ex.zone];
        if (zone && zone.floor !== true) {
          fail(where, `"${ex.id}" needs the floor but zone "${ex.zone}" has floor: ${JSON.stringify(zone.floor)}. ${zone.floorNote || ''}`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// THE REST RULE, ENFORCED ON THE PLAN. Added 2026-08-21, the day he chose "never more than 3 in a
// row" over a fixed day off.
//
// This is the mechanism half of that decision. The other half is on the page, which counts what he
// ACTUALLY did; this counts what the programme ASKS of him, and refuses to build when the plan
// contradicts its own rule. Without it, "max 3 consecutive" is a sentence in a JSON comment, and
// every prose rule in this workspace has been violated while every mechanical gate has held.
//
// The lifting days are read out of program.json rather than restated in conditioning.json. A
// second copy of the split would drift the first time a day moved, which is the same failure the
// body-metrics rule exists to prevent: every copy is a fact that goes stale silently.
// ---------------------------------------------------------------------------------------------
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

if (!conditioning.week?.restRule) {
  fail('conditioning.json', 'week.restRule is missing. It is load-bearing: /gym/conditioning reads maxConsecutive to judge the real week, and this gate cannot check a plan against a rule that is not there.');
} else {
  const { maxConsecutive } = conditioning.week.restRule;
  if (!Number.isInteger(maxConsecutive) || maxConsecutive < 1 || maxConsecutive > 7) {
    fail('conditioning.json', `week.restRule.maxConsecutive must be an integer from 1 to 7, got ${JSON.stringify(maxConsecutive)}`);
  }
  const assigned = conditioning.week.assignedDays ?? {};
  const training = new Set(Object.keys(program.days));   // the lifting split, from its own file
  for (const [slot, days] of Object.entries(assigned)) {
    if (slot.startsWith('$') || slot === 'why') continue;
    if (!Array.isArray(days)) {
      fail('conditioning.json', `week.assignedDays.${slot} must be an array of weekday names`);
      continue;
    }
    for (const d of days) {
      if (!WEEKDAYS.includes(d)) fail('conditioning.json', `week.assignedDays.${slot} names "${d}", which is not a weekday`);
      training.add(d);
    }
  }
  /* Scanned over TWO weeks back to back, because a week wraps. A Friday-to-Monday block reads as
     two separate runs of two under a single Monday-to-Sunday pass, and would sail through a rule
     it actually breaks. Capped at 7 so "trains every day" reports 7 rather than 14. */
  let run = 0;
  let worst = 0;
  let worstEnd = null;
  for (const d of [...WEEKDAYS, ...WEEKDAYS]) {
    if (training.has(d)) {
      run++;
      if (run > worst) { worst = run; worstEnd = d; }
    } else run = 0;
  }
  worst = Math.min(worst, 7);
  if (Number.isInteger(maxConsecutive) && worst > maxConsecutive) {
    fail(
      'conditioning.json',
      `the PLANNED week trains ${worst} days in a row (ending ${worstEnd}), but week.restRule.maxConsecutive is ${maxConsecutive}. ` +
        `Training days in the plan: ${WEEKDAYS.filter((d) => training.has(d)).join(', ')}. ` +
        `Move a conditioning slot onto a day that is already a training day, or change the rule on purpose.`,
    );
  } else {
    out.push(`ok    [conditioning.json] planned week trains ${training.size} days, longest run ${worst}, rule allows ${maxConsecutive}`);
  }
}

console.log(out.join('\n'));
console.log('-'.repeat(70));
console.log(`${Object.keys(program.days).length} days checked, the planned week checked against its rest rule, ${FAIL} failures`);
process.exit(FAIL ? 1 : 0);
