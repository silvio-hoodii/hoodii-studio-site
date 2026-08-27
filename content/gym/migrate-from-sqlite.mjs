#!/usr/bin/env node
/**
 * One-time migration of real training history from HealthOS/healthos.db (node:sqlite) into the
 * gym_session / gym_set Postgres tables. Nothing is re-derived or reset: every logged set, exactly
 * as typed, moves over. This is the step that makes the migration safe to actually use: the laptop
 * app can keep running until this has been verified, and cutting over does not cost him his log.
 *
 * Run: GYM_DATABASE_URL=... node content/gym/migrate-from-sqlite.mjs
 * Idempotent: re-running is safe, upsert-by-(date, exercise_id, set_idx) matches gym_set's own key.
 */
import { DatabaseSync } from 'node:sqlite';
import { Client } from '@neondatabase/serverless';
import { resolve } from 'node:path';

const SQLITE_PATH = resolve(import.meta.dirname, '..', '..', '..', 'HealthOS', 'healthos.db');
const url = process.env.GYM_DATABASE_URL;
if (!url) throw new Error('GYM_DATABASE_URL not set');

const db = new DatabaseSync(SQLITE_PATH, { readOnly: true });
const client = new Client(url);
await client.connect();

const sessions = db.prepare('select date, day, day_title, started_at, finished_at, status from sessions').all();
let sessionsWritten = 0;
for (const s of sessions) {
  await client.query(
    `insert into gym_session (date, day, day_title, started_at, finished_at, status)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (date, day) do update set
       day_title = coalesce(excluded.day_title, gym_session.day_title),
       finished_at = coalesce(excluded.finished_at, gym_session.finished_at),
       status = excluded.status`,
    [s.date, s.day, s.day_title, s.started_at, s.finished_at, s.status],
  );
  sessionsWritten++;
}

const sets = db.prepare(`
  select date, day, exercise_id, exercise_name, set_idx, weight, reps, done, swapped_from,
    logged_at, suggested_weight, suggested_reps, estimated
  from sets
`).all();
let setsWritten = 0;
for (const s of sets) {
  await client.query(
    `insert into gym_set (date, day, exercise_id, exercise_name, set_idx, weight, reps, done,
       swapped_from, logged_at, suggested_weight, suggested_reps, estimated)
     /* THIRTEEN, not fourteen. Dropping the rir column on 2026-08-27 removed a value from the
        array below and left this list one long, which Postgres reports as a bind mismatch rather
        than filling it with null. Count these against the array whenever a column moves. */
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (date, exercise_id, set_idx) do update set
       exercise_name = excluded.exercise_name, day = excluded.day, weight = excluded.weight,
       reps = excluded.reps, done = excluded.done,
       swapped_from = excluded.swapped_from, logged_at = excluded.logged_at,
       suggested_weight = excluded.suggested_weight, suggested_reps = excluded.suggested_reps,
       estimated = excluded.estimated`,
    [
      s.date, s.day, s.exercise_id, s.exercise_name, s.set_idx, s.weight, s.reps,
      !!s.done, s.swapped_from, s.logged_at, s.suggested_weight, s.suggested_reps, !!s.estimated,
    ],
  );
  setsWritten++;
}

db.close();

const check = await client.query('select count(*) from gym_set');
console.log(`sessions migrated: ${sessionsWritten} (sqlite had ${sessions.length})`);
console.log(`sets migrated: ${setsWritten} (sqlite had ${sets.length})`);
console.log(`gym_set row count in Postgres now: ${check.rows[0].count}`);
await client.end();
