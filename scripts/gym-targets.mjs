#!/usr/bin/env node
/**
 * DOES THE PROGRAMME DELIVER THE DOSE IT IS SUPPOSED TO, per muscle.
 *
 *   node scripts/gym-targets.mjs                       # the live programme
 *   node scripts/gym-targets.mjs <path-to-program.json> # any candidate
 *
 * Exits non-zero when a muscle is outside its band in content/gym/targets.json, or when one region's
 * spread is wider than that region declares.
 *
 * WHY THIS EXISTS. His words, 2026-08-31: "why are there so many shoudl presses and not so much
 * chest presses, seemps like for upper you are just dding set ranomdly regardless of the muscles,
 * wonder if same is happening anywhere else, doesnt make sense".
 *
 * He was right, and the answer to "anywhere else" was yes. Measured across the live programme and two
 * candidate weeks: the three delt heads together carry 4.9, 5.0 and 5.5 times the chest, with CHEST
 * BELOW EVERY INDIVIDUAL DELT HEAD, and abductors sit at ZERO in all three while the live programme's
 * own reasoning calls frontal-plane hip work injury insurance for the running.
 *
 * WHAT scripts/gym-coverage.mjs COULD NOT SEE, and why this is a separate gate. That script grades
 * every muscle against Pelland's tiers and asks exactly one question of each: is it below the minimum
 * effective dose. Everything above 4 passes. So a week with chest at 6 and side delts at 12 is green
 * on every check in this repo, because both numbers are individually fine and nothing compares them.
 * A tool that prints a number for every muscle and holds an opinion about none of them cannot catch a
 * distribution error, and a distribution error is what a programme IS.
 *
 * THE ORDER OF OPERATIONS IS THE REAL FIX. Exercises were being chosen first, for what the pairing
 * rules allow, and the dose was whatever fell out. Station-less dumbbell lifts are overwhelmingly
 * shoulder exercises because a chest press needs a bench, so the EQUIPMENT was picking the dose. With
 * this file the target is stated first and the exercise selection has to satisfy it.
 *
 * IT READS THE SAME ARITHMETIC AS EVERYTHING ELSE. `computeCoverage` in src/lib/gym/coverage.mts, so
 * this cannot disagree with /health or with gym-coverage.mjs about what a week contains. It uses
 * `loadedSets`, which excludes jumps, carries and holds, because Pelland's regression is fitted on
 * resistance-training sets and a 30-second carry is not one.
 */
import { readFileSync } from 'node:fs';
import { computeCoverage } from '../src/lib/gym/coverage.mts';

const programPath = process.argv[2] || 'content/gym/program.json';
const program = JSON.parse(readFileSync(programPath, 'utf8'));
const cat = JSON.parse(readFileSync('content/gym/movements.json', 'utf8'));
const targets = JSON.parse(readFileSync('content/gym/targets.json', 'utf8'));

/* THE TARGETS FILE IS CHECKED AGAINST THE CATALOGUE BEFORE ANYTHING IS GRADED.
 *
 * Its first run reported `abductors` and `obliques` at ZERO and called both a training gap. Neither
 * is a muscle movements.json defines: hip abduction is filed under `glutes` and abs and obliques are
 * one key. So the gate invented two findings out of two names that resolve to nothing, which is the
 * same defect as a document citing a source that is not on disk.
 *
 * Both directions fail. A target naming a muscle the catalogue lacks grades nothing. A catalogue
 * muscle with no target is a muscle this programme has no opinion about, which is how chest ended up
 * below every delt head in the first place. */
const catKeys = new Set(Object.keys(cat.muscles));
const targetKeys = new Set(Object.keys(targets.muscles));
const unknown = [...targetKeys].filter((m) => !catKeys.has(m));
const ungraded = [...catKeys].filter((m) => !targetKeys.has(m));
if (unknown.length || ungraded.length) {
  if (unknown.length) {
    console.log('targets.json names muscles movements.json does not define, so these bands grade nothing:');
    for (const m of unknown) console.log(`  ${m}`);
  }
  if (ungraded.length) {
    console.log('movements.json defines muscles targets.json has no band for, so nothing checks their dose:');
    for (const m of ungraded) console.log(`  ${m}  (${cat.muscles[m]})`);
  }
  console.log('');
  console.log('RED. Fix content/gym/targets.json before any programme is graded against it.');
  process.exit(1);
}

const cov = computeCoverage(program, cat);
const got = new Map(cov.perMuscle.map((m) => [m.muscle, m.loadedSets]));
const label = (m) => cat.muscles[m] ?? m;

const findings = [];
const byRegion = {};

console.log(`${programPath}`);
console.log(`Target bands from content/gym/targets.json. Unit: ${targets.unit}.\n`);

for (const [region, meta] of Object.entries(targets.regions)) {
  const muscles = Object.entries(targets.muscles).filter(([, t]) => t.region === region);
  console.log(`${meta.label.toUpperCase()}`);
  console.log('  muscle'.padEnd(28) + 'band'.padStart(9) + 'actual'.padStart(9) + '   verdict');
  const vals = [];
  for (const [m, t] of muscles) {
    /* A muscle the catalogue never attributes is 0, not absent. That distinction is the abductor
       finding: nothing was wrong with the arithmetic, the programme simply contained no exercise
       that trains them, and a report keyed on what the programme HAS would never have printed it. */
    const n = got.get(m) ?? 0;
    vals.push({ m, n });
    let verdict = 'ok';
    if (n < t.min) { verdict = `UNDER by ${(t.min - n).toFixed(1)}`; findings.push({ region, m, n, t, kind: 'under' }); }
    else if (n > t.max) { verdict = `OVER by ${(n - t.max).toFixed(1)}`; findings.push({ region, m, n, t, kind: 'over' }); }
    console.log('  ' + label(m).padEnd(26) + `${t.min}-${t.max}`.padStart(9) + String(n).padStart(9) + `   ${verdict}`);
  }
  const nz = vals.filter((v) => v.n > 0).map((v) => v.n);
  const mn = nz.length ? Math.min(...nz) : 0;
  const mx = vals.length ? Math.max(...vals.map((v) => v.n)) : 0;
  const spread = mn > 0 ? mx / mn : Infinity;
  const cap = meta.maxSpreadWithinRegion;
  byRegion[region] = { spread, cap, mn, mx };
  const bad = spread > cap;
  console.log(`  spread ${mn > 0 ? spread.toFixed(1) + 'x' : 'infinite (a muscle at zero)'} against a cap of ${cap}x  ${bad ? '<<< TOO WIDE' : 'ok'}`);
  if (bad) {
    const lo = vals.filter((v) => v.n > 0).sort((a, b) => a.n - b.n)[0];
    const hi = vals.sort((a, b) => b.n - a.n)[0];
    findings.push({ region, kind: 'spread', spread, cap, lo, hi, note: meta.spreadNote });
  }
  console.log('');
}

if (!findings.length) {
  console.log('-'.repeat(70));
  console.log('GREEN. Every muscle is inside its band and every region inside its spread cap.');
  process.exit(0);
}

console.log('-'.repeat(70));
console.log(`${findings.length} finding(s):\n`);
for (const f of findings) {
  if (f.kind === 'spread') {
    console.log(`  ${f.region.toUpperCase()} SPREAD ${f.spread.toFixed(1)}x, cap ${f.cap}x.`);
    console.log(`     ${label(f.hi.m)} at ${f.hi.n} against ${label(f.lo.m)} at ${f.lo.n}.`);
    if (f.note) console.log(`     ${f.note}`);
  } else {
    console.log(`  ${label(f.m)} is ${f.kind.toUpperCase()} at ${f.n}, band ${f.t.min}-${f.t.max}.`);
    console.log(`     ${f.t.why}`);
  }
  console.log('');
}
console.log('Fix the PROGRAMME, or change the band in content/gym/targets.json and write down why.');
console.log('Changing the band to make a programme pass is the one move this gate cannot stop, so');
console.log('the reason goes in the file where the next reader will see it beside the number.');
process.exit(1);
