#!/usr/bin/env node
/** One-time (and re-runnable, everything is IF NOT EXISTS) apply of schema.sql to Neon.
 *  Run: HEALTH_DATABASE_URL=... node content/health/apply-schema.mjs */
import { Client } from '@neondatabase/serverless';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* Reads .env.local itself rather than expecting the environment to carry it, because the thing
   that runs this is a scheduled task with no shell profile. Parsed here and not sourced, for the
   reason content/curio/sync.mjs records: the file is CRLF, and sourcing it in a shell exports every
   name with a trailing carriage return, so every lookup misses and the failure reads as "no
   connection string". */
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const url = process.env.HEALTH_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('HEALTH_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');

const client = new Client(url);
await client.connect();
await client.query(readFileSync(join(HERE, 'schema.sql'), 'utf8'));
console.log('schema applied');
const res = await client.query(
  `select table_name from information_schema.tables where table_schema='public' and table_name like 'health_%' order by table_name`,
);
console.log('health tables now present:', res.rows.map((r) => r.table_name));
await client.end();
