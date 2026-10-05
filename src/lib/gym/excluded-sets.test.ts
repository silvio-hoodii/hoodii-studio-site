/* REGRESSION SUITE FOR THE EXCLUDED-SETS LIST.
 *
 *   node --experimental-strip-types src/lib/gym/excluded-sets.test.ts
 *
 * Three things, each with the case that would catch it overshooting:
 *   1. The real file parses and names the six RDL rows of 2026-09-28 and 2026-10-01, and a bad file
 *      is refused rather than quietly excluding nothing.
 *   2. On his REAL barbell RDL history (gym_set, read 2026-10-04), the engine offers 65 with those rows in
 *      the window and 175 with them out. Filtering by id is the whole mechanism, so it is tested by id.
 *   3. db.ts still applies the list inside getExerciseHistories. A list nothing reads is decoration, and
 *      that is the one failure the first two cases cannot see.
 */
import { readFileSync } from 'node:fs';
import { excludedSetIds } from './excluded-sets.ts';
import { suggest, type LastSession } from './progression.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`); failures++; }
}
const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };

const file = JSON.parse(readFileSync(new URL('../../../content/gym/excluded-sets.json', import.meta.url), 'utf8'));

console.log('\nthe file');
const ids = excludedSetIds(file);
check('names the six RDL rows', [1685, 1688, 1690, 1814, 1819, 1825].every((id) => ids.includes(id)), JSON.stringify(ids));
check('every row is the barbell RDL', file.sets.every((s: { exerciseId: string }) => s.exerciseId === 'romanian-deadlift'));
check('refuses a duplicate id', throws(() => excludedSetIds({ sets: [file.sets[0], file.sets[0]] })));
check('refuses a row with no reason', throws(() => excludedSetIds({ sets: [{ ...file.sets[0], why: '' }] })));
check('refuses a missing sets array', throws(() => excludedSetIds({})));
check('accepts an empty list (nothing excluded)', excludedSetIds({ sets: [] }).length === 0);

console.log('\nhis real barbell RDL history');
/* gym_set rows, newest first, as getExerciseHistories returns them (done or reps typed, not estimated). */
const rows: { id: number; date: string; weight: number; reps: number }[] = [
  { id: 1814, date: '2026-10-01', weight: 65, reps: 8 }, { id: 1819, date: '2026-10-01', weight: 65, reps: 10 }, { id: 1825, date: '2026-10-01', weight: 65, reps: 10 },
  { id: 1685, date: '2026-09-28', weight: 60, reps: 7 }, { id: 1688, date: '2026-09-28', weight: 68, reps: 6 }, { id: 1690, date: '2026-09-28', weight: 68, reps: 6 },
  { id: 1587, date: '2026-09-21', weight: 175, reps: 6 }, { id: 1592, date: '2026-09-21', weight: 175, reps: 8 }, { id: 1601, date: '2026-09-21', weight: 175, reps: 6 },
  { id: 1469, date: '2026-09-15', weight: 175, reps: 7 }, { id: 1525, date: '2026-09-15', weight: 175, reps: 6 }, { id: 1527, date: '2026-09-15', weight: 175, reps: 6 },
  { id: 1451, date: '2026-09-11', weight: 185, reps: 5 },
  { id: 1383, date: '2026-09-08', weight: 135, reps: 12 }, { id: 1389, date: '2026-09-08', weight: 165, reps: 8 }, { id: 1394, date: '2026-09-08', weight: 165, reps: 8 },
];
const sessions = (skip: Set<number>): LastSession[] => {
  const out: LastSession[] = [];
  for (const r of rows) {
    if (skip.has(r.id)) continue;
    let cur = out[out.length - 1];
    if (!cur || cur.date !== r.date) { cur = { date: r.date, sets: [] }; out.push(cur); }
    cur.sets.push({ weight: r.weight, reps: r.reps });
  }
  return out;
};
/* The plan route's call for this slot: 6 reps, rangeWidth 2, barbell (no ladder, 5 lb step). */
const plan = (recent: LastSession[]) => suggest(recent[0] ?? null, { type: 'weighted', targetReps: 6, rangeWidth: 2, today: '2026-10-04', recent: recent.slice(0, 3) });
const before = plan(sessions(new Set()));
const after = plan(sessions(new Set(ids)));
console.log(`  before: ${before.weight} x ${before.reps}  "${before.reason}"`);
console.log(`  after:  ${after.weight} x ${after.reps}  "${after.reason}"`);
check('with the rows in, the card builds on 65', (before.weight ?? 0) < 100, JSON.stringify(before));
check('with the rows out, the card builds on 175', after.weight === 175, JSON.stringify(after));
check('an empty list changes nothing', plan(sessions(new Set(excludedSetIds({ sets: [] })))).weight === before.weight);

console.log('\ndb.ts applies it');
const db = readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
const fn = db.slice(db.indexOf('export async function getExerciseHistories'), db.indexOf('export async function finishSession'));
check('getExerciseHistories filters on EXCLUDED_SET_IDS', /g\.id = any\(\$\{EXCLUDED_SET_IDS\}::bigint\[\]\)/.test(fn));
check('db.ts builds EXCLUDED_SET_IDS from the checked file', /EXCLUDED_SET_IDS = excludedSetIds\(excludedSets\)/.test(db));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
