#!/usr/bin/env node
/**
 * THE LADDER GATE. Does completing a rep range actually earn the next weight?
 *
 *   node scripts/check-ladder.mjs          report and exit non-zero on any gap
 *   node scripts/check-ladder.mjs --quiet  only print gaps
 *
 * WHY THIS EXISTS. Double progression tells him to hold a weight until he hits the TOP of the rep
 * range on every working set, then add one increment and drop back to the BOTTOM. That is only a
 * ladder if each rung is reachable from the one below. Using Epley (e1RM = w * (1 + reps / 30)):
 *
 *   banked   = w * (1 + top / 30)                  what maxing out the range is worth
 *   demanded = (w + increment) * (1 + bottom / 30) what the next rung asks for on rep one
 *
 * When banked < demanded, doing everything the app asks still does not earn the jump. He takes it,
 * fails it, drops back, and oscillates forever, and the app looks like it is lying to him.
 *
 * Measured 2026-08-22: EIGHT of fifteen logged lifts were in that state, every one of them a
 * dumbbell or cable movement where 5 lb is a big fraction of the load. The overhead press is the
 * proof and it is the only main lift that has not moved all year:
 *
 *   2026-05-26  60x10 60x10 60x10   e1RM 80
 *   2026-06-03  65x8  65x8  65x8    e1RM 82
 *   2026-06-10  60x10 60x9          e1RM 80
 *   2026-07-24  65x7  65x8  65x8    e1RM 82
 *   2026-08-09  65x7  65x7  65x6    e1RM 80
 *   2026-08-17  60x8  60x6          e1RM 76
 *
 * At 65 lb, three sets of ten banks 86.7 and the jump to 70 demands 88.7. The rung was out of
 * reach even on a perfect session. Meanwhile every barbell lift, where 5 lb is 3% of the load
 * rather than 8%, climbed: squat 135x10 to 185x6, RDL 165x8 to 225x4.
 *
 * WHY IT IS NOT IN validate.mjs. That file is offline and zero-dependency by design, and this check
 * needs his real working weights out of Neon. The gap depends on the load: the same rep range is
 * fine at 165 lb and broken at 65 lb.
 *
 * The two ways to close a gap, in order of preference:
 *   1. A SMALLER INCREMENT, if the equipment has one. Only claim it from weights he has actually
 *      logged. The cable stack is 2.5 lb because he has logged 72.5 and 87.5 on it.
 *   2. A WIDER REP RANGE (`rangeWidth` on the exercise). Dumbbells are 5 lb and that is the floor
 *      in this building, so the range has to absorb the jump instead.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@neondatabase/serverless';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const QUIET = process.argv.includes('--quiet');

function databaseUrl() {
  for (const k of ['GYM_DATABASE_URL', 'HEALTH_DATABASE_URL', 'KITCHEN_DATABASE_URL', 'DATABASE_URL']) {
    if (process.env[k]) return process.env[k];
  }
  try {
    const env = readFileSync(join(ROOT, '.env.local'), 'utf8');
    const m = /(?:GYM|HEALTH|KITCHEN)_DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/.exec(env);
    if (m) return m[1].trim();
  } catch { /* no local env file */ }
  return null;
}

const url = databaseUrl();
if (!url) {
  console.error('check-ladder: no database URL. Set GYM_DATABASE_URL or provide .env.local.');
  process.exit(2);
}

const program = JSON.parse(readFileSync(join(ROOT, 'content/gym/program.json'), 'utf8'));
const DEFAULT_WIDTH = 2;
const LOOKBACK_DAYS = 90;
/** Above this many prescribed reps the Epley estimate is not trustworthy. See the note at its use. */
const EPLEY_LIMIT = 15;
const e1rm = (w, reps) => w * (1 + reps / 30);

const client = new Client(url);
await client.connect();
const { rows } = await client.query(
  `select exercise_id, weight, count(*)::int n
     from gym_set
    where done = true and reps > 0 and weight is not null and weight > 0
      and date >= (current_date - ($1 || ' days')::interval)::text
    group by 1, 2`,
  [String(LOOKBACK_DAYS)],
);
await client.end();

/* The weight he actually WORKS at, not his best single: the most-used load, ties going to the
   lighter one. Same rule as workingWeight() in src/lib/gym/progression.ts, deliberately, because a
   check that measures something the engine does not use would pass while the engine still fails. */
const working = new Map();
for (const r of rows) {
  const cur = working.get(r.exercise_id);
  const w = Number(r.weight);
  if (!cur || r.n > cur.n || (r.n === cur.n && w < cur.w)) working.set(r.exercise_id, { w, n: r.n });
}

const gaps = [];
const checked = [];
const unlogged = [];
const outOfScope = [];
for (const [dayKey, day] of Object.entries(program.days)) {
  for (const block of day.blocks) {
    for (const ex of block.exercises) {
      if (ex.log === false || ex.progression !== 'weight') continue;
      const bottom = parseInt(String(ex.reps), 10);
      if (!Number.isFinite(bottom) || bottom <= 0) continue;
      /* EPLEY IS NOT VALID UP HERE, so neither is this check. Added 2026-08-22, twenty minutes
         after the check itself, when it fired on the farmer carry: 40 "reps" of a carry are SECONDS
         (his ruling on 2026-08-27, closing notes #17 and #19; this comment said STEPS until then,
         which was one of the three answers that were live at once), and 50 lb times (1 + 40/30) is
         not an estimated one-rep max, it is a meaningless number. It
         then demanded a 47-step carry to earn the next dumbbell. Every rep-to-max formula of this
         shape is fitted on sets of roughly one to ten and drifts badly past twelve to fifteen, so
         anything prescribed above fifteen is out of scope and says so rather than being silently
         wrong. Carries and long holds progress on load and on distance, which nobody needs an
         equation for. */
      if (bottom > EPLEY_LIMIT) { outOfScope.push(`${dayKey}/${ex.id} (${bottom} reps)`); continue; }
      const width = ex.rangeWidth != null ? Number(ex.rangeWidth) : DEFAULT_WIDTH;
      const top = bottom + width;
      const increment = ex.increment != null ? Number(ex.increment) : 5;
      const cur = working.get(ex.id);
      if (!cur) { unlogged.push(`${dayKey}/${ex.id}`); continue; }
      const banked = e1rm(cur.w, top);
      const demanded = e1rm(cur.w + increment, bottom);
      const row = { dayKey, id: ex.id, name: ex.name, w: cur.w, bottom, top, increment, banked, demanded, margin: banked - demanded };
      checked.push(row);
      if (row.margin < 0) {
        let need = width;
        while (need < 20 && e1rm(cur.w, bottom + need) < demanded) need++;
        row.needWidth = need;
        gaps.push(row);
      }
    }
  }
}

if (!QUIET) {
  console.log(`ladder check, working weights from the last ${LOOKBACK_DAYS} days\n`);
  console.log('exercise                       day        reps    inc   working   banked  demanded   margin');
  for (const r of checked.sort((a, b) => a.margin - b.margin)) {
    console.log(
      `${r.id.padEnd(30)} ${r.dayKey.padEnd(9)} ${`${r.bottom}-${r.top}`.padStart(6)} ${String(r.increment).padStart(5)} `
      + `${String(r.w).padStart(9)} ${r.banked.toFixed(1).padStart(8)} ${r.demanded.toFixed(1).padStart(9)} `
      + `${(r.margin >= 0 ? '+' : '') + r.margin.toFixed(1)}`,
    );
  }
  if (unlogged.length) console.log(`\nnot yet logged, nothing to check against: ${unlogged.join(', ')}`);
  // Never a silent skip: a check that quietly drops rows reads as coverage it does not have.
  if (outOfScope.length) console.log(`\nabove ${EPLEY_LIMIT} reps, where the estimate stops holding, so deliberately not checked: ${outOfScope.join(', ')}`);
}

if (gaps.length) {
  console.error(`\n${gaps.length} lift(s) whose next weight is unreachable from the top of their own rep range:`);
  for (const r of gaps) {
    console.error(
      `  ${r.dayKey}/${r.id} at ${r.w} lb: ${r.bottom}-${r.top} banks ${r.banked.toFixed(1)} but +${r.increment} lb demands `
      + `${r.demanded.toFixed(1)}. Either drop the increment below ${r.increment} lb if the equipment has a smaller step `
      + `he has actually used, or set "rangeWidth": ${r.needWidth} on it (reps ${r.bottom} to ${r.bottom + r.needWidth}).`,
    );
  }
  process.exit(1);
}
console.log(`\n${checked.length} logged lift(s) checked, every ladder closes.`);
