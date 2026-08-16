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

/* The key the source does not give us. Every field that can distinguish two real sessions goes in,
   including detail and note: MNP runs its North and South pools in the same hour and Seton runs two
   lane configurations in the same hour, and without those two fields each pair collapses into one
   row. `op` is deliberately OUT, because it is a property of who published the schedule rather than
   of the swim, and a scraper renaming itself must not duplicate every session it owns.
   Unit-separator joins rather than a pipe, since a pool called "Village Square | Leisure" would
   otherwise be able to forge another pool's id. */
const sessionId = (s) =>
  [s.pool, s.activity, s.date, s.start, s.end, s.detail ?? '', s.note ?? ''].join('');

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

       IN A TRANSACTION, and this is not belt and braces. Without it, a connection dropped partway
       through the insert loop leaves a HALF-WRITTEN timetable, and the page has no way to see that.
       Liveness reads the newest row where ok = true, so it would still be reading yesterday's
       successful run: `covers_through` still reaches today, `generated` is still recent, and both
       alarms stay silent over a table missing four hundred sessions. The page would quietly report
       a city with almost no lane swim, which is the exact failure the two-alarm design exists to
       prevent, arriving through the one door the alarms cannot watch. Either the whole window
       lands or none of it does and yesterday's rows survive intact. */
    await client.query('begin');
    await client.query('delete from swim_session');
    for (const s of sessions) {
      await client.query(
        `insert into swim_session (id, pool, activity, date, start, "end", op, detail, spaces, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (id) do update set
           op = excluded.op, spaces = excluded.spaces`,
        [sessionId(s), s.pool, s.activity, s.date, s.start, s.end, s.op, s.detail ?? null, s.spaces ?? null, s.note ?? null],
      );
      sessionRows++;
    }

    /* Counted, not assumed. `sessionRows` is loop iterations, and the two are only equal while no
       two sessions share an id. They were not equal on the first run here: 439 in, 437 rows out,
       and nothing said so. Comparing them is what turns a silent merge into a visible one. */
    const [{ n }] = (await client.query('select count(*)::int n from swim_session')).rows;
    if (n !== sessionRows) {
      throw new Error(`${sessionRows} sessions in the payload but ${n} rows written: ${sessionRows - n} collided on id, which means real sessions were lost. Widen sessionId().`);
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
    await client.query('commit');
  } else {
    sessionRows = sessions.length;
    coverageRows = coverage.length;
    poolRows = Object.keys(coords).length;
  }
} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
  /* Roll back before anything else touches this connection. Postgres refuses every statement in a
     failed transaction until it is closed, so without this the swim_sync insert below would itself
     fail and the run would leave no record of why it died. Wrapped, because rollback outside a
     transaction is only a warning and must not replace the real error. */
  if (!DRY) {
    try { await client.query('rollback'); } catch { /* nothing was open */ }
  }
  /* Row counts describe what was WRITTEN, and after a rollback nothing was. Reporting the loop's
     progress here would print "312 rows" for a run that wrote none. */
  sessionRows = 0;
  coverageRows = 0;
  poolRows = 0;
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
