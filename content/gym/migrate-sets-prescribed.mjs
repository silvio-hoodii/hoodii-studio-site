#!/usr/bin/env node
/**
 * Adds `gym_session.sets_prescribed` and backfills nothing.
 *
 *   node content/gym/migrate-sets-prescribed.mjs           # show what it would do
 *   node content/gym/migrate-sets-prescribed.mjs --apply   # do it
 *
 * WHY THE COLUMN EXISTS, and why it is NOT backfilled.
 *
 * The session history view prints "30/42 sets": what he logged against what the day asked for. The
 * second number cannot be computed at read time. A day's prescription changed five times in August
 * 2026 (rebuilds on 08-16, 08-21, 08-22 plus patches on 08-26 and 08-27), so rendering a session
 * from 2026-08-16 against today's program.json would report a gap that did not exist on the day. The
 * prescription is a fact about the past and has to be stored when it is true.
 *
 * The 33 existing rows are therefore left NULL, and the history view prints their set count with no
 * denominator rather than inventing one. That is the honest state: nobody recorded what those days
 * asked for. Backfilling them from today's file would produce exactly the class of confident wrong
 * number this whole audit is about.
 *
 * See docs/GYM-AUDIT-AND-PLAN-2026-08-27.md, Decision 7.
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

function connectionString() {
  const fromEnv = process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
  if (fromEnv) return fromEnv;
  const env = readFileSync(join(HERE, '..', '..', '.env.local'), 'utf8');
  const m = env.match(/^GYM_DATABASE_URL=(.*)$/m) || env.match(/^KITCHEN_DATABASE_URL=(.*)$/m);
  if (!m) throw new Error('no GYM_DATABASE_URL in the environment or .env.local');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const sql = neon(connectionString());

const existing = await sql`
  select column_name from information_schema.columns
  where table_name = 'gym_session' and column_name = 'sets_prescribed'
`;

if (existing.length) {
  const [{ n, filled }] = await sql`
    select count(*)::int n, count(sets_prescribed)::int filled from gym_session
  `;
  console.log(`gym_session.sets_prescribed already exists. ${filled} of ${n} rows have a value.`);
  process.exit(0);
}

const [{ n }] = await sql`select count(*)::int n from gym_session`;
console.log(`gym_session has ${n} rows. They will stay NULL: see the header of this file.`);

if (!APPLY) {
  console.log('\nDRY RUN. Would run:');
  console.log('  alter table gym_session add column sets_prescribed int');
  console.log('\nRe-run with --apply.');
  process.exit(0);
}

await sql`alter table gym_session add column sets_prescribed int`;
const after = await sql`
  select column_name, data_type from information_schema.columns
  where table_name = 'gym_session' and column_name = 'sets_prescribed'
`;
if (!after.length) {
  console.error('REFUSED TO CONFIRM: the column is not there after the alter.');
  process.exit(1);
}
console.log(`added gym_session.sets_prescribed (${after[0].data_type}). ${n} existing rows are NULL, by design.`);
