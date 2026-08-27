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
await client.end();
