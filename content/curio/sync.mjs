/* Mirror CuriosityOS into Postgres so /curio can read it.
 *
 *   node content/curio/sync.mjs [path-to-CuriosityOS]
 *
 * One-way. CuriosityOS/log.md remains the ledger and the only thing sessions append to; this
 * pushes a read model to Neon. Safe to run repeatedly: everything is an upsert keyed on a stable
 * id, so re-running after the daily digest job just refreshes Status/Sent.
 *
 * Run it AFTER the digest task, from the same wrapper, or /curio goes stale and becomes another
 * thing that got built and never opened.
 *
 * The digest `pile` (ReadLater links) is intentionally dropped. See schema.sql for why.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { neon } from '@neondatabase/serverless';

/* Same .env.local reason as apply-schema.mjs: CRLF makes shell sourcing export names with a
 * trailing \r, so every lookup misses and the failure looks like "no connection string". */
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const ROOT = process.argv[2] || join(process.cwd(), '..', 'CuriosityOS');
const url =
  process.env.CURIO_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('CURIO_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');
const sql = neon(url);

/* A stable id per question. The ledger has no id column, and questions are the only thing that
 * does not change across runs, so the slug IS the key. Truncated because some questions are long,
 * with a short hash appended so two questions sharing a first 60 characters cannot collide. */
function idFor(question) {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  let h = 0;
  for (const ch of question) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `${slug}-${(h >>> 0).toString(36)}`;
}

function parseLedger(text) {
  const rows = [];
  /* CANDIDATES ARE COUNTED, NOT JUST SURVIVORS. Added 2026-08-28 per 05-small-apps C2.
   *
   * The two `continue`s below drop a malformed row silently, and the only guard on the whole script
   * was `if (!items.length) throw`. So a column added to log.md, or a formatting slip in half the
   * rows, synced the surviving half and printed a success line: correct-looking data, silently
   * starved, which is the half-extracted-export class AGENTS.md documents at length. The rule
   * `fetch-award-sources.mjs` already encodes is the right one, in its own words: refuse to write a
   * source whose parse dropped more rows than it kept.
   *
   * A candidate is a pipe row whose first cell is a date, which is what a ledger row looks like
   * before anything is read off it. That separates "this line is not a row" (headers, separators,
   * prose) from "this line IS a row and I could not read it", and only the second is news. */
  let candidates = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(cells[0] ?? '')) candidates += 1;
    if (cells.length < 8) continue;
    const [logged, question, answer, flavor, source, origin, status, sent] = cells;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logged)) continue; // header and separator rows

    let sourceKind = 'model';
    let sourceUrl = null;
    if (source.startsWith('verified:')) {
      sourceKind = 'verified';
      sourceUrl = source.slice('verified:'.length).trim() || null;
    } else if (source === 'verify') {
      sourceKind = 'verify';
    }

    const sentDates = sent
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

    rows.push({
      id: idFor(question), logged, question, answer, flavor,
      sourceKind, sourceUrl, origin, status, sentDates,
    });
  }
  return { rows, candidates };
}

const FORCE = process.argv.includes('--force');

const ledgerPath = join(ROOT, 'log.md');
if (!existsSync(ledgerPath)) throw new Error(`no ledger at ${ledgerPath}`);
const { rows: items, candidates } = parseLedger(readFileSync(ledgerPath, 'utf8'));
if (!items.length) throw new Error('parsed 0 rows from log.md, refusing to write');

/* GATE 1: THE PARSE KEPT MOST OF WHAT IT SAW. See parseLedger for the incident class. A 95% floor
 * rather than 100%, because one hand-typed row with a stray pipe in an answer is a real and harmless
 * thing that should not block a sync; half the file going missing is not. */
const kept = candidates ? items.length / candidates : 1;
if (candidates && kept < 0.95 && !FORCE) {
  throw new Error(
    `PARSE DROPPED TOO MUCH of ${ledgerPath}\n`
    + `  date-shaped rows seen: ${candidates}\n`
    + `  rows parsed:           ${items.length}   (${Math.round((1 - kept) * 100)}% dropped)\n\n`
    + `  A partial parse writes cleanly and looks complete. The usual cause is a column added to\n`
    + `  log.md, which shifts every cell after it. Check the table's header against the eight cells\n`
    + `  parseLedger destructures before doing anything else.\n\n`
    + `  Rerun with --force if the drop is genuinely correct.`,
  );
}

/* GATE 2: THE LEDGER ONLY GROWS, so the mirror only grows. 05-small-apps C2's second half.
 * A ledger row is never deleted in normal use (a retired one carries status=retired and stays), so
 * fewer parsed rows than the mirror already holds means the SOURCE is thin, not that the archive is.
 * Same contract as HealthOS/guard-regen.mjs and ReadingOS/scripts/lib/guard-regen.mjs, stated in the
 * same words: a regeneration may not shrink an accumulated artifact. */
const [before] = await sql`select count(*)::int n from curio_items`;
if (before?.n && items.length < before.n && !FORCE) {
  throw new Error(
    `REFUSING TO SHRINK the curio mirror\n`
    + `  curio_items holds: ${before.n}\n`
    + `  log.md parses to:  ${items.length}\n\n`
    + `  The ledger accumulates and rows are retired rather than deleted, so this means the parse or\n`
    + `  the file is short. Rerun with --force if rows really were removed from log.md.`,
  );
}

for (const it of items) {
  await sql`
    insert into curio_items
      (id, logged, question, answer, flavor, source_kind, source_url, origin, status, sent_dates, updated_at)
    values
      (${it.id}, ${it.logged}, ${it.question}, ${it.answer}, ${it.flavor}, ${it.sourceKind},
       ${it.sourceUrl}, ${it.origin}, ${it.status}, ${it.sentDates}, now())
    on conflict (id) do update set
      logged = excluded.logged, question = excluded.question, answer = excluded.answer,
      flavor = excluded.flavor, source_kind = excluded.source_kind, source_url = excluded.source_url,
      origin = excluded.origin, status = excluded.status, sent_dates = excluded.sent_dates,
      updated_at = now()`;
}

/* WHAT THE LEDGER NO LONGER CARRIES GETS DELETED. Added 2026-08-28 per 05-small-apps C1.
 *
 * `idFor` keys on the QUESTION TEXT, and the loop above only ever upserts. So changing one word of a
 * question in CuriosityOS/log.md inserted a new row and left the old one behind, and /curio then
 * showed both versions publicly while "N answered" drifted above the ledger's own row count. A row
 * deleted from the ledger was unreachable forever: `getItems` filters `status <> 'retired'`, which
 * only works while the row still exists in log.md to carry that status.
 *
 * That is the divergence a one-way mirror accumulates, and the fix has to be a delete, because the
 * ledger is the source and the mirror is not allowed its own opinions.
 *
 * ORDER MATTERS: this runs AFTER the upserts, so the ids that just landed are in the keep set, and
 * after the two gates above, so a broken parse cannot arrive here looking like a mass deletion. The
 * gates are the reason a delete is safe to write at all. */
const keep = items.map((i) => i.id);
const removed = await sql`
  delete from curio_items where id <> all(${keep}::text[]) returning id, question`;
if (removed.length) {
  console.log(`curio sync: removed ${removed.length} row(s) no longer in the ledger:`);
  for (const r of removed) console.log(`  - ${String(r.question).slice(0, 80)}`);
}

const outbox = join(ROOT, 'digest', 'outbox');
let digests = 0;
if (existsSync(outbox)) {
  for (const f of readdirSync(outbox).filter((f) => f.endsWith('.json'))) {
    const day = basename(f, '.json');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue; // skips e.g. 2026-07-14-format-test
    let d;
    try {
      d = JSON.parse(readFileSync(join(outbox, f), 'utf8'));
    } catch {
      console.warn(`skipped unparseable ${f}`);
      continue;
    }
    if (!d.subject) continue;
    await sql`
      insert into curio_digests (day, subject, opener, fresh, recall, still_chasing, updated_at)
      values (${day}, ${d.subject}, ${d.opener ?? null},
              ${JSON.stringify(d.fresh ?? [])}::jsonb,
              ${JSON.stringify(d.recall ?? [])}::jsonb,
              ${JSON.stringify(d.stillChasing ?? [])}::jsonb, now())
      on conflict (day) do update set
        subject = excluded.subject, opener = excluded.opener, fresh = excluded.fresh,
        recall = excluded.recall, still_chasing = excluded.still_chasing, updated_at = now()`;
    digests += 1;
  }
}

/* OUTCOMES, not intent (law 3). The counts and the drop rate, so a future run's numbers can be
 * compared against this one rather than against a word like "ok". */
console.log(
  `curio sync: ${items.length} items (${candidates} date-shaped rows seen, ${candidates - items.length} dropped), `
  + `${removed.length} removed, ${digests} digests`,
);
