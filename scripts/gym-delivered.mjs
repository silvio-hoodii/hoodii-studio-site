#!/usr/bin/env node
/**
 * WHAT A PROGRAMME WILL ACTUALLY DELIVER, priced per exercise from his own log.
 *
 *   node scripts/gym-delivered.mjs                        # the live programme
 *   node scripts/gym-delivered.mjs <path-to-program.json> # any candidate
 *
 * Needs Neon, so it is NOT in verify.mjs, same reason as check-ladder.mjs: it cannot run offline and
 * it can change with no file edited.
 *
 * WHY THIS EXISTS. Every volume claim this project has made was computed by multiplying prescribed
 * sets by a completion rate attached to the BLOCK ROLE: 80.1% for `main`, 52.2% for `accessory`. That
 * rate was measured over a population of main blocks dominated by the RDL, the barbell row, the
 * overhead press and the back squat, all lifts he reliably does.
 *
 * THE 2026-08-31 CANDIDATE THEN RELABELLED CALF RAISES, CARRIES AND A PLANK AS `main` AND PRICED
 * THEM AT THAT AVERAGE. Queried from gym_set the same day: `suitcase-carry` has ZERO rows in 120
 * days and appears 6 sets a week; `leg-press` has ZERO rows and was made the main lift of a day;
 * `db-rdl`, `half-kneeling-sa-press`, `db-skullcrusher` and `db-incline-press` all have zero.
 * `standing-calf-raise` is 3 of 12. **Relabelling a calf raise does not change what he thinks of a
 * calf raise.** The headline "+56% delivered lower-body work" was inflated by that substitution.
 *
 * SO THE RATE COMES FROM THE EXERCISE, not from the word next to it. Where an exercise has too little
 * history to price, that is REPORTED AS UNKNOWN rather than filled with an average, because filling
 * it with an average is the exact move that produced the inflated claim.
 *
 * THE DENOMINATOR PROBLEM, and it is real and unresolved. A set he did and did not log is
 * indistinguishable from a set he skipped: SYNTHESIS-2026-08-30.md, "an absent row means 'not
 * captured' as often as 'not done'". So two rates are printed for every exercise and neither is
 * called the truth:
 *
 *   logged    delivered rows / rows that exist. A CEILING: it cannot see a session he never opened.
 *   dates     dates with a performed set / dates that day-type was trained. A FLOOR: it counts a
 *             whole uncaptured session as a total miss.
 *
 * The honest reading is the range. A claim that needs the ceiling to be true is a claim resting on
 * the assumption that he logs everything, and this project has already measured that he does not:
 * 33 app days against 56 watch sessions.
 */
import { readFileSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const argv = process.argv.slice(2);
const programPath = argv.find((a) => !a.startsWith('--')) || 'content/gym/program.json';

const envText = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(env.GYM_DATABASE_URL || env.KITCHEN_DATABASE_URL);

const program = JSON.parse(readFileSync(programPath, 'utf8'));
const cat = JSON.parse(readFileSync('content/gym/movements.json', 'utf8'));
const byId = new Map();
for (const [, m] of Object.entries(cat.movements)) {
  for (const v of m.variants) {
    const f = { ...v, primary: v.primary ?? m.primary };
    byId.set(v.id, f);
    for (const a of v.aliases ?? []) byId.set(a, f);
  }
}
const LOWER = new Set(['glutes', 'quads', 'hamstrings', 'adductors', 'calves']);

/* PERFORMED is `done = true OR reps > 0`, the one definition src/lib/gym/db.ts uses for all four of
 * its reads. Ticking the circle is a separate gesture from typing the numbers, and 66 of 646 rows
 * carry real reps with done = false. */
const rows = await sql`
  select exercise_id,
         count(*)::int                                                            as rows_total,
         count(*) filter (where done = true or (reps is not null and reps > 0))::int as rows_done,
         count(distinct date) filter (where done = true or (reps is not null and reps > 0))::int as dates_done,
         max(date)                                                                as last_seen
    from gym_set
   group by exercise_id
`;
const hist = new Map(rows.map((r) => [r.exercise_id, r]));

/* How many times each programme DAY has been trained, for the floor rate. */
const dayRows = await sql`select day, count(distinct date)::int as n from gym_session where day is not null group by day`;
const dayCount = new Map(dayRows.map((r) => [r.day, r.n]));

const DAY_ORDER = ['monday', 'tuesday', 'thursday', 'friday'];
const MIN_ROWS = 6;   // below this there is not enough history to price anything

const slots = [];
for (const dayKey of DAY_ORDER) {
  const day = program.days?.[dayKey];
  if (!day) continue;
  for (const b of day.blocks) {
    for (const e of b.exercises) {
      if (e.log === false) continue;
      const k = byId.get(e.id);
      slots.push({
        day: dayKey, role: b.role, id: e.id, name: e.name, sets: e.sets || 0,
        lower: Boolean(k && k.primary.some((m) => LOWER.has(m))),
      });
    }
  }
}

console.log(`${programPath}`);
console.log('Delivery priced PER EXERCISE from gym_set, not from the block role.');
console.log('PERFORMED = done = true OR reps > 0. Two rates, and neither is the truth:');
console.log('  logged = done rows / rows that exist          A CEILING (blind to sessions never opened)');
console.log('  dates  = dates performed / times day trained  A FLOOR (an uncaptured session counts as a miss)\n');

console.log('exercise'.padEnd(28) + 'sets'.padStart(5) + 'rows'.padStart(6) + 'logged'.padStart(8) + 'dates'.padStart(7) + '  last seen   verdict');
console.log('-'.repeat(100));

let lowPrescribed = 0, lowCeil = 0, lowFloor = 0;
const unknown = [];
const never = [];

for (const s of slots) {
  const h = hist.get(s.id);
  const trained = dayCount.get(s.day) ?? 0;
  let logged = null, dates = null, verdict;

  if (!h || h.rows_total === 0) {
    verdict = 'NEVER PERFORMED';
    never.push(s);
  } else if (h.rows_total < MIN_ROWS) {
    logged = h.rows_done / h.rows_total;
    verdict = `thin history, ${h.rows_total} rows`;
    unknown.push(s);
  } else {
    logged = h.rows_done / h.rows_total;
    dates = trained ? Math.min(1, h.dates_done / trained) : null;
    verdict = logged >= 0.75 ? 'reliable' : logged >= 0.4 ? 'patchy' : 'rarely done';
  }

  if (s.lower) {
    lowPrescribed += s.sets;
    lowCeil += s.sets * (logged ?? 0);
    lowFloor += s.sets * (dates ?? (logged !== null ? logged * 0.5 : 0));
  }

  console.log(
    s.name.padEnd(28) + String(s.sets).padStart(5) + String(h?.rows_total ?? 0).padStart(6)
    + (logged === null ? '-' : `${(logged * 100).toFixed(0)}%`).padStart(8)
    + (dates === null ? '-' : `${(dates * 100).toFixed(0)}%`).padStart(7)
    + `  ${(h?.last_seen ? String(h.last_seen).slice(0, 10) : 'never').padEnd(11)} ${verdict}`,
  );
}

console.log('');
console.log(`LOWER-BODY-PRIMARY SETS PRESCRIBED: ${lowPrescribed}`);
console.log(`  delivered, ceiling (logged rates): ${lowCeil.toFixed(1)}`);
console.log(`  delivered, floor (date rates):     ${lowFloor.toFixed(1)}`);
console.log(`  the honest claim is the RANGE ${lowFloor.toFixed(1)} to ${lowCeil.toFixed(1)}, not either end.`);

const findings = [];
if (never.length) {
  findings.push(`${never.length} prescribed exercise(s) have NEVER been performed: `
    + never.map((s) => `${s.name} (${s.sets} sets, ${s.day})`).join(', ')
    + '. Each contributes 0 to the delivered figure and its sets are a promise the log cannot support.');
  const mains = never.filter((s) => s.role === 'main');
  if (mains.length) {
    findings.push(`${mains.length} of those is in a MAIN block: ${mains.map((s) => s.name).join(', ')}. `
      + 'A main lift with no history has no weight to suggest on day one and no evidence he will do it.');
  }
}
if (unknown.length) {
  findings.push(`${unknown.length} exercise(s) have fewer than ${MIN_ROWS} rows, too thin to price: `
    + unknown.map((s) => s.name).join(', ') + '. Reported as unknown rather than filled with an average.');
}

console.log('');
console.log('-'.repeat(100));
if (!findings.length) {
  console.log('GREEN. Every prescribed exercise has enough history to price, and none is unperformed.');
  process.exit(0);
}
console.log(`${findings.length} finding(s):\n`);
for (const f of findings) console.log(`  ${f}\n`);
console.log('Either swap the exercise for one he does, or keep it and state the delivered claim as the');
console.log('FLOOR, which assumes the new lifts contribute nothing until the log says otherwise.');
process.exit(1);
