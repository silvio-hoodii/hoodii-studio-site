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

/* ---------------------------------------------------------------------------------------------
 * OPEN QUESTIONS PARKED ON THE THING THEY ARE ABOUT. Added 2026-08-27, on his ruling.
 *
 * Four of his notes were equipment facts nobody could have known without standing at the rack:
 * kettlebells stop at 50 lb, the cable does the overhead tricep, the barbell station could have
 * held more of Friday. KitchenOS/UNKNOWNS.md solves the same problem, and its one stated job is
 * "Silvio should never be asked the same question twice".
 *
 * He ruled against a second file for the gym: the question goes on the exercise or station it is
 * about, inside program.json / equipment.json, where the next agent is already reading.
 *
 * IT IS SURFACED HERE, AND NOT IN validate.mjs, on purpose. A due date that turns the build red
 * overnight with no file edited would block an unrelated deploy, which is the same reason
 * check-ladder.mjs is not in the validator either. This script is what AGENTS.md already requires
 * before ANY /gym edit, so it is the one place a deadline can bite the right person at the right
 * moment. The shape of an `open` row is still gated by validate.mjs.
 *
 * THE FAILURE THIS EXISTS TO STOP, in its own words: the farmer carry had three contradictory
 * answers live in the app for five days (the card said 40 reps, his note said seconds, the cue said
 * count steps). A 2026-08-22 audit had already concluded it was "a decision to put to Silvio, not
 * to invent". Nobody put it to him. Asked as three options with the cost of each, he answered in
 * one word and it shipped the same hour.
 *
 * This runs BEFORE the database work below and never touches the network, so a Neon outage cannot
 * hide a question that is already overdue.
 * ------------------------------------------------------------------------------------------- */

/** Every `open` array anywhere in an object tree, with a readable path to it. */
function findOpen(node, path, out) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => findOpen(v, `${path}[${i}]`, out));
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  const label = node.id || node.name || node.label;
  const here = label && typeof label === 'string' ? `${path} ${label}` : path;
  if (Array.isArray(node.open)) for (const q of node.open) out.push({ where: here.trim(), q });
  for (const [k, v] of Object.entries(node)) {
    if (k === 'open' || k.startsWith('$')) continue;
    findOpen(v, k === 'days' || k === 'blocks' || k === 'exercises' || k === 'zones' || k === 'stations' ? here.trim() : `${here.trim()} ${k}`, out);
  }
  return out;
}

function reportOpenQuestions() {
  const found = [];
  for (const f of ['program.json', 'equipment.json']) {
    try {
      const json = JSON.parse(readFileSync(join(HERE, '..', 'content', 'gym', f), 'utf8'));
      findOpen(json, f.replace('.json', ''), found);
    } catch (err) {
      console.error(`could not read content/gym/${f}: ${err.message}`);
    }
  }
  if (!found.length) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const overdue = found.filter((f) => f.q.due < today);

  console.log(`${found.length} OPEN QUESTION(S) for Silvio, parked on the thing they are about:\n`);
  for (const { where, q } of found) {
    const late = q.due < today;
    const when = late ? `OVERDUE by ${days(q.due, today)} day(s)` : `due ${q.due}, ${days(today, q.due)} day(s) left`;
    /* The topic is printed because it changes what an answer is FOR. A `cue` row wants words he
     * would follow at the machine; a `placement` row wants a yes or a swap; a `prescription` row
     * wants a number. Reading nineteen of these in one block, he said "most of the questions are
     * either badly phrased or badly explained", and part of that was that they all looked alike. */
    console.log(`  ${late ? '!!' : '  '} [${where}]  ${String(q.topic || '?').toUpperCase()}  asked ${q.asked}, ${when}`);
    for (const line of String(q.q).match(/.{1,96}(\s|$)/g) || [q.q]) console.log(`       ${line.trim()}`);
    console.log('');
  }
  if (overdue.length) {
    console.log(`${overdue.length} of these is past its due date. Put it to him in this session, with options and the cost of each,`);
    console.log('then delete the "open" row and write the answer where the thing lives. Exiting non-zero.\n');
  }
  console.log('-'.repeat(70) + '\n');
  return overdue.length;
}

const OVERDUE = reportOpenQuestions();

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

/* WHAT THE SET TABLE DOES NOT HOLD, added 2026-08-31 with gym_note.kind and gym_note.exercise_id.
 *
 * Over ALL rows, never just the unhandled ones, because a `did` or `skipped` row stays true after an
 * agent has read it: `handled` records that somebody answered him, not that the work has been
 * counted. This is the half of the capture fix that faces the reader, and a column nothing reads is
 * decoration.
 *
 * CALLED ON BOTH PATHS, INCLUDING THE EARLY EXIT, and the first version of this was not. All 37
 * existing notes are marked handled, so the default run takes the `No unhandled notes` branch and
 * calls process.exit two lines later; a section written after that line rendered in zero of the runs
 * that matter, and it took printing the output to notice. Same shape as the probe-taps finding where
 * a readiness gate a blank page could satisfy passed twelve unpainted URLs: a reader that cannot see
 * the thing it was built to see reports nothing and confirms nothing. */
async function printStructured() {
  const structured = await sql`
    select kind, exercise_id, date, body from gym_note
    where kind in ('did', 'skipped') order by date desc, id desc limit 40
  `;
  if (!structured.length) return;
  console.log('\n' + '-'.repeat(70));
  console.log(`\n${structured.length} note(s) record work gym_set cannot express.`);
  console.log('A completion or volume figure computed without these is measuring the plan against itself.\n');
  for (const r of structured) {
    console.log(`  ${r.date}  ${String(r.kind).toUpperCase().padEnd(7)} ${r.exercise_id ?? '(no exercise)'}`);
    console.log(`      ${String(r.body).replace(/\s+/g, ' ').slice(0, 140)}`);
  }
  console.log('');
}

if (!rows.length) {
  console.log(all ? 'No notes yet.' : 'No unhandled notes.');
  await printStructured();
  process.exit(OVERDUE ? 1 : 0);
}

console.log(`${rows.length} ${all ? 'note(s)' : 'UNHANDLED note(s)'}, newest first:\n`);
for (const r of rows) {
  /* THIS PRINTED " hu Aug 27" FOR A MONTH. `created_at` comes back from the driver as a JS Date,
   * not an ISO string, so `String()` gives "Thu Aug 27 2026 20:15:33 GMT-0600 ...". The slice took
   * "Thu Aug 27 2026 " and `.replace('T', ' ')` then ate the T of "Thu", because the code was
   * written for the ISO shape and never looked at its own output. Convert deliberately instead of
   * pattern-matching a string whose shape was assumed. */
  const at = r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
  const when = Number.isNaN(at.getTime())
    ? String(r.created_at)
    : `${at.toISOString().slice(0, 10)} ${at.toISOString().slice(11, 16)} UTC`;
  /* KIND AND EXERCISE, added 2026-08-31 with the columns. Both are null for a note written in the
     end-of-session box, which is most of the history, and NULL PRINTS NOTHING rather than a
     placeholder: "kind: -" on 37 rows would be 37 lines saying an agent does not know something.
     Where they are set they are the whole point of the row, so they lead. */
  const tags = [
    r.kind ? r.kind.toUpperCase() : null,
    r.exercise_id ? `on ${r.exercise_id}` : null,
  ].filter(Boolean).join('  ');
  console.log(`  #${r.id}  ${r.date}  ${r.day_title || r.day || ''}  (written ${when})${r.handled ? '  [handled]' : ''}`);
  if (tags) console.log(`      ${tags}`);
  for (const line of String(r.body).split('\n')) console.log(`      ${line}`);
  console.log('');
}
await printStructured();

if (!all) console.log('Act on these, then: node scripts/gym-notes.mjs --handled <id>');

/* An overdue open question exits non-zero, so an agent that runs this before touching /gym (which
 * AGENTS.md requires) cannot walk past a decision that has been waiting on him. */
process.exit(OVERDUE ? 1 : 0);
