#!/usr/bin/env node
/**
 * IS THE PRIORITY PATTERN GETTING A STRENGTH DOSE, per lift, against Pelland's Table 4.
 *
 *   node scripts/gym-strength.mjs                        # the live programme
 *   node scripts/gym-strength.mjs <path-to-program.json> # any candidate
 *
 * WHY THIS EXISTS, and it is the largest single hole three adversarial reviews found on 2026-08-31.
 *
 * `content/gym/targets.json` grades per-muscle fractional sets against Pelland's **Table 3**, which
 * is HYPERTROPHY, on a scale of 4 to 42. The project's stated purpose is C2: *"lower body strength is
 * what the project is for. Everything else is secondary."* Strength is **Table 4**, denominated per
 * assessed EXERCISE rather than per muscle, on a scale of 1 to 5+. Those are not interchangeable and
 * the dose gate treated them as if they were.
 *
 * WHAT THAT COST. Graded only by the hypertrophy gate, the 2026-08-31 candidate printed GREEN while
 * carrying the back squat at **28.5** fractional strength sets against the live programme's 19.5.
 * Table 4 stops finding detectable increments at about 4. The gate certified a 46% regression on the
 * one axis the project exists for, and nothing anywhere read `STRENGTH_TIERS`, which has sat computed
 * and unused in `coverage.mts` since it was written.
 *
 * AND THE QUESTION WAS ASSIGNED, NOT MISSED. `HealthOS/knowledge/REDESIGN-BRIEF-2026-08-30.md`, lines
 * 76 to 78: *"Whether per-muscle fractional sets is even the right instrument for a strength-priority
 * programme is an open question and part of this brief."* The hypertrophy instrument was built without
 * answering it. This file is the answer's other half: per-muscle bands say no muscle is neglected;
 * this says whether the priority is getting a strength stimulus. Neither covers the other.
 *
 * WHAT IT DOES NOT DO, deliberately.
 *
 * IT DOES NOT FAIL ON BEING PAST THE TOP TIER. Pelland 4.3, verbatim from the local full text:
 * *"additional sets beyond this point may produce additional strength gains, albeit less than the
 * SDES, prior to the functional plateau."* Past 4 is a PRICE, not a wall. A fabricated ceiling in
 * this repo was already used once to refuse 25 to 43 legal partner exercises per block, and
 * re-committing that error is a worse outcome than the one this file exists to catch. So being past
 * the tier is REPORTED with its cost, and only two things actually fail:
 *
 *   1. A priority lift BELOW Table 4's minimum effective dose of 1 fractional set. That is a lift
 *      the programme claims to train and does not.
 *   2. A REGRESSION against content/gym/strength-baseline.json: any priority lift whose fractional
 *      volume has moved further past the point of detectable increments than the accepted baseline.
 *      This is the check that would have caught the candidate. A number that is bad and stable is a
 *      judgement someone accepted; a number moving in the wrong direction is a new decision, and it
 *      is the movement that needs a person to look.
 *
 * THE BASELINE IS DATED AND ACCEPTED, exactly like content/gym/coverage-baseline.json, and for the
 * reason that file states: a gate expected to fail cannot signal a regression.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { computeCoverage, STRENGTH_TIERS, tierFor, tierBand } from '../src/lib/gym/coverage.mts';

const argv = process.argv.slice(2);
const accept = argv.includes('--accept');
const programPath = argv.find((a) => !a.startsWith('--')) || 'content/gym/program.json';
const BASELINE = 'content/gym/strength-baseline.json';

const program = JSON.parse(readFileSync(programPath, 'utf8'));
const cat = JSON.parse(readFileSync('content/gym/movements.json', 'utf8'));
const cov = computeCoverage(program, cat);

/* THE PRIORITY PATTERNS, from C2. A lift counts as priority when its PRIMARY muscles are lower body.
 * Not by name, and not by which day it sits on: day labels have been wrong in this programme before
 * (a "lower" day carrying a third of the week's upper-body work), and a name-based list goes stale
 * the moment an exercise is swapped. */
const LOWER = new Set(['glutes', 'quads', 'hamstrings', 'adductors', 'calves']);
const byId = new Map();
for (const [, m] of Object.entries(cat.movements)) {
  for (const v of m.variants) {
    const f = { ...v, primary: v.primary ?? m.primary };
    byId.set(v.id, f);
    for (const a of v.aliases ?? []) byId.set(a, f);
  }
}

/* Pelland 4.3: increments in the SDES were observed up to approximately 4 fractional weekly sets. */
const DETECTABLE_TOP = 4;
const MIN_DOSE = 1;

const rows = cov.perLift
  .filter((l) => {
    const k = byId.get(l.id);
    return k && k.primary.some((m) => LOWER.has(m)) && l.loadable;
  })
  .map((l) => ({
    id: l.id, name: l.name,
    direct: l.sets, frac: l.fractionalSets, freq: l.fractionalFrequency,
    tier: l.tier.tier, band: tierBand(STRENGTH_TIERS, l.tier),
    past: Math.max(0, l.fractionalSets - DETECTABLE_TOP),
  }))
  .sort((a, b) => b.frac - a.frac);

console.log(`${programPath}`);
console.log('Pelland Table 4, STRENGTH, per assessed exercise. Loadable lower-body-primary lifts only.');
console.log('Increments in the SDES were observed up to ~4 fractional weekly sets. Past that is a price, not a wall.\n');
console.log('lift'.padEnd(26) + 'direct'.padStart(8) + 'FRACTIONAL'.padStart(12) + 'freq'.padStart(7) + '  tier'.padEnd(16) + 'past ~4'.padStart(9));
console.log('-'.repeat(80));
for (const r of rows) {
  console.log(r.name.padEnd(26) + String(r.direct).padStart(8) + String(r.frac).padStart(12)
    + String(r.freq).padStart(7) + `  ${r.tier} (${r.band})`.padEnd(16)
    + (r.past ? `+${r.past.toFixed(1)}` : '-').padStart(9));
}

const totalPast = rows.reduce((a, r) => a + r.past, 0);
console.log('');
console.log(`${rows.length} priority lift(s). Sum of volume past the point of detectable increments: ${totalPast.toFixed(1)} fractional sets.`);
console.log('Pelland, section 4.3: "additional sets beyond this point may produce additional strength');
console.log('gains, albeit less than the SDES, prior to the functional plateau." So this is a cost, not a fault.');

if (accept) {
  const snap = {
    $comment: [
      'ACCEPTED STRENGTH STATE, per lift, in Pelland Table 4 fractional sets.',
      'Same contract as coverage-baseline.json: a gate expected to fail cannot signal a regression, so',
      'this records what was accepted and gym-strength.mjs fails only on movement away from it.',
      `Accepted from ${programPath}.`,
    ],
    acceptedAt: new Date().toISOString().slice(0, 10),
    fromProgram: programPath,
    detectableTop: DETECTABLE_TOP,
    perLift: Object.fromEntries(rows.map((r) => [r.id, r.frac])),
    sumPastDetectable: Number(totalPast.toFixed(1)),
  };
  writeFileSync(BASELINE, JSON.stringify(snap, null, 2) + '\n');
  console.log(`\nwrote ${BASELINE}, ${rows.length} lifts, sum past ~4 = ${totalPast.toFixed(1)}`);
  process.exit(0);
}

const findings = [];

/* FAULT 1: a priority lift below the minimum effective dose. */
for (const r of rows) {
  if (r.frac < MIN_DOSE) {
    findings.push(`${r.name} is at ${r.frac} fractional sets, below Table 4's minimum effective dose of ${MIN_DOSE}. `
      + 'The programme lists this lift and does not train it.');
  }
}

/* FAULT 2: a regression against the accepted baseline. */
if (!existsSync(BASELINE)) {
  console.log('');
  console.log(`No ${BASELINE} yet. Run with --accept to record the current state as accepted.`);
} else {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  console.log('');
  console.log(`AGAINST THE ACCEPTED BASELINE, ${BASELINE}, accepted ${base.acceptedAt} from ${base.fromProgram}`);
  console.log('-'.repeat(80));
  let moved = 0;
  for (const r of rows) {
    const was = base.perLift[r.id];
    if (was === undefined) {
      console.log(`  NEW   ${r.name.padEnd(26)} ${r.frac} fractional sets, no baseline`);
      continue;
    }
    const d = r.frac - was;
    if (Math.abs(d) < 0.01) continue;
    moved++;
    console.log(`  ${d > 0 ? 'UP  ' : 'DOWN'}  ${r.name.padEnd(26)} ${was} -> ${r.frac}  (${d > 0 ? '+' : ''}${d.toFixed(1)})`);
    /* ONLY UPWARD MOVEMENT PAST THE DETECTABLE POINT IS A FAULT. Moving DOWN toward 4 is the
       direction the evidence points, so it is reported and never failed. */
    if (d > 0 && r.frac > DETECTABLE_TOP) {
      findings.push(`${r.name} moved from ${was} to ${r.frac} fractional sets, further past the point where `
        + `Pelland stops finding detectable strength increments (~${DETECTABLE_TOP}). `
        + 'For a lift in the priority pattern that is more volume buying less strength, on a fixed clock.');
    }
  }
  if (!moved) console.log('  No priority lift changed its fractional volume since the baseline was accepted.');
  const dSum = Number(totalPast.toFixed(1)) - base.sumPastDetectable;
  if (Math.abs(dSum) >= 0.1) {
    console.log(`  Sum past ~4: ${base.sumPastDetectable} -> ${totalPast.toFixed(1)} (${dSum > 0 ? '+' : ''}${dSum.toFixed(1)})`);
  }
}

console.log('');
console.log('-'.repeat(80));
if (!findings.length) {
  console.log('GREEN. No priority lift is under-dosed, and none has moved further from the strength optimum.');
  process.exit(0);
}
console.log(`${findings.length} finding(s):\n`);
for (const f of findings) console.log(`  ${f}\n`);
console.log('Fix the programme, or accept the new state with --accept and say in the commit why more');
console.log('volume on an already-saturated lift is the right call. The one thing this cannot check is');
console.log('an --accept that should not have happened.');
process.exit(1);
