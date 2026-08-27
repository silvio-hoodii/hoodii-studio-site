#!/usr/bin/env node
/**
 * Computes what the programme actually delivers, per muscle and per lift, against published
 * dose-response landmarks. Prints a report; exits non-zero if anything is below the minimum
 * effective dose or if a pairing is redundant.
 *
 *   node scripts/gym-coverage.mjs            # the whole week
 *   node scripts/gym-coverage.mjs --day monday
 *   node scripts/gym-coverage.mjs --json
 *
 * WHY THIS EXISTS. He asked, 2026-08-27: "I want actual sources for each single exercise, reasoning
 * why that day is set up that way, the pairings, why it makes sense, and how each day contributes
 * to the goal and how both days on each part and the 4 day as a whole achieve everything that we
 * want."
 *
 * Nothing could answer that, because the answer is arithmetic over data that did not exist. It does
 * now: content/gym/muscles.json says what each exercise trains, and this file does the counting.
 * The alternative is a paragraph asserting the week is balanced, which is exactly how the programme
 * arrived at 12 weekly sets of rear delts against 4 of back squat with a `why` on every block.
 *
 * A RULE THAT DOES NOT EXECUTE IS DECORATION (HOODII/CLAUDE.md). So the balance of this programme is
 * a computation with a non-zero exit code, not a claim in a comment.
 *
 * THE LANDMARKS ARE NOT OURS AND ARE NOT ADJUSTABLE HERE.
 *
 *   Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC. The Resistance Training Dose
 *   Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle
 *   Hypertrophy and Strength Gains. Sports Med. 2026;56(2):481-505. doi:10.1007/s40279-025-02344-w
 *   67 studies, 2,058 participants. Tables 3 and 4, quoted verbatim below.
 *
 * Its conclusion, verbatim, is why sets are counted in halves here: the dose-response relationships
 * "are best represented with the `fractional` quantification method, where indirect sets are counted
 * as half a set".
 *
 * TWO DENOMINATORS, AND CONFLATING THEM IS THE MISTAKE THIS FILE PREVENTS. Pelland's hypertrophy
 * tiers are per MUSCLE. Its strength tiers are per ASSESSED EXERCISE. A muscle can be well served
 * for size while the lift that trains it is under-dosed for strength, and vice versa. Both tables
 * are reported separately below and must never be added together.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'));

const program = read('content/gym/program.json');
// Reads the movement catalogue, flattened to one entry per variant. muscles.json was the first
// version of this and was deleted on 2026-08-27: it listed only the 34 exercises the programme
// already contained, which made every completeness question circular. See gym-catalogue.mjs.
const cat = read('content/gym/movements.json');
const map = { muscles: cat.muscles, exercises: {} };
for (const [mid, m] of Object.entries(cat.movements)) {
  for (const v of m.variants) {
    const flat = {
      ...v, movement: mid,
      primary: v.primary ?? m.primary,
      secondary: v.secondary ?? m.secondary,
      confidence: v.confidence ?? m.confidence,
      selection: v.note ?? m.note ?? '',
    };
    map.exercises[v.id] = flat;
    for (const a of v.aliases ?? []) map.exercises[a] = flat;
  }
}

const args = process.argv.slice(2);
const onlyDay = args.includes('--day') ? args[args.indexOf('--day') + 1] : null;
const asJson = args.includes('--json');

/* ---- Pelland 2026 Table 3, hypertrophy, fractional weekly sets PER MUSCLE ---- */
const HYPERTROPHY_TIERS = [
  { min: 0,  max: 3.99, tier: 'BELOW MINIMUM', note: 'under the minimum effective dose of 4' },
  { min: 4,  max: 4.99, tier: 'minimum',       note: 'sufficient to elicit detectable hypertrophy' },
  { min: 5,  max: 10,   tier: 'HIGHER EFF.',   note: '~6 more sets needed for the next detectable increment' },
  { min: 11, max: 18,   tier: 'intermediate',  note: '~8.5 more sets needed for the next increment' },
  { min: 19, max: 29,   tier: 'lower eff.',    note: '~10.75 more sets needed for the next increment' },
  { min: 30, max: 42,   tier: 'lowest eff.',   note: '~12.5 more sets needed for the next increment' },
  { min: 43, max: 1e9,  tier: 'unclear',       note: 'insufficient data, or potentially less hypertrophy' },
];

/* ---- Pelland 2026 Table 4, strength, fractional weekly sets PER ASSESSED EXERCISE ---- */
const STRENGTH_TIERS = [
  { min: 0, max: 0.99, tier: 'BELOW MINIMUM', note: 'under the minimum effective dose of 1' },
  { min: 1, max: 1.99, tier: 'minimum',       note: 'sufficient to elicit detectable strength gain' },
  { min: 2, max: 2.99, tier: 'HIGHER EFF.',   note: '~0.75 more sets for the next detectable gain' },
  { min: 3, max: 4,    tier: 'intermediate',  note: '~2.25 more sets for the next detectable gain' },
  { min: 5, max: 1e9,  tier: 'lower eff.',    note: 'additional sets do not consistently enhance strength > SDES' },
];

const tierFor = (tiers, n) => tiers.find((t) => n >= t.min && n <= t.max) ?? tiers[tiers.length - 1];

/* ---- walk the programme ---- */

const DAY_ORDER = ['monday', 'tuesday', 'thursday', 'friday'];
const days = program.days ?? program;

const missing = [];
const perMuscle = {};          // muscle -> fractional sets/week
const perMuscleByDay = {};     // day -> muscle -> fractional sets
const perExercise = {};        // exercise id -> { direct sets/week, days:Set }
const redundantPairs = [];
const unloadableWork = [];
const sourceVoids = [];

for (const dayKey of Object.keys(days)) {
  const day = days[dayKey];
  if (!day || !day.blocks) continue;
  if (onlyDay && dayKey !== onlyDay) continue;
  perMuscleByDay[dayKey] = {};

  for (const block of day.blocks) {
    const lead = block.exercises[0];
    const leadInfo = lead ? map.exercises[lead.id] : null;

    block.exercises.forEach((ex, idx) => {
      const info = map.exercises[ex.id];
      if (!info) { missing.push(`${dayKey}/${block.label}/${ex.id}`); return; }

      const sets = Number(ex.sets) || 0;

      for (const m of info.primary)   { perMuscle[m] = (perMuscle[m] ?? 0) + sets;       perMuscleByDay[dayKey][m] = (perMuscleByDay[dayKey][m] ?? 0) + sets; }
      for (const m of info.secondary) { perMuscle[m] = (perMuscle[m] ?? 0) + sets * 0.5; perMuscleByDay[dayKey][m] = (perMuscleByDay[dayKey][m] ?? 0) + sets * 0.5; }

      perExercise[ex.id] ??= { sets: 0, days: new Set(), name: ex.name, loadable: info.loadable, confidence: info.confidence };
      perExercise[ex.id].sets += sets;
      perExercise[ex.id].days.add(dayKey);

      // The Q4 rule, from Zhang 2025: a partner may not share a muscle with its lead lift.
      // "similar biomechanical supersets led to significantly less volume load than traditional sets".
      //
      // TWO STRICTNESSES, ON PURPOSE. Whether an overlap counts depends on judgement calls in
      // muscles.json (is a bent-over row's trunk brace "abs"?), and tuning those calls until the
      // count matches a number someone already had in mind is confirmation bias with extra steps.
      // So both are reported and neither is hidden: STRICT is primary against primary and is not
      // arguable; LOOSE also catches a partner whose primary muscle is a synergist of the lead,
      // which is where the judgement lives.
      if (idx > 0 && leadInfo) {
        const leadAll = [...leadInfo.primary, ...leadInfo.secondary];
        const strict = info.primary.filter((m) => leadInfo.primary.includes(m));
        const loose  = info.primary.filter((m) => leadAll.includes(m) && !strict.includes(m));
        if (strict.length || loose.length) {
          redundantPairs.push({
            day: dayKey, block: block.label, lead: lead.name, partner: ex.name,
            shared: strict, alsoShared: loose, strict: strict.length > 0, sets,
          });
        }
      }

      if (info.loadable === false && block.role === 'main') {
        unloadableWork.push({ day: dayKey, block: block.label, name: ex.name, sets });
      }
      if (info.confidence === 'unsourced') {
        sourceVoids.push({ day: dayKey, name: ex.name, why: info.selection });
      }
    });
  }
}

if (missing.length) {
  console.error('content/gym/movements.json does not describe these, so nothing below would be true:');
  for (const m of missing) console.error('  ' + m);
  process.exit(2);
}

/* ---- report ---- */

if (asJson) {
  console.log(JSON.stringify({ perMuscle, perMuscleByDay, perExercise: Object.fromEntries(Object.entries(perExercise).map(([k, v]) => [k, { ...v, days: [...v.days] }])), redundantPairs }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const rule = (c = '-') => console.log(c.repeat(78));

console.log('\nWHAT THE WEEK ACTUALLY DELIVERS');
console.log('Pelland 2026, Sports Med 56(2):481-505. Fractional sets: primary 1.0, synergist 0.5.');
rule('=');

console.log('\nPER MUSCLE, for SIZE  (Table 3: minimum 4, efficient zone 5 to 10)\n');
console.log(pad('muscle', 22) + padL('sets/wk', 9) + '  ' + pad('tier', 15) + 'per day (Lower A / Upper A / Lower B / Upper B)');
rule();

const sorted = Object.entries(perMuscle).sort((a, b) => b[1] - a[1]);
let below = 0, past = 0;
for (const [m, n] of sorted) {
  const t = tierFor(HYPERTROPHY_TIERS, n);
  if (t.tier === 'BELOW MINIMUM') below++;
  if (n > 10) past++;
  const byDay = DAY_ORDER.map((d) => {
    const v = perMuscleByDay[d]?.[m] ?? 0;
    return v ? String(v) : '.';
  }).join(' / ');
  const flag = t.tier === 'BELOW MINIMUM' ? ' <<' : n > 10 ? ' >>' : '';
  console.log(pad(map.muscles[m] ?? m, 22) + padL(n, 9) + '  ' + pad(t.tier, 15) + byDay + flag);
}
console.log('\n  <<  below the minimum effective dose of 4 fractional sets');
console.log('  >>  past the efficient zone: every further set buys less than the one before');

console.log('\n\nPER LIFT, for STRENGTH  (Table 4: minimum 1, and past 5 extra sets stop paying)\n');
console.log(pad('lift', 30) + padL('sets/wk', 9) + padL('days', 6) + '  ' + pad('tier', 15) + 'loadable');
rule();
for (const [id, v] of Object.entries(perExercise).sort((a, b) => b[1].sets - a[1].sets)) {
  const t = tierFor(STRENGTH_TIERS, v.sets);
  console.log(pad(v.name, 30) + padL(v.sets, 9) + padL(v.days.size, 6) + '  ' + pad(t.tier, 15) + (v.loadable ? 'yes' : 'NO, cannot progress'));
}

console.log('\n\nPAIRINGS THAT COST THE LIFT IN FRONT OF THEM');
console.log('Zhang 2025, Sports Med 55(4):953-975: "similar biomechanical supersets led to');
console.log('significantly less volume load than traditional sets".');
rule();
if (!redundantPairs.length) {
  console.log('none.');
} else {
  const strictPairs = redundantPairs.filter((p) => p.strict);
  const loosePairs  = redundantPairs.filter((p) => !p.strict);

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
  const totalCost  = redundantPairs.reduce((a, p) => a + p.sets, 0);
  console.log(`\n  ${strictPairs.length} strict (${strictCost} sets/wk), ${loosePairs.length} loose (${totalCost - strictCost} sets/wk).`);
  console.log('  Only the strict ones are beyond argument. The loose ones are the judgement call,');
  console.log('  and they are listed so the call is visible rather than buried in muscles.json.');
}

if (unloadableWork.length) {
  console.log('\n\nUNLOADABLE EXERCISES IN A "MAIN" BLOCK');
  console.log('No weight column, so the progression ladder can never move them.');
  rule();
  for (const u of unloadableWork) console.log(`  ${pad(u.day, 9)} ${pad(u.name, 30)} ${u.sets} sets, in "${u.block}"`);
}

if (sourceVoids.length) {
  console.log('\n\nEXERCISES WITH NO SOURCE AT ALL');
  rule();
  const seen = new Set();
  for (const s of sourceVoids) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    console.log(`  ${pad(s.name, 26)} ${s.why.split('.')[0]}.`);
  }
}

console.log('');
rule('=');
const problems = below + redundantPairs.filter((p) => p.strict).length + sourceVoids.length;
console.log(`${below} muscle(s) below the minimum dose, ${past} past the efficient zone, ` +
            `${redundantPairs.length} redundant pairing(s), ${new Set(sourceVoids.map(s => s.name)).size} exercise(s) with no source.`);
console.log(problems ? 'NOT CLEAN.' : 'CLEAN.');
process.exit(problems ? 1 : 0);
