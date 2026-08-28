#!/usr/bin/env node
/**
 * What he wrote at the stove and nobody has acted on yet.
 *
 *   node scripts/kitchen-notes.mjs                # unhandled only, questions first
 *   node scripts/kitchen-notes.mjs --all          # everything
 *   node scripts/kitchen-notes.mjs --handled 27   # mark cook_log row 27 as acted on
 *   node scripts/kitchen-notes.mjs --migrate      # add the `handled` column if it is missing
 *
 * WHY THIS EXISTS, and it is the same reason `scripts/gym-notes.mjs` exists.
 *
 * `cook_log` is the only record of what actually happened at the stove: everything else in this app
 * is numbers, and a number cannot say "the pan was too hot when I threw in the sauce". HOODII's
 * CLAUDE.md has required reading it at session start since the table was created, and AGENTS.md
 * repeats it. Both are prose. The gym got a script; the kitchen got a sentence.
 *
 * The 2026-08-26 audit priced the difference (theme T7): nine unhandled gym notes, and one kitchen
 * `kind:"question"` from 2026-08-19 that had been sitting for a week, on a surface whose own route
 * comment reads "a captured question nobody answers is worse than no capture, because it teaches
 * him the control does nothing". Before that, the 2026-08-02 parchment-paper question sat for a
 * week, and that incident is written into `src/app/kitchen/api/note/route.ts` as the reason the box
 * exists at all. Twice is a class.
 *
 * THREE KINDS ARE NOT THE SAME WORK, and the ordering below says so:
 *
 *   question   he asked something. Answer it in the session AND fold the answer into the step, or he
 *              asks again. Per HOODII/CLAUDE.md this one is not optional.
 *   broke      a step is wrong. Fix the step and re-stamp `provenance.readAt` on that recipe, which
 *              `content/kitchen/validate.mjs --strict` will then require you to have actually read.
 *   confusing  the step is technically right and did not reach him. That is a rewrite, not a defence.
 *
 * A rating with a note attached is a debrief and counts as unhandled too: "it got a little bit
 * soggy when I reheated" is a change to a card, not a compliment.
 *
 * Marking is the point. `--handled` is what keeps this from becoming a list nobody can read.
 */
import { neon } from '@neondatabase/serverless';
import { databaseUrl } from './lib/db-url.mjs';

const args = process.argv.slice(2);
const url = databaseUrl();

/* A machine with no connection string is a fresh clone or a CI runner, not a failure, and it must
 * not read as "there are no notes". `guard-live-session.mjs` learned this the hard way: a guard that
 * skips itself while printing a reassuring line is worse than no guard. */
if (!url) {
  console.log('No database URL in the environment or .env.local, so the cook log cannot be read.');
  console.log('This is NOT "no unhandled notes". Set KITCHEN_DATABASE_URL (or GYM_/HEALTH_) and rerun.');
  process.exit(0);
}

const sql = neon(url);

/* The column is added by `content/kitchen/schema.sql`, which is idempotent, but this script is the
 * thing an agent runs at session start on a machine where nobody has applied the schema lately. An
 * `add column if not exists` is additive and cannot lose a row. */
async function ensureColumn() {
  await sql`alter table cook_log add column if not exists handled boolean not null default false`;
}

if (args.includes('--migrate')) {
  await ensureColumn();
  console.log('cook_log.handled is present.');
  process.exit(0);
}

const markIdx = args.indexOf('--handled');
if (markIdx !== -1) {
  const id = Number(args[markIdx + 1]);
  if (!Number.isInteger(id)) {
    console.error('--handled needs a cook_log id, e.g. --handled 27');
    process.exit(1);
  }
  await ensureColumn();
  const rows = await sql`update cook_log set handled = true where id = ${id} returning id, dish, note`;
  console.log(
    rows.length
      ? `marked ${id} handled: ${rows[0].dish} ${String(rows[0].note ?? '').slice(0, 60)}`
      : `no cook_log row with id ${id}`,
  );
  process.exit(0);
}

await ensureColumn();

const all = args.includes('--all');

/* WHAT COUNTS AS NEEDING A RESPONSE. A bare rating with no note is a tick and needs nothing; a row
 * with any note on it, or any `kind`, is him saying something. `kind not in ('nailed')` because the
 * client has sent a rating word into the kind column on four rows and those are ticks, not reports. */
const rows = all
  ? await sql`
      select id, at, dish, rating, kind, note, step, step_of, step_text, handled
        from cook_log order by at desc limit 60`
  : await sql`
      select id, at, dish, rating, kind, note, step, step_of, step_text, handled
        from cook_log
       where handled = false
         and (coalesce(note, '') <> '' or kind is not null)
         and coalesce(kind, '') <> 'nailed'
       order by
         case coalesce(kind, '')
           when 'question'  then 0
           when 'broke'     then 1
           when 'confusing' then 2
           else 3
         end,
         at desc
       limit 60`;

if (!rows.length) {
  console.log(all ? 'The cook log is empty.' : 'No unhandled notes in the cook log.');
  process.exit(0);
}

const KIND_WORK = {
  question: 'ANSWER IT in this session, then write the answer into the step. He must not ask twice.',
  broke: 'FIX THE STEP, then re-stamp provenance.readAt on that recipe.',
  confusing: 'REWRITE THE STEP. It was technically right and did not reach him.',
};

console.log(`${rows.length} ${all ? 'cook log row(s)' : 'UNHANDLED note(s)'}, questions first:\n`);
let questions = 0;
/* `new Date(...).toISOString()` and not `String(at).slice(0,16).replace('T',' ')`, which is what
 * gym-notes.mjs does and what this file copied on its first run. The Neon driver hands back a JS
 * Date here, whose `String()` is "Tue Aug 11 2026 ...", so slicing sixteen characters and replacing
 * the first "T" ate the T in "Tue" and printed "( ue Aug 11 2026 )". Caught by reading the output
 * rather than the code, on the first run, which is the cheap version of the same lesson. */
const stamp = (at) => {
  const d = at instanceof Date ? at : new Date(String(at));
  return Number.isNaN(d.getTime()) ? String(at) : d.toISOString().slice(0, 16).replace('T', ' ');
};

for (const r of rows) {
  const when = stamp(r.at);
  const kind = r.kind ?? (r.rating ? `rated ${r.rating}` : 'note');
  if (r.kind === 'question') questions++;
  const step = r.step ? `  step ${r.step}${r.step_of ? ` of ${r.step_of}` : ''}` : '';
  console.log(`  #${r.id}  [${kind}]  ${r.dish}${step}   (${when})${r.handled ? '  [handled]' : ''}`);
  for (const line of String(r.note ?? '').split('\n')) {
    for (const wrapped of line.match(/.{1,94}(\s|$)/g) || [line]) {
      if (wrapped.trim()) console.log(`       ${wrapped.trim()}`);
    }
  }
  if (r.step_text) console.log(`       the step said: "${String(r.step_text).slice(0, 160)}"`);
  const work = KIND_WORK[r.kind];
  if (work && !r.handled) console.log(`       -> ${work}`);
  console.log('');
}

if (!all) {
  console.log('-'.repeat(70));
  if (questions) {
    console.log(`${questions} of these is a QUESTION. Answering it in chat is half the job: the other half is`);
    console.log('folding the answer into the step, because the step is where he will be next time.');
  }
  console.log('When one is dealt with: node scripts/kitchen-notes.mjs --handled <id>');
}

/* DELIBERATELY EXITS ZERO, unlike gym-notes.mjs on an overdue open question.
 *
 * That script exits non-zero because an `open` row carries a DUE DATE he agreed to. These rows carry
 * no deadline, and a backlog of nineteen historical notes that turns every pre-push hook red is a
 * check somebody deletes in a hurry. The signal here is the list, not the exit code. If a due-dated
 * kitchen question is ever wanted, it belongs in an `open` row on the recipe, the same shape the gym
 * uses, and then the validator can gate its structure. */
process.exit(0);
