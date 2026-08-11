#!/usr/bin/env node
/** One-time (and re-runnable, everything is IF NOT EXISTS) apply of schema.sql to Neon.
 *  Run: node content/music/apply-schema.mjs
 *
 *  Same shape as content/curio/apply-schema.mjs, and for the same two reasons.
 *
 *  Client, not the http `sql` tag: the tag refuses a plain string call, and splitting DDL on
 *  semicolons to feed it one statement at a time is a worse tool than handing the whole file to
 *  client.query().
 *
 *  Reads .env.local itself rather than expecting a sourced shell. Sourcing that file on Windows
 *  fails silently: it has CRLF endings, so every exported name carries a trailing \r and every
 *  lookup misses, and the failure surfaces as "no connection string" rather than as a parse error.
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
  process.env.MUSIC_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('MUSIC_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');

const client = new Client(url);
await client.connect();
await client.query(readFileSync(join(HERE, 'schema.sql'), 'utf8'));
const res = await client.query(
  `select table_name from information_schema.tables
    where table_schema='public' and table_name like 'music_%' order by table_name`,
);
console.log('music tables now present:', res.rows.map((r) => r.table_name));
await client.end();
