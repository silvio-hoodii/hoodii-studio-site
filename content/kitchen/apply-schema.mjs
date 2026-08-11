#!/usr/bin/env node
/** Apply schema.sql to Neon. Re-runnable: every statement is IF NOT EXISTS or ADD COLUMN IF NOT
 *  EXISTS, so this is also how the quantity migration lands on an existing database.
 *
 *  Run: node content/kitchen/apply-schema.mjs
 *
 *  Same shape as the curio and music appliers, and for the same two reasons: Client rather than the
 *  http `sql` tag (the tag refuses a plain string call), and .env.local parsed here rather than
 *  sourced from a shell, because that file has CRLF endings and shell-sourcing silently gives every
 *  name a trailing \r.
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

const url = process.env.KITCHEN_DATABASE_URL || process.env.GYM_DATABASE_URL;
if (!url) throw new Error('KITCHEN_DATABASE_URL not set');

const client = new Client(url);
await client.connect();
await client.query(readFileSync(join(HERE, 'schema.sql'), 'utf8'));

const cols = await client.query(
  `select column_name, data_type from information_schema.columns
    where table_name = 'stock_event' order by ordinal_position`,
);
console.log('stock_event columns:');
for (const c of cols.rows) console.log(`  ${c.column_name.padEnd(14)} ${c.data_type}`);

const [{ count }] = (
  await client.query('select count(*)::int as count from stock_event')
).rows;
console.log(`\nstock_event rows preserved: ${count}`);
await client.end();
