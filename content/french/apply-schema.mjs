#!/usr/bin/env node
/** One-time (and re-runnable, everything is IF NOT EXISTS) apply of schema.sql to Neon.
 *  Run: FRENCH_DATABASE_URL=... node content/french/apply-schema.mjs */
import { Client } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const url =
  process.env.FRENCH_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('FRENCH_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');

const client = new Client(url);
await client.connect();
await client.query(readFileSync(join(HERE, 'schema.sql'), 'utf8'));
console.log('schema applied');
const res = await client.query(
  `select table_name from information_schema.tables where table_schema='public' and table_name like 'french_%' order by table_name`,
);
console.log('french tables now present:', res.rows.map((r) => r.table_name));
await client.end();
