#!/usr/bin/env node
/* ADD gym_set.fill_for: the lead exercise whose rest this set was done in.
 *
 *   node content/gym/migrate-fill-for.mjs          # say what it would do
 *   node content/gym/migrate-fill-for.mjs --apply
 *
 * WHY A COLUMN AND NOT localStorage. The partner he picks at the rack has to survive the phone
 * dropping the tab, which is the documented reason the whole queue-and-retry machinery on this
 * surface exists. It also has to be readable later: "what does he actually put in his rests" is the
 * question this whole feature was built to stop guessing at, and a browser-local value answers it
 * for nobody. Six notes over twelve days were the only record of his three self-chosen pairings,
 * because the app had no field for them.
 *
 * NULLABLE TEXT, AND NO CONSTRAINT. It names an exercise id, not a foreign key: the ids in this
 * table are what he DID, and program.json's are what was asked for, which is precisely why five ids
 * in the log no longer exist in the programme. A constraint would make a future rebuild fail on
 * history rather than on the rebuild.
 *
 * COLUMN FIRST, CODE SECOND, and that order is the opposite of the 2026-08-27 `rir` DROP for the
 * reason AGENTS.md gives there. A drop must ship the code first, because the deployed app is still
 * selecting the column. An ADD is safe in either order for readers (nothing selects a column it
 * does not know) and unsafe in one order for writers: deploy a write of `fill_for` before the column
 * exists and every set logged from a filled rest 500s at the rack. So: this, then the deploy.
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
  return m[1].trim();
}

const sql = neon(connectionString());

const existing = await sql`
  select column_name from information_schema.columns
  where table_name = 'gym_set' and column_name = 'fill_for'
`;

if (existing.length) {
  console.log('gym_set.fill_for already exists. Nothing to do.');
  process.exit(0);
}

if (!APPLY) {
  console.log('WOULD RUN:  alter table gym_set add column fill_for text');
  console.log('Re-run with --apply.');
  process.exit(0);
}

await sql`alter table gym_set add column fill_for text`;

/* RE-READ IT RATHER THAN TRUSTING THE STATEMENT RETURNED. Two things in this repo failed silently
 * and were found by counting rather than by reading the success line: a mirror that stopped after
 * 108 of 151 rows and looked populated, and a scheduled task that reported LastTaskResult=0 about
 * eighty times while being unable to parse. Report the outcome, never the intent. */
const after = await sql`
  select column_name, data_type, is_nullable from information_schema.columns
  where table_name = 'gym_set' and column_name = 'fill_for'
`;
if (!after.length) {
  console.error('FAILED: the column is still not there after the alter.');
  process.exit(1);
}
console.log('added:', after[0]);
