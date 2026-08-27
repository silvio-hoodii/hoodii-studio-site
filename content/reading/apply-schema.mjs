#!/usr/bin/env node
/** One-time (and re-runnable, everything is IF NOT EXISTS) apply of schema.sql to Neon.
 *  Run: node content/reading/apply-schema.mjs
 *
 *  Copied from the swim mirror (content/swim/apply-schema.mjs, deleted 2026-08-26 with the pool schedule) -- same reasoning: Client, not the http `sql` tag,
 *  because the tag refuses a plain string call. Reads .env.local itself since sourcing it from a
 *  shell on Windows fails silently (CRLF endings put a trailing \r on every exported name).
 */
import { Client } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url =
  process.env.READING_DATABASE_URL || process.env.SWIM_DATABASE_URL ||
  process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('READING_DATABASE_URL (or SWIM_DATABASE_URL / GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');

const client = new Client(url);
await client.connect();
await client.query(readFileSync(join(HERE, 'schema.sql'), 'utf8'));
const res = await client.query(
  `select table_name from information_schema.tables
    where table_schema='public' and table_name like 'reading_%' order by table_name`,
);
console.log('reading tables now present:', res.rows.map((r) => r.table_name));
await client.end();
