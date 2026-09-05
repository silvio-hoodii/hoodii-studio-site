#!/usr/bin/env node
/* Apply content/kitchen/schema.sql to the kitchenos Neon project. Idempotent: the file is
 * create-if-not-exists only. Reads KITCHEN_DATABASE_URL from the environment or from .env.local.
 *
 *   node content/kitchen/apply-schema.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function url() {
  if (process.env.KITCHEN_DATABASE_URL) return process.env.KITCHEN_DATABASE_URL;
  if (existsSync('.env.local')) {
    const m = readFileSync('.env.local', 'utf8').match(/KITCHEN_DATABASE_URL=["']?([^"'\r\n]+)/);
    if (m) return m[1];
  }
  throw new Error('KITCHEN_DATABASE_URL is not set');
}

const sql = neon(url());
const text = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
/* Comments go first, whole-line and trailing, because a `;` inside a trailing comment would
 * otherwise split a statement in two. No string literal in the schema contains `--`. */
const statements = text
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

for (const s of statements) await sql.query(s);
const tables = await sql`select table_name from information_schema.tables where table_schema='public' order by 1`;
console.log(`${statements.length} statements applied. Tables: ${tables.map((t) => t.table_name).join(', ')}`);
