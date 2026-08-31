#!/usr/bin/env node
/** One-time (and re-runnable, everything is IF NOT EXISTS) apply of schema.sql to Neon.
 *  Run: GYM_DATABASE_URL=... node content/gym/apply-schema.mjs */
import { Client } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const url = process.env.GYM_DATABASE_URL;
if (!url) throw new Error('GYM_DATABASE_URL not set');

const client = new Client(url);
await client.connect();
await client.query(readFileSync(join(HERE, 'schema.sql'), 'utf8'));
console.log('schema applied');
/* The readback names the tables EXPLICITLY rather than matching a prefix. It used to filter on
   `like 'gym_%'`, and bike_ride, added 2026-08-27 by this same file, does not start with gym_. A
   verification that cannot see the table it just created reports success and confirms nothing. */
const EXPECTED = ['gym_session', 'gym_set', 'gym_note', 'bike_ride'];
const res = await client.query(
  `select table_name from information_schema.tables
   where table_schema='public' and table_name = any($1) order by table_name`,
  [EXPECTED],
);
const present = res.rows.map((r) => r.table_name);
console.log('tables now present:', present);
const missing = EXPECTED.filter((t) => !present.includes(t));
if (missing.length) {
  console.error('MISSING after apply:', missing.join(', '));
  await client.end();
  process.exit(1);
}

/* THE READBACK ABOVE CANNOT SEE A COLUMN, and every change to this file since the tables were
   created has been a column. `create table if not exists` is a no-op on an existing table, so the
   `alter table ... add column if not exists` lines are the only thing that runs on a re-apply, and
   the check that follows them was asking whether four tables exist. They always do. This file's own
   comment already names this class of fault about the prefix filter ("a verification that cannot see
   the table it just created reports success and confirms nothing") and then stopped one level short.

   Added 2026-08-31 with gym_note.exercise_id and gym_note.kind. Extend the list when you add a
   column, and put it here rather than in a handoff: this is the only place that runs. */
const EXPECTED_COLUMNS = [
  ['gym_set', 'off_plan'],
  ['gym_note', 'exercise_id'],
  ['gym_note', 'kind'],
  ['gym_session', 'sets_prescribed'],
];
const colRes = await client.query(
  `select table_name, column_name from information_schema.columns
    where table_schema = 'public' and (table_name, column_name) in
      (${EXPECTED_COLUMNS.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})`,
  EXPECTED_COLUMNS.flat(),
);
const haveCols = new Set(colRes.rows.map((r) => `${r.table_name}.${r.column_name}`));
const missingCols = EXPECTED_COLUMNS.map((c) => c.join('.')).filter((c) => !haveCols.has(c));
console.log(`columns verified: ${haveCols.size}/${EXPECTED_COLUMNS.length}`);
if (missingCols.length) {
  console.error('MISSING COLUMNS after apply:', missingCols.join(', '));
  await client.end();
  process.exit(1);
}

/* And the constraint, because a nullable text column with no CHECK accepts anything and would look
   identical here to one that does not. */
const conRes = await client.query(
  `select conname from pg_constraint where conrelid = 'gym_note'::regclass and conname = 'gym_note_kind_known'`,
);
if (conRes.rows.length === 0) {
  console.error('MISSING CONSTRAINT after apply: gym_note_kind_known');
  await client.end();
  process.exit(1);
}
console.log('constraint verified: gym_note_kind_known');
await client.end();
