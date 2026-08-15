#!/usr/bin/env node
/**
 * Mirrors HealthOS/healthos.db (body_comp, watch_sessions) and HealthOS/swimming-sessions.json
 * into health_body_comp / health_watch_session / health_swim_session in Postgres, so the dashboard
 * does not depend on the laptop being reachable. healthos.db stays canonical; nothing here is
 * re-derived, only copied.
 *
 *   node content/health/sync.mjs [--dry-run]
 *
 * Was `migrate-from-sqlite.mjs`, a name that described a one-time act. It never was one: every
 * statement in here is an upsert keyed on the destination table's primary key, so it has always
 * been safe to re-run. What was missing was anything RUNNING it, which is why /health showed a
 * measurement from 2026-08-09 as the current weight for six days. HealthOS/sync/run-health-sync.ps1
 * is the scheduled counterpart.
 *
 * It also writes a `health_sync` row every time, successful or not. Until it did, the page could not
 * distinguish "he has not weighed himself in three weeks" from "the mirror stopped three weeks
 * ago", and it printed the same sentence for both. Same lesson /music learned from a Spotify token
 * that dies silently: log the run, not only the data.
 *
 * `--dry-run` reads everything, writes nothing, and prints what it would change. Use it before the
 * first real run on a store that holds his actual measurements.
 */
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@neondatabase/serverless';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* Reads .env.local itself rather than expecting the environment to carry it, because the thing
   that runs this is a scheduled task with no shell profile. Parsed here and not sourced, for the
   reason content/curio/sync.mjs records: the file is CRLF, and sourcing it in a shell exports every
   name with a trailing carriage return, so every lookup misses and the failure reads as "no
   connection string". */
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const HEALTHOS_DIR = resolve(import.meta.dirname, '..', '..', '..', 'HealthOS');
const SQLITE_PATH = resolve(HEALTHOS_DIR, 'healthos.db');
const SWIM_JSON_PATH = resolve(HEALTHOS_DIR, 'swimming-sessions.json');

const url = process.env.HEALTH_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('HEALTH_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');

const DRY = process.argv.includes('--dry-run');

const db = new DatabaseSync(SQLITE_PATH, { readOnly: true });
const client = new Client(url);
await client.connect();

/* Counted rather than assumed: a run that writes nothing because sqlite went missing must not look
   like a run that writes nothing because nothing changed. */
const before = DRY
  ? await Promise.all([
      client.query('select count(*)::int n from health_body_comp'),
      client.query('select count(*)::int n from health_watch_session'),
      client.query('select count(*)::int n from health_swim_session'),
    ]).then((r) => r.map((x) => x.rows[0].n))
  : null;

const q = async (text, params) => (DRY ? null : client.query(text, params));

/* Declared out here so the report below can still say how far it got when a run fails halfway,
   which is the run most worth reading. */
let failure = null;
let bodyComp = [];
let watchSessions = [];
let swims = [];
let bcWritten = 0;
let wsWritten = 0;
let swWritten = 0;

try {

// --- body_comp ---------------------------------------------------------------
bodyComp = db.prepare(`
  select date, source, kg, bf_pct, fat_kg, lean_kg, skm_kg, water_kg, bmr_cal, bmi, logged_at
  from body_comp
`).all();
for (const r of bodyComp) {
  await q(
    `insert into health_body_comp (date, source, kg, bf_pct, fat_kg, lean_kg, skm_kg, water_kg, bmr_cal, bmi, logged_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (date, source) do update set
       kg = excluded.kg, bf_pct = excluded.bf_pct, fat_kg = excluded.fat_kg, lean_kg = excluded.lean_kg,
       skm_kg = excluded.skm_kg, water_kg = excluded.water_kg, bmr_cal = excluded.bmr_cal,
       bmi = excluded.bmi, logged_at = excluded.logged_at`,
    [r.date, r.source, r.kg, r.bf_pct, r.fat_kg, r.lean_kg, r.skm_kg, r.water_kg, r.bmr_cal, r.bmi, r.logged_at],
  );
  bcWritten++;
}

// --- watch_sessions (strength + swimming only: the two kinds the dashboard reads) -------------
watchSessions = db.prepare(`
  select date, start_time, kind, minutes, calories, avg_hr from watch_sessions
  where kind in ('strength', 'swimming')
`).all();
for (const r of watchSessions) {
  await q(
    `insert into health_watch_session (date, start_time, kind, minutes, calories, avg_hr)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (start_time, kind) do update set
       date = excluded.date, minutes = excluded.minutes, calories = excluded.calories, avg_hr = excluded.avg_hr`,
    [r.date, r.start_time, r.kind, r.minutes, r.calories, r.avg_hr],
  );
  wsWritten++;
}

db.close();

// --- swim sessions (session-level, from the already-enriched JSON, not the raw CSV) -------------
swims = JSON.parse(readFileSync(SWIM_JSON_PATH, 'utf8'));
for (const s of swims) {
  if (!s.uuid || !s.date) continue;
  const avgHr = s.liveHR?.avg ?? s.csvHR?.mean ?? null;
  await q(
    `insert into health_swim_session (uuid, date, duration_ms, distance_m, pace_per_100m_ms, avg_hr, total_lengths)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (uuid) do update set
       date = excluded.date, duration_ms = excluded.duration_ms, distance_m = excluded.distance_m,
       pace_per_100m_ms = excluded.pace_per_100m_ms, avg_hr = excluded.avg_hr, total_lengths = excluded.total_lengths`,
    [s.uuid, s.date, s.durationMs || null, s.distanceM || null, s.pacePer100mMs || null, avgHr, s.totalLengths || null],
  );
  swWritten++;
}

} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
}

console.log(`${DRY ? '[dry run] ' : ''}body_comp: ${bcWritten} rows (sqlite had ${bodyComp.length})`);
console.log(`${DRY ? '[dry run] ' : ''}watch_session (strength+swimming): ${wsWritten} rows (sqlite had ${watchSessions.length})`);
console.log(`${DRY ? '[dry run] ' : ''}swim_session: ${swWritten} rows (json had ${swims.length})`);

const checks = await Promise.all([
  client.query('select count(*)::int n from health_body_comp'),
  client.query('select count(*)::int n from health_watch_session'),
  client.query('select count(*)::int n from health_swim_session'),
]);
console.log('Postgres row counts now:', checks.map((c) => c.rows[0].n));
if (DRY && before) console.log('Postgres row counts before:', before, '(unchanged, nothing was written)');

/* The run is recorded even when it failed, and especially then: a sync that throws every night is
   the case the page has to be able to see. Not written on a dry run, which is not a sync. */
if (!DRY) {
  await client.query(
    'insert into health_sync (ok, body_rows, watch_rows, swim_rows, error) values ($1,$2,$3,$4,$5)',
    [failure == null, bcWritten, wsWritten, swWritten, failure],
  );
}
await client.end();
if (failure) {
  console.error('sync FAILED:', failure);
  process.exit(1);
}
