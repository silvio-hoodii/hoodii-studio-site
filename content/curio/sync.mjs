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
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
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
  return rows;
}

const ledgerPath = join(ROOT, 'log.md');
if (!existsSync(ledgerPath)) throw new Error(`no ledger at ${ledgerPath}`);
const items = parseLedger(readFileSync(ledgerPath, 'utf8'));
if (!items.length) throw new Error('parsed 0 rows from log.md, refusing to write');

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

console.log(`curio sync: ${items.length} items, ${digests} digests`);
