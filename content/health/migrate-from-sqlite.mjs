#!/usr/bin/env node
/**
 * Mirrors HealthOS/healthos.db (body_comp, watch_sessions) and HealthOS/swimming-sessions.json
 * into health_body_comp / health_watch_session / health_swim_session in Postgres, so the dashboard
 * does not depend on the laptop being reachable. healthos.db stays canonical; nothing here is
 * re-derived, only copied.
 *
 * Run after any Samsung Health export refresh (parse-body-metrics.js, parse-swimming.js,
 * server/migrate-body-comp.mjs, server/import-watch-sessions.mjs have already run):
 *   HEALTH_DATABASE_URL=... node content/health/migrate-from-sqlite.mjs
 * Idempotent: upsert keys match each table's primary key.
 */
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HEALTHOS_DIR = resolve(import.meta.dirname, '..', '..', '..', 'HealthOS');
const SQLITE_PATH = resolve(HEALTHOS_DIR, 'healthos.db');
const SWIM_JSON_PATH = resolve(HEALTHOS_DIR, 'swimming-sessions.json');

const url = process.env.HEALTH_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!url) throw new Error('HEALTH_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL) not set');

const db = new DatabaseSync(SQLITE_PATH, { readOnly: true });
const client = new Client(url);
await client.connect();

// --- body_comp ---------------------------------------------------------------
const bodyComp = db.prepare(`
  select date, source, kg, bf_pct, fat_kg, lean_kg, skm_kg, water_kg, bmr_cal, bmi, logged_at
  from body_comp
`).all();
let bcWritten = 0;
for (const r of bodyComp) {
  await client.query(
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

// --- watch_sessions (strength + swimming only — the two kinds the dashboard reads) -------------
const watchSessions = db.prepare(`
  select date, start_time, kind, minutes, calories, avg_hr from watch_sessions
  where kind in ('strength', 'swimming')
`).all();
let wsWritten = 0;
for (const r of watchSessions) {
  await client.query(
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
const swims = JSON.parse(readFileSync(SWIM_JSON_PATH, 'utf8'));
let swWritten = 0;
for (const s of swims) {
  if (!s.uuid || !s.date) continue;
  const avgHr = s.liveHR?.avg ?? s.csvHR?.mean ?? null;
  await client.query(
    `insert into health_swim_session (uuid, date, duration_ms, distance_m, pace_per_100m_ms, avg_hr, total_lengths)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (uuid) do update set
       date = excluded.date, duration_ms = excluded.duration_ms, distance_m = excluded.distance_m,
       pace_per_100m_ms = excluded.pace_per_100m_ms, avg_hr = excluded.avg_hr, total_lengths = excluded.total_lengths`,
    [s.uuid, s.date, s.durationMs || null, s.distanceM || null, s.pacePer100mMs || null, avgHr, s.totalLengths || null],
  );
  swWritten++;
}

console.log(`body_comp: ${bcWritten} rows (sqlite had ${bodyComp.length})`);
console.log(`watch_session (strength+swimming): ${wsWritten} rows (sqlite had ${watchSessions.length})`);
console.log(`swim_session: ${swWritten} rows (json had ${swims.length})`);
const checks = await Promise.all([
  client.query('select count(*) from health_body_comp'),
  client.query('select count(*) from health_watch_session'),
  client.query('select count(*) from health_swim_session'),
]);
console.log('Postgres row counts now:', checks.map((c) => c.rows[0].count));
await client.end();
