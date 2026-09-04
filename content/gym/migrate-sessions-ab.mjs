#!/usr/bin/env node
/* THE FOUR-SESSION KEYS BECOME TWO. 2026-09-03.
 *
 *   node content/gym/migrate-sessions-ab.mjs           # dry run: counts only
 *   node content/gym/migrate-sessions-ab.mjs --apply   # rewrite
 *
 * The week went from four sessions (a, b, c, d, themselves weekday names until earlier the same
 * day) to two alternated sessions (a, b). Rows keyed c and d in gym_session and gym_note are
 * relabelled so the rotation code, which only knows a and b, can read them: c -> a and d -> b,
 * which is the mapping that keeps each old session on the side of the rotation it led with (c
 * opened with a squat pattern like a; d opened with a hinge like b).
 *
 * gym_set.day is NOT touched. It still holds weekday strings on hundreds of rows from before the
 * 2026-09-03 rename and nothing reads it for the rotation; the calendar date is in `date`. Rewriting
 * history that nothing reads is churn, and the two `wednesday` and `saturday` gym_session rows from
 * May and June are left alone for the same reason the previous migration left them.
 *
 * `day_title` is left as written: it is what the card said on the day and it is displayed as
 * history, not read as identity. */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

function connectionString() {
  const fromEnv = process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL || process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const env = readFileSync(join(HERE, '..', '..', '.env.local'), 'utf8');
  const m = env.match(/^GYM_DATABASE_URL=(.*)$/m) || env.match(/^KITCHEN_DATABASE_URL=(.*)$/m);
  if (!m) throw new Error('no GYM_DATABASE_URL in the environment or .env.local');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const sql = neon(connectionString());
const MAP = { c: 'a', d: 'b' };

for (const table of ['gym_session', 'gym_note']) {
  const rows = await sql.query(`select day, count(*)::int n from ${table} where day in ('c','d') group by day order by day`);
  console.log(`${table}: ${rows.map((r) => `${r.day} x${r.n}`).join(', ') || 'no c or d rows'}`);
}

if (!APPLY) {
  console.log('\nDRY RUN. Re-run with --apply to relabel c -> a and d -> b in gym_session and gym_note.');
  process.exit(0);
}

for (const table of ['gym_session', 'gym_note']) {
  for (const [from, to] of Object.entries(MAP)) {
    const r = await sql.query(`update ${table} set day = $1 where day = $2`, [to, from]);
    console.log(`${table}: ${from} -> ${to}, ${r.length ?? r.rowCount ?? '?'} row(s)`);
  }
}
for (const table of ['gym_session', 'gym_note']) {
  const rows = await sql.query(`select day, count(*)::int n from ${table} group by day order by day`);
  console.log(`${table} now: ${rows.map((r) => `${r.day} x${r.n}`).join(', ')}`);
}
