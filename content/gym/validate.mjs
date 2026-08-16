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

let FAIL = 0;
const out = [];
function fail(where, msg) { FAIL++; out.push(`FAIL  [${where}] ${msg}`); }

const REQUIRED_EX_FIELDS = ['id', 'name', 'sets', 'reps', 'rest', 'cue', 'zone', 'station'];
const REQUIRED_ALT_FIELDS = ['id', 'name', 'cue', 'zone', 'station'];
const ROLES = new Set(['primer', 'main', 'accessory']);
const PAIRINGS = new Set(['alternate', 'sequence']);

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

    if (!Array.isArray(block.exercises) || !block.exercises.length) {
      fail(where, 'empty exercises[]');
      continue;
    }
    // `alternate` means the two share one rest window, which only makes sense for exactly two.
    if (block.pairing === 'alternate' && block.exercises.length !== 2) {
      fail(where, `alternate block has ${block.exercises.length} exercises, expected exactly 2`);
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
    if (block.pairing === 'alternate' && block.exercises.length === 2) {
      const [a, b] = block.exercises;

      // DISTINCT stations, because two exercises that use the same bench occupy one bench. Counting
      // raw entries instead flagged single-leg RDL alternating with a Copenhagen plank on the same
      // bench, which is the one arrangement that is obviously fine.
      const stations = [...new Set([a.station, b.station].filter((s) => s != null))];
      if (stations.length > 1) {
        fail(where, `alternate block occupies ${stations.length} stations (${stations.join(' + ')}). A superset may occupy at most one: the partner must need no fixture (floor, handheld band, bodyweight, dumbbells).`);
      }

      if (a.zone !== b.zone) {
        fail(where, `alternate block spans two zones ("${a.zone}" and "${b.zone}"). Alternating means walking back and forth between them every set.`);
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

console.log(out.join('\n'));
console.log('-'.repeat(70));
console.log(`${Object.keys(program.days).length} days checked, ${FAIL} failures`);
process.exit(FAIL ? 1 : 0);
