#!/usr/bin/env node
/**
 * Mirrors SwimOS/wedge/app/data/schedule.json into swim_session / swim_coverage / swim_pool, so
 * /swim does not depend on the laptop being reachable. schedule.json stays canonical; the six
 * scrapers that write it stay on the laptop, for the reason recorded in schema.sql.
 *
 *   node content/swim/sync.mjs [--dry-run]
 *
 * Called from SwimOS/daily.mjs right after the scrape, inside the existing HOODII-SwimOS-Daily task
 * at 05:30. That slot is already clear of HOODII-Health-Sync (07:15) and the curiosity digest
 * (09:00), so the three jobs that touch Neon do not collide on the free tier.
 *
 * Every statement is an upsert keyed on the destination table's primary key, so re-running is safe.
 * It writes a swim_sync row every time, successful or not, because the absence of an error is the
 * failure mode: a scheduled task that stopped firing looks exactly like a quiet night unless the
 * successful runs are recorded.
 */
import { Client } from '@neondatabase/serverless';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* Reads .env.local itself rather than expecting the environment to carry it, because the thing that
   runs this is a scheduled task with no shell profile. Parsed and not sourced, for the reason
   content/curio/sync.mjs records: the file is CRLF, and sourcing it exports every name with a
   trailing carriage return, so every lookup misses and the failure reads as "no connection
   string". */
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const SCHEDULE_PATH = resolve(
  import.meta.dirname, '..', '..', '..', 'SwimOS', 'wedge', 'app', 'data', 'schedule.json',
);

const url = process.env.SWIM_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('SWIM_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');

const DRY = process.argv.includes('--dry-run');

const client = new Client(url);
await client.connect();

let failure = null;
let sessionRows = 0;
let coverageRows = 0;
let poolRows = 0;
let generated = null;
let coversThrough = null;

try {
  if (!existsSync(SCHEDULE_PATH)) throw new Error(`schedule.json not found at ${SCHEDULE_PATH}`);
  const payload = JSON.parse(readFileSync(SCHEDULE_PATH, 'utf8'));

  const sessions = payload.sessions ?? [];
  const coverage = payload.coverage ?? [];
  const coords = payload.coords ?? {};

  /* Refuses to write on zero, the way content/curio/sync.mjs does. A scrape regression that yields
     an empty array must not empty the mirror: the page would then show "no lane swim listed" for
     every pool in Calgary, which is a confident lie rather than a visible fault. Leaving yesterday's
     rows in place and failing loudly is strictly better, because swim_sync then carries the reason
     and the page says the data is behind. */
  if (!sessions.length) throw new Error('schedule.json parsed 0 sessions, refusing to write');
  if (!coverage.length) throw new Error('schedule.json parsed 0 coverage rows, refusing to write');

  generated = payload.generated ?? null;
  coversThrough = sessions.reduce((max, s) => (s.date > max ? s.date : max), '');

  if (!DRY) {
    /* Replace rather than merge. The scrapers regenerate a rolling seven-day window from scratch,
       so a session that has vanished from the source has genuinely been cancelled or has fallen off
       the back of the window, and either way it must not survive here. An upsert alone would leave
       last week's rows behind forever and the timetable would slowly fill with sessions that are
       not happening.

       Deleting first inside the same connection, after the zero-row guard above has already passed,
       so the window where the table is empty is milliseconds and only ever opens on a payload we
       have already decided is good. */
    await client.query('delete from swim_session');
    for (const s of sessions) {
      await client.query(
        `insert into swim_session (pool, activity, date, start, "end", op, detail, spaces, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (pool, activity, date, start, "end") do update set
           op = excluded.op, detail = excluded.detail,
           spaces = excluded.spaces, note = excluded.note`,
        [s.pool, s.activity, s.date, s.start, s.end, s.op, s.detail ?? null, s.spaces ?? null, s.note ?? null],
      );
      sessionRows++;
    }

    for (const c of coverage) {
      await client.query(
        `insert into swim_coverage (name, op, area, status, note) values ($1,$2,$3,$4,$5)
         on conflict (name) do update set
           op = excluded.op, area = excluded.area, status = excluded.status, note = excluded.note`,
        [c.name, c.op, c.area ?? null, c.status, c.note ?? null],
      );
      coverageRows++;
    }

    for (const [name, p] of Object.entries(coords)) {
      await client.query(
        `insert into swim_pool (name, lat, lng, len) values ($1,$2,$3,$4)
         on conflict (name) do update set lat = excluded.lat, lng = excluded.lng, len = excluded.len`,
        [name, p.lat ?? null, p.lng ?? null, p.len ?? null],
      );
      poolRows++;
    }
  } else {
    sessionRows = sessions.length;
    coverageRows = coverage.length;
    poolRows = Object.keys(coords).length;
  }
} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
}

console.log(`${DRY ? '[dry run] ' : ''}swim_session: ${sessionRows} rows`);
console.log(`${DRY ? '[dry run] ' : ''}swim_coverage: ${coverageRows} rows`);
console.log(`${DRY ? '[dry run] ' : ''}swim_pool: ${poolRows} rows`);
console.log(`${DRY ? '[dry run] ' : ''}scraped ${generated ?? 'unknown'}, covers through ${coversThrough || 'nothing'}`);

/* Recorded even when it failed, and especially then. Not written on a dry run, which is not a sync. */
if (!DRY) {
  await client.query(
    `insert into swim_sync (ok, generated, covers_through, session_rows, coverage_rows, error)
     values ($1,$2,$3,$4,$5,$6)`,
    [failure == null, generated, coversThrough, sessionRows, coverageRows, failure],
  );
}
await client.end();
if (failure) {
  console.error('swim sync FAILED:', failure);
  process.exit(1);
}
