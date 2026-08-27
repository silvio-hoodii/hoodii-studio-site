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
           : 'audit';

const pad = (s, n) => String(s).padEnd(n);
const rule = (c = '-') => console.log(c.repeat(78));

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
      console.log(`    ${pad(zname, 30)} ${vs.map((v) => (v.inProgramme ? '*' : '') + v.name + (v.loadable ? '' : ' (no load)')).join(',  ')}`);
    }
  }
  console.log('');
  process.exit(0);
}

/* ==================== PAIRING ==================== */

if (mode === 'pairing') {
  console.log('\nWHAT EACH PAIRED BLOCK COSTS IN WALKING');
  console.log('A partner only rides free in the lead lift\'s rest gap if it is AT the lead lift.');
  console.log('Where they differ, the catalogue is asked what else could do the partner\'s job on the spot.');
  rule('=');
  let splits = 0;
  for (const b of dayBlocks) {
    if (b.exercises.length < 2) continue;
    const lead = byId.get(b.exercises[0].id);
    if (!lead) continue;
    for (const ex of b.exercises.slice(1)) {
      const p = byId.get(ex.id);
      if (!p) continue;
      const sameSpot = p.zone === lead.zone;
      if (sameSpot) continue;
      splits++;
      console.log(`\n  ${b.day}  ${b.label}`);
      console.log(`    lead    ${pad(lead.name, 30)} at ${equip.zones[lead.zone]?.name ?? lead.zone}`);
      console.log(`    partner ${pad(p.name, 30)} at ${equip.zones[p.zone]?.name ?? p.zone}   <-- different place`);
      const here = cat.movements[p.movement].variants
        .map((v) => ({ ...v, primary: v.primary ?? cat.movements[p.movement].primary }))
        .filter((v) => v.zone === lead.zone && v.id !== p.id);
      if (here.length) {
        console.log(`    same job at the lead's station: ${here.map((v) => v.name + (v.loadable ? '' : ' (no load)')).join(',  ')}`);
      } else {
        console.log(`    same job at the lead's station: NONE in the catalogue.`);
      }
    }
  }
  console.log(`\n${splits} paired block(s) send him to a second station mid-block.`);
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
  variants.filter((v) => prescribed.has(v.id) && v.station).map((v) => `${v.zone}/${v.station}`));
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
  const inProg = variants.filter((v) => prescribed.has(v.id) && v.primary.includes(mus));
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
    return pad(vs.some((v) => prescribed.has(v.id)) ? `${vs.length} *` : String(vs.length), 10);
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
