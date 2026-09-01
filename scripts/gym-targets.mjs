#!/usr/bin/env node
/**
 * DOES EVERY MUSCLE GET A DIRECT DOSE, against one quoted floor and one quoted target.
 *
 *   node scripts/gym-targets.mjs                        # the live programme
 *   node scripts/gym-targets.mjs <path-to-program.json> # any candidate
 *
 * REWRITTEN 2026-09-01. The version this replaces graded FRACTIONAL sets against sixteen hand-tuned
 * per-muscle bands, and he was right to stop trusting it. Two things were wrong with it and they
 * compounded:
 *
 * 1. THE BANDS WERE TUNED TO THE PROGRAMME THEY JUDGED. The glute ceiling went from 29 to 42 because
 *    the gate flagged 36.5. The calf floor was 6 because 6 was "the lowest loaded volume in the live
 *    programme". Eleven boundaries were admitted unsourced inside the file itself. A band fitted to
 *    the thing it measures cannot fail, which is the circularity he caught in the exercise list a
 *    week earlier and which had simply moved house.
 *
 * 2. FRACTIONAL SETS LET A MUSCLE LOOK TRAINED ON NOTHING BUT ASSISTANCE. Erectors read 10.5
 *    fractional sets while ZERO exercises named them a prime mover. Nothing in the output separated
 *    that from a muscle being worked, and the 0.5 weight behind it is an assumption its own source
 *    flags: Pelland 2025 says the method "suffers from the assumption that all indirect training
 *    should be quantified as half a set".
 *
 * SO THE GATE NOW GRADES DIRECT SETS, and there is exactly one floor and one target, both quoted:
 *
 *   Iversen 2021, Sports Med 51(10):2079-2095, saved on disk:
 *   "Each muscle group should be trained with at least four sets per week, and preferably more if
 *    additional muscle mass is desired and the necessary additional time can be expended (>=10 sets)"
 *
 * FLAT ACROSS ALL SIXTEEN MUSCLES, on his ruling of 2026-09-01: "lets do full body flat".
 *
 * WHAT IT FAILS ON. A muscle below the floor of 4 direct sets. That is a muscle the programme claims
 * to train and does not. Being below the TARGET of 10 is printed and never failed, because 4 is what
 * the source calls a requirement and 10 is what it calls preferable.
 *
 * FRACTIONAL IS STILL PRINTED, in its own column, because assistance is real and a row where direct
 * and fractional diverge wildly is worth seeing. It is never gated, and the header says why.
 */
import { readFileSync } from 'node:fs';
import { computeCoverage } from '../src/lib/gym/coverage.mts';

const programPath = process.argv[2] || 'content/gym/program.json';
const program = JSON.parse(readFileSync(programPath, 'utf8'));
const cat = JSON.parse(readFileSync('content/gym/movements.json', 'utf8'));
const targets = JSON.parse(readFileSync('content/gym/targets.json', 'utf8'));

/* THE TARGETS FILE IS CHECKED AGAINST THE CATALOGUE BEFORE ANYTHING IS GRADED, both directions.
 * Its first version reported `abductors` and `obliques` at ZERO and called both a training gap;
 * neither is a muscle movements.json defines. A target naming a muscle the catalogue lacks grades
 * nothing, and a catalogue muscle with no target is one the programme has no opinion about. */
const catKeys = new Set(Object.keys(cat.muscles));
const targetKeys = new Set(Object.keys(targets.muscles));
const unknown = [...targetKeys].filter((m) => !catKeys.has(m));
const ungraded = [...catKeys].filter((m) => !targetKeys.has(m));
if (unknown.length || ungraded.length) {
  if (unknown.length) console.log(`targets.json names muscles the catalogue lacks: ${unknown.join(', ')}`);
  if (ungraded.length) console.log(`catalogue muscles with no target: ${ungraded.join(', ')}`);
  console.log('\nRED. Fix content/gym/targets.json before any programme is graded against it.');
  process.exit(1);
}

/* EVERY ATTRIBUTION MUST BE ANATOMY, and this check is the one that stops the whole class of failure
 * coming back. Until 2026-09-01 seven groups claimed `evidence` for a muscle list, every one of them
 * resting on EMG or on a paper about something else, and coverage.mts only ever looked for the
 * literal string "unsourced": 68 of 110 variants counted as fully valid. A muscle list is anatomy or
 * it is nothing. `evidence` stays available for dose, order and frequency claims. */
const badTier = [];
for (const [k, g] of Object.entries(cat.movements)) {
  if (g.confidence !== 'anatomy') badTier.push(`${k} (${g.confidence})`);
  if (!g.jointAction) badTier.push(`${k} (no jointAction stated)`);
  for (const v of g.variants) {
    if (v.confidence !== undefined) badTier.push(`${k}/${v.id} carries a variant-level confidence tag`);
  }
}
if (badTier.length) {
  console.log('MUSCLE ATTRIBUTION IS ANATOMY, and these do not say so:');
  for (const b of badTier) console.log(`  ${b}`);
  console.log('');
  console.log('Every group needs confidence "anatomy" and a jointAction naming what the exercise does.');
  console.log('If you want to claim a trial finding, it belongs on dose or selection, not on a muscle list.');
  console.log('\nRED. See the legend at the top of content/gym/movements.json.');
  process.exit(1);
}

const cov = computeCoverage(program, cat);
const frac = new Map(cov.perMuscle.map((m) => [m.muscle, m.sets]));
const loaded = new Map(cov.perMuscle.map((m) => [m.muscle, m.loadedSets]));

/* DIRECT: sets where this muscle is a prime mover. The number the gate is about. */
const direct = new Map(cov.perMuscle.map((m) => [
  m.muscle,
  (m.byDayDetail ?? []).flat().filter((e) => e.primary).reduce((a, e) => a + (e.rawSets ?? e.sets ?? 0), 0),
]));
/* SLOTS: how many separate appearances, which is a different question from how many sets. He asked
 * it directly on 2026-09-01: triceps appeared once a week while calves had three slots. */
const slots = new Map(cov.perMuscle.map((m) => [
  m.muscle, (m.byDayDetail ?? []).flat().filter((e) => e.primary).length,
]));
const label = (m) => cat.muscles[m] ?? m;

const FLOOR = targets.floor;
const TARGET = targets.target;

console.log(`${programPath}`);
console.log(`Unit: ${targets.unit}`);
console.log('');
console.log(`FLOOR ${FLOOR}, TARGET ${TARGET}, flat across all ${targetKeys.size} muscles. Both quoted from Iversen 2021:`);
console.log(`  ${targets.floorSource}`);
console.log(`  ${targets.targetSource}`);
console.log('');
console.log('  muscle'.padEnd(28) + 'DIRECT'.padStart(8) + 'slots'.padStart(7) + 'fract'.padStart(8) + 'loaded'.padStart(8) + '   verdict');
console.log('  ' + '-'.repeat(76));

const below = [];
const under = [];
const rows = [...targetKeys].sort((a, b) => (direct.get(b) ?? 0) - (direct.get(a) ?? 0));
for (const m of rows) {
  const d = direct.get(m) ?? 0;
  let verdict = 'ok';
  if (d < FLOOR) { verdict = `BELOW FLOOR by ${FLOOR - d}`; below.push({ m, d }); }
  else if (d < TARGET) { verdict = `under target by ${TARGET - d}`; under.push({ m, d }); }
  console.log('  ' + label(m).padEnd(26) + String(d).padStart(8) + String(slots.get(m) ?? 0).padStart(7)
    + String(frac.get(m) ?? 0).padStart(8) + String(loaded.get(m) ?? 0).padStart(8) + `   ${verdict}`);
}

console.log('');
console.log('DIRECT is the graded column. FRACT adds 0.5 for every assisting muscle and is NEVER gated:');
console.log('its own source calls that weight an assumption, and a muscle can read a healthy fractional');
console.log('number on nothing but other lifts\' assistance. Erectors did, at 10.5 with zero direct sets.');

if (under.length) {
  console.log('');
  console.log(`${under.length} muscle(s) clear the floor of ${FLOOR} but sit under the target of ${TARGET}:`);
  console.log(`  ${under.map((u) => `${label(u.m)} ${u.d}`).join(', ')}`);
  console.log(`Not a failure. ${FLOOR} is what the source requires; ${TARGET} is what it calls preferable.`);
}

console.log('');
console.log('-'.repeat(78));
if (!below.length) {
  console.log(`GREEN. Every muscle gets at least ${FLOOR} direct sets a week.`);
  process.exit(0);
}
console.log(`${below.length} muscle(s) BELOW THE FLOOR of ${FLOOR} direct sets a week:\n`);
for (const b of below) {
  const f = frac.get(b.m) ?? 0;
  console.log(`  ${label(b.m)}: ${b.d} direct set(s), and ${f} fractional.`);
  if (f >= FLOOR) {
    console.log(`     It clears the floor on FRACTIONAL sets and fails on direct, which is exactly the`);
    console.log(`     case the old gate could not see: ${f} looks fine and is all assistance.`);
  }
  console.log('');
}
console.log('Give the muscle an exercise that names it a prime mover, or drop it from targets.json and');
console.log('say in the same commit why this programme has no opinion about it.');
process.exit(1);
