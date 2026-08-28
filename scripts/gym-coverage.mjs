#!/usr/bin/env node
/**
 * Prints what the programme actually delivers, per muscle and per lift, against published
 * dose-response landmarks, and gates a push on it.
 *
 *   node scripts/gym-coverage.mjs                # the whole week, against the accepted baseline
 *   node scripts/gym-coverage.mjs --day monday
 *   node scripts/gym-coverage.mjs --json
 *   node scripts/gym-coverage.mjs --accept       # re-record the baseline after an improvement
 *   node scripts/gym-coverage.mjs --accept --accept-regression   # and after a deliberate one
 *
 * THE ARITHMETIC IS NOT IN THIS FILE. It is src/lib/gym/coverage.mts, because /health renders the
 * same numbers and two implementations of one computation drift silently. This file reads the JSON,
 * prints it, and compares against the accepted baseline.
 *
 * WHY THIS EXISTS. He asked, 2026-08-27: "I want actual sources for each single exercise, reasoning
 * why that day is set up that way, the pairings, why it makes sense, and how each day contributes
 * to the goal and how both days on each part and the 4 day as a whole achieve everything that we
 * want."
 *
 * Nothing could answer that, because the answer is arithmetic over data that did not exist. The
 * alternative is a paragraph asserting the week is balanced, which is exactly how the programme
 * arrived at 12 weekly sets of rear delts against 4 of back squat with a `why` on every block.
 *
 * A RULE THAT DOES NOT EXECUTE IS DECORATION (HOODII/CLAUDE.md). So the balance of this programme is
 * a computation with a non-zero exit code, not a claim in a comment.
 *
 * AND THE EXIT CODE MEANS SOMETHING NOW, which it did not until 2026-08-27. It was 1 on every run,
 * by design, because 11 of 16 muscles sit past the efficient zone and four exercises carry no
 * source. A light that is always red is not a light. It compares against
 * content/gym/coverage-baseline.json instead: an accepted, dated snapshot of the three states
 * nobody argues should be tolerated. See the note above CoverageState in coverage.mts for why those
 * three and not past-efficient.
 *
 * ACCEPTING A CHANGE IS A DELIBERATE, GREPPABLE GESTURE. `--accept` re-stamps the baseline and
 * refuses to run while a regression is present unless `--accept-regression` is also passed, so
 * silencing a new below-minimum muscle cannot happen by reflex or by copying the command above.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeCoverage, coverageState, diffCoverage, MIN_EFFECTIVE_DOSE, EFFICIENT_ZONE_TOP } from '../src/lib/gym/coverage.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));

const program = read('content/gym/program.json');
// The movement catalogue, one entry per JOB and every way to do it in his gym. muscles.json was the
// first version of this and was deleted on 2026-08-27: it listed only the 34 exercises the
// programme already contained, which made every completeness question circular. See
// gym-catalogue.mjs.
const cat = read('content/gym/movements.json');

const BASELINE_PATH = 'content/gym/coverage-baseline.json';

const args = process.argv.slice(2);
const onlyDay = args.includes('--day') ? args[args.indexOf('--day') + 1] : null;
const asJson = args.includes('--json');
const accepting = args.includes('--accept');
const acceptingRegression = args.includes('--accept-regression');

const coverage = computeCoverage(program, cat, { onlyDay });

if (coverage.missing.length) {
  console.error('content/gym/movements.json does not describe these, so nothing below would be true:');
  for (const m of coverage.missing) console.error('  ' + m);
  process.exit(2);
}

const current = coverageState(coverage);
const baselineFile = read(BASELINE_PATH);
const diff = diffCoverage(baselineFile, current);

if (asJson) {
  console.log(JSON.stringify({ coverage, current, diff }, null, 2));
  process.exit(0);
}

/* ---- report ---- */

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const rule = (c = '-') => console.log(c.repeat(78));

console.log('\nWHAT THE WEEK ACTUALLY DELIVERS');
console.log('Pelland 2026, Sports Med 56(2):481-505. Fractional sets: primary 1.0, synergist 0.5.');
rule('=');

console.log(`\nPER MUSCLE, for SIZE  (Table 3: minimum ${MIN_EFFECTIVE_DOSE}, efficient zone 5 to ${EFFICIENT_ZONE_TOP})\n`);
console.log(pad('muscle', 22) + padL('sets/wk', 9) + '  ' + pad('tier', 15) + 'per day (Lower A / Upper A / Lower B / Upper B)');
rule();
for (const m of coverage.perMuscle) {
  const byDay = m.byDay.map((v) => (v ? String(v) : '.')).join(' / ');
  const flag = m.belowMinimum ? ' <<' : m.pastEfficient ? ' >>' : '';
  console.log(pad(m.label, 22) + padL(m.sets, 9) + '  ' + pad(m.tier.tier, 15) + byDay + flag);
}
console.log(`\n  <<  below the minimum effective dose of ${MIN_EFFECTIVE_DOSE} fractional sets`);
console.log('  >>  past the efficient zone: every further set buys less than the one before');

console.log('\n\nPER LIFT, for STRENGTH  (Table 4: minimum 1, and past 5 extra sets stop paying)\n');
console.log(pad('lift', 30) + padL('sets/wk', 9) + padL('days', 6) + '  ' + pad('tier', 15) + 'loadable');
rule();
for (const v of coverage.perLift) {
  console.log(pad(v.name, 30) + padL(v.sets, 9) + padL(v.days.length, 6) + '  ' + pad(v.tier.tier, 15) + (v.loadable ? 'yes' : 'NO, cannot progress'));
}

console.log('\n\nPAIRINGS THAT COST THE LIFT IN FRONT OF THEM');
console.log('Zhang 2025, Sports Med 55(4):953-975: "similar biomechanical supersets led to');
console.log('significantly less volume load than traditional sets".');
rule();
if (!coverage.redundantPairs.length) {
  console.log('none.');
} else {
  const strictPairs = coverage.redundantPairs.filter((p) => p.strict);
  const loosePairs = coverage.redundantPairs.filter((p) => !p.strict);

  console.log('\nSTRICT, the partner\'s main muscle is also the lead lift\'s main muscle:');
  if (!strictPairs.length) console.log('  none.');
  for (const p of strictPairs) {
    console.log(`  ${pad(p.day, 9)} ${pad(p.lead + '  +  ' + p.partner, 46)} both: ${p.shared.join(', ')}`);
  }

  console.log('\nLOOSE, the partner\'s main muscle is a synergist of the lead lift:');
  if (!loosePairs.length) console.log('  none.');
  for (const p of loosePairs) {
    console.log(`  ${pad(p.day, 9)} ${pad(p.lead + '  +  ' + p.partner, 46)} lead also uses: ${p.alsoShared.join(', ')}`);
  }

  const strictCost = strictPairs.reduce((a, p) => a + p.sets, 0);
  const totalCost = coverage.redundantPairs.reduce((a, p) => a + p.sets, 0);
  console.log(`\n  ${strictPairs.length} strict (${strictCost} sets/wk), ${loosePairs.length} loose (${totalCost - strictCost} sets/wk).`);
  console.log('  Only the strict ones are beyond argument. The loose ones are the judgement call,');
  console.log('  and they are listed so the call is visible rather than buried in the catalogue.');
}

if (coverage.unloadableInMain.length) {
  console.log('\n\nUNLOADABLE EXERCISES IN A "MAIN" BLOCK');
  console.log('No weight column, so the progression ladder can never move them.');
  rule();
  for (const u of coverage.unloadableInMain) console.log(`  ${pad(u.day, 9)} ${pad(u.name, 30)} ${u.sets} sets, in "${u.block}"`);
}

if (coverage.unsourced.length) {
  console.log('\n\nEXERCISES WITH NO SOURCE AT ALL');
  rule();
  const seen = new Set();
  for (const s of coverage.unsourced) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    console.log(`  ${pad(s.name, 26)} ${s.why.split('.')[0]}.`);
  }
}

/* ---- against the accepted baseline ---- */

console.log('\n\nAGAINST THE ACCEPTED BASELINE');
console.log(`${BASELINE_PATH}, accepted ${baselineFile.accepted}: ${baselineFile.acceptedBecause}`);
rule();

if (diff.muscleMoves.length) {
  console.log('\nWeekly sets that moved since then:');
  for (const m of diff.muscleMoves) {
    const arrow = m.to > m.from ? 'up' : 'down';
    console.log(`  ${pad(coverage.muscleLabels[m.muscle] ?? m.muscle, 30)} ${padL(m.from, 6)}  ->  ${padL(m.to, 6)}   ${arrow}`);
  }
} else {
  console.log('\nNo muscle changed its weekly set count since the baseline was accepted.');
}

if (diff.fixed.length) {
  console.log('\nFIXED since the baseline, so the baseline is now out of date:');
  for (const f of diff.fixed) console.log(`  ${pad(f.list, 14)} ${f.item}`);
}

if (diff.regressions.length) {
  console.log('\nREGRESSIONS, and each is a state nobody has argued should be tolerated:');
  for (const r of diff.regressions) console.log(`  ${pad(r.list, 14)} ${r.item}`);
}

/* ---- accept, or judge ---- */

if (accepting) {
  if (diff.regressions.length && !acceptingRegression) {
    console.log('');
    rule('=');
    console.log(`REFUSED. ${diff.regressions.length} regression(s) above. Fix them, or re-run with`);
    console.log('--accept --accept-regression to record them as accepted on purpose.');
    process.exit(1);
  }
  /* LOCAL DATE, NOT toISOString(). That method is UTC, so anything stamped after 18:00 in Calgary
   * gets tomorrow's date, and the first run of this code proved it by writing 2026-08-28 on the
   * evening of 2026-08-27. Exactly the fault that put four date columns a day apart across the swim
   * tables (see SWIM_LOCAL_DATE in src/lib/swim/db.ts), reproduced in a one-line convenience. */
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const next = {
    ...baselineFile,
    accepted: stamp,
    ...current,
  };
  writeFileSync(resolve(root, BASELINE_PATH), JSON.stringify(next, null, 2) + '\n');
  console.log('');
  rule('=');
  console.log(`RECORDED. ${BASELINE_PATH} now reflects the week as it stands. Read the diff in git`);
  console.log('before committing it: that diff is the whole record of what was accepted and when.');
  process.exit(0);
}

console.log('');
rule('=');
console.log(`${coverage.totals.below} muscle(s) below the minimum dose, ${coverage.totals.pastEfficient} past the efficient zone, ` +
            `${coverage.redundantPairs.length} redundant pairing(s), ${coverage.totals.unsourcedNames} exercise(s) with no source.`);

if (diff.regressions.length) {
  console.log(`RED. ${diff.regressions.length} regression(s) against the baseline. Nothing here is new information:`);
  console.log('each one was absent when the baseline was accepted and is present now.');
  process.exit(1);
}
if (diff.fixed.length) {
  console.log(`STALE. ${diff.fixed.length} baseline entr(y/ies) no longer apply. Re-stamp with --accept, or the`);
  console.log('baseline keeps tolerating a state that no longer exists and would not catch its return.');
  process.exit(1);
}
console.log('MATCHES THE BASELINE. Past-efficient is reported, not gated: it is diminishing returns,');
console.log('not harm, and 11 muscles have sat there since the week was derived from the goal.');
process.exit(0);
