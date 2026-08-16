#!/usr/bin/env node
/**
 * What he wrote at the gym and nobody has acted on yet.
 *
 * Run this at the start of any session that touches the gym, the same way the kitchen's cook_log
 * gets read before touching a recipe. The rule is in AGENTS.md.
 *
 *   node scripts/gym-notes.mjs              # unhandled only, newest first
 *   node scripts/gym-notes.mjs --all        # everything
 *   node scripts/gym-notes.mjs --handled 3  # mark note id 3 as acted on
 *
 * WHY `handled` MATTERS. The kitchen learned on 2026-08-02 that a captured question nobody answers
 * is worse than no capture at all: a parchment question sat unanswered for a week, and the cost is
 * not the missing answer, it is that he stops believing the box does anything. Mark them, or the
 * feature quietly dies.
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

function connectionString() {
  const fromEnv = process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
  if (fromEnv) return fromEnv;
  const env = readFileSync(join(HERE, '..', '.env.local'), 'utf8');
  const m = env.match(/^GYM_DATABASE_URL=(.*)$/m) || env.match(/^KITCHEN_DATABASE_URL=(.*)$/m);
  if (!m) throw new Error('no GYM_DATABASE_URL in the environment or .env.local');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const sql = neon(connectionString());
const args = process.argv.slice(2);

const markIdx = args.indexOf('--handled');
if (markIdx !== -1) {
  const id = Number(args[markIdx + 1]);
  if (!Number.isInteger(id)) {
    console.error('--handled needs a note id, e.g. --handled 3');
    process.exit(1);
  }
  const rows = await sql`update gym_note set handled = true where id = ${id} returning id, body`;
  console.log(rows.length ? `marked ${id} handled: ${rows[0].body.slice(0, 60)}` : `no note with id ${id}`);
  process.exit(0);
}

const all = args.includes('--all');
const rows = all
  ? await sql`select * from gym_note order by created_at desc limit 50`
  : await sql`select * from gym_note where handled = false order by created_at desc limit 50`;

if (!rows.length) {
  console.log(all ? 'No notes yet.' : 'No unhandled notes.');
  process.exit(0);
}

console.log(`${rows.length} ${all ? 'note(s)' : 'UNHANDLED note(s)'}, newest first:\n`);
for (const r of rows) {
  const when = String(r.created_at).slice(0, 16).replace('T', ' ');
  console.log(`  #${r.id}  ${r.date}  ${r.day_title || r.day || ''}  (written ${when})${r.handled ? '  [handled]' : ''}`);
  for (const line of String(r.body).split('\n')) console.log(`      ${line}`);
  console.log('');
}
if (!all) console.log('Act on these, then: node scripts/gym-notes.mjs --handled <id>');
