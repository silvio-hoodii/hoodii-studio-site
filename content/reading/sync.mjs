#!/usr/bin/env node
/**
 * Mirrors ReadingOS/data/queue.json and ReadingOS/data/acquire.json into reading_queue_entry /
 * reading_acquisition_entry, so /reading does not depend on the laptop being reachable. Both files
 * stay canonical; refill.mjs and acquire.mjs stay on the laptop, for the reason schema.sql records
 * (acquire.mjs needs Silvio's own logged-in Chrome over CDP, which cannot run on Vercel).
 *
 *   node content/reading/sync.mjs [--dry-run]
 *
 * Run by hand after `node scripts/refill.mjs` and/or `node scripts/acquire.mjs` in ReadingOS --
 * decided manual-to-start on 2026-08-20 rather than a cron, since acquire.mjs can't run unattended
 * anyway and the queue itself only changes when a book gets ticked off.
 *
 * Full replace, in a transaction, for both tables -- same reasoning as content/swim/sync.mjs:
 * queue.json is regenerated whole by refill.mjs, so a book that has dropped out of the ten has
 * genuinely left it, and an upsert-only sync would leave stale entries behind forever.
 */
import { Client } from '@neondatabase/serverless';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DRY = process.argv.includes('--dry-run');

const QUEUE_PATH = resolve(import.meta.dirname, '..', '..', '..', 'ReadingOS', 'data', 'queue.json');
const ACQUIRE_PATH = resolve(import.meta.dirname, '..', '..', '..', 'ReadingOS', 'data', 'acquire.json');

const url =
  process.env.READING_DATABASE_URL || process.env.SWIM_DATABASE_URL ||
  process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('READING_DATABASE_URL (or SWIM_DATABASE_URL / GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');

/** Does any branch row say AVAILABLE at one of his two real branches, right now. */
function homeBranchNow(entry) {
  const branches = entry?.branchInfo?.ok ? entry.branchInfo.branches ?? [] : [];
  const hit = branches.find((b) => b.homeBranch && b.status === 'Available');
  return { label: hit?.homeBranch ?? null, now: !!hit };
}

const client = new Client(url);
await client.connect();

let failure = null;
let queueRows = 0;
let acquisitionRows = 0;
let queueUpdated = null;
let acquireGenerated = null;

try {
  if (!existsSync(QUEUE_PATH)) throw new Error(`queue.json not found at ${QUEUE_PATH}`);
  const queue = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  const entries = queue.entries ?? [];

  // Refuses to write on zero, the way content/swim/sync.mjs does. A parse regression that yields
  // an empty queue must not empty the mirror and show ten blank rows.
  if (!entries.length) throw new Error('queue.json parsed 0 entries, refusing to write');
  queueUpdated = queue.updated ?? null;

  const hasAcquire = existsSync(ACQUIRE_PATH);
  const acquire = hasAcquire ? JSON.parse(readFileSync(ACQUIRE_PATH, 'utf8')) : null;
  const acquireByKey = new Map((acquire?.entries ?? []).map((e) => [e.key, e]));
  acquireGenerated = acquire?.generated ?? null;

  // queue.json's own array order is the SELECTION order (which pass picked each book), not the
  // order QUEUE.md actually renders. refill.mjs computes a separate `displayed` sort for the
  // page a human reads -- reading-status first, then gentlest-pace-first so slot 2 is never a
  // brick -- and never writes that order back into queue.json. Mirroring queue.json's raw array
  // order here reproduced that mismatch: /reading kept showing Middlesex first by array position
  // even after its status changed back to unread, while QUEUE.md had already re-sorted it lower.
  // Same sort, copied from refill.mjs, so /reading matches what he actually sees in Obsidian.
  const paceRank = { propulsive: 0, steady: 1, demanding: 2 };
  const heavy = (e) => (e.pages ?? 0) >= 600 || e.pace === 'demanding';
  const displayed = [...entries].sort((a, b) =>
    (a.status === 'reading' ? 0 : 1) - (b.status === 'reading' ? 0 : 1)
    || (heavy(a) ? 1 : 0) - (heavy(b) ? 1 : 0)
    || (paceRank[a.pace] ?? 1) - (paceRank[b.pace] ?? 1)
    || (a.pages ?? 400) - (b.pages ?? 400));

  if (!DRY) {
    await client.query('begin');
    await client.query('delete from reading_acquisition_entry');
    await client.query('delete from reading_queue_entry');

    for (const [i, e] of displayed.entries()) {
      await client.query(
        `insert into reading_queue_entry
           (key, position, title, author, year, status, track, score, categories, lists, pace,
            pace_note, pages, era, language, mood, format, why, picked_via, note, added, started,
            finished, rating)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [
          e.key, i, e.title, e.author, e.year ?? null, e.status, e.track, e.score ?? null,
          e.categories ?? [], e.lists ?? [], e.pace ?? null, e.pace_note ?? null, e.pages ?? null,
          e.era ?? null, e.language ?? null, e.mood ?? [], e.format ?? null, e.why ?? null,
          e.picked_via ?? null, e.note ?? null, e.added ?? null, e.started ?? null,
          e.finished ?? null, e.rating ?? null,
        ],
      );
      queueRows++;

      const a = acquireByKey.get(e.key);
      if (a) {
        const { label, now } = homeBranchNow(a);
        await client.query(
          `insert into reading_acquisition_entry
             (key, verdict, verdict_detail, checked_at, home_branch_label, home_branch_now, payload)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [e.key, a.verdict, a.verdictDetail ?? null, acquireGenerated, label, now, JSON.stringify(a)],
        );
        acquisitionRows++;
      }
    }

    const [{ n }] = (await client.query('select count(*)::int n from reading_queue_entry')).rows;
    if (n !== queueRows) {
      throw new Error(`${queueRows} entries in the payload but ${n} rows written: ${queueRows - n} collided on key.`);
    }

    await client.query('commit');
  } else {
    queueRows = entries.length;
    acquisitionRows = [...acquireByKey.keys()].filter((k) => entries.some((e) => e.key === k)).length;
  }
} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
  if (!DRY) {
    try { await client.query('rollback'); } catch { /* nothing was open */ }
  }
  queueRows = 0;
  acquisitionRows = 0;
}

console.log(`${DRY ? '[dry run] ' : ''}reading_queue_entry: ${queueRows} rows`);
console.log(`${DRY ? '[dry run] ' : ''}reading_acquisition_entry: ${acquisitionRows} rows`);
console.log(`${DRY ? '[dry run] ' : ''}queue updated ${queueUpdated ?? 'unknown'}, acquisition generated ${acquireGenerated ?? 'not synced'}`);

if (!DRY) {
  await client.query(
    `insert into reading_sync (ok, queue_updated, acquire_generated, queue_rows, acquisition_rows, error)
     values ($1,$2,$3,$4,$5,$6)`,
    [failure == null, queueUpdated, acquireGenerated, queueRows, acquisitionRows, failure],
  );
}
await client.end();
if (failure) {
  console.error('reading sync FAILED:', failure);
  process.exit(1);
}
