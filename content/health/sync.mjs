#!/usr/bin/env node
/**
 * Mirrors HealthOS/healthos.db (body_comp, watch_sessions, recovery_freshness, swim_pb,
 * session_detail), HealthOS/swimming-sessions.json and HealthOS/swim-laps.json into the health_*
 * tables in Postgres, so the dashboard does not depend on the laptop being reachable. healthos.db
 * stays canonical; nothing here is re-derived, only copied.
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
const SWIM_LAPS_PATH = resolve(HEALTHOS_DIR, 'swim-laps.json');
const CURRENT_JSON_PATH = resolve(HEALTHOS_DIR, 'current.json');

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
      client.query('select count(*)::int n from health_swim_length'),
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
let targetWritten = 0;
let recWritten = 0;
let pbWritten = 0;
let detailWritten = 0;
let laps = [];
let lapWritten = 0;

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

/* --- watch_sessions: EVERY training kind, walking excluded ------------------------------------
 *
 * Was `kind in ('strength','swimming')`, which is why no run or bike has ever reached this site.
 * He ran on 2026-08-18 and biked on 2026-08-19, both prescribed by /gym/conditioning, and both were
 * invisible here. That is not cosmetic: the week surface counts CONSECUTIVE TRAINING DAYS against
 * the max-of-3 rule, so a morning-run-only day arrived as a rest day and the count came out wrong in
 * the direction that matters, reporting more recovery than he took.
 *
 * An allowlist is the wrong shape for the same reason it was wrong in import-watch-sessions.mjs: it
 * fails silently and in the reassuring direction when he takes up something new. Excluding walking
 * by name inverts that. A kind nobody anticipated now arrives and counts, and the thing that has to
 * be maintained is the short list of what is NOT training rather than the open list of what is. */
watchSessions = db.prepare(`
  select date, start_time, kind, minutes, calories, avg_hr from watch_sessions
  where kind <> 'walking'
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

/* A SESSION RENAMED IS A SESSION DUPLICATED, because the key is (start_time, kind) and an upsert
   under a new name inserts beside the old row rather than replacing it. Nothing here ever deleted,
   so the mirror could only grow.
   Found 2026-08-22, splitting Samsung's type 0 into `other` (he pressed start and picked "Other
   workout") and `other-auto` (the watch invented it ten minutes in). sqlite held 1787 rows and the
   run reported 1787 written; Postgres came out at 1874. Every one of those 87 sessions was in the
   week strip twice. The run's own success line said nothing, which is why the two stores are
   compared below rather than trusted. */
if (watchSessions.length) {
  const res = await q(
    `delete from health_watch_session hws
      where exists (
        select 1 from unnest($1::text[], $2::text[]) as s(start_time, kind)
         where s.start_time = hws.start_time and s.kind <> hws.kind
      )`,
    [watchSessions.map((r) => r.start_time), watchSessions.map((r) => r.kind)],
  );
  if (res?.rowCount) console.log(`watch_session: dropped ${res.rowCount} rows filed under a kind this build no longer gives them`);
}

/* --- recovery freshness ----------------------------------------------------------------------
 * One row per metric, and the week surface refuses to present its rest-day arithmetic as a recovery
 * judgment while these are old. `if exists` rather than a hard read: an older healthos.db that
 * predates the table must not fail the whole mirror, which also carries his weight. */
const hasRecovery = db
  .prepare(`select count(*) c from sqlite_master where type = 'table' and name = 'recovery_freshness'`)
  .get().c > 0;
if (hasRecovery) {
  for (const r of db.prepare('select metric, last_seen, rows, export_dir, imported_at from recovery_freshness').all()) {
    await q(
      `insert into health_recovery (metric, last_seen, rows, export_dir, imported_at)
       values ($1,$2,$3,$4,$5)
       on conflict (metric) do update set
         last_seen = excluded.last_seen, rows = excluded.rows,
         export_dir = excluded.export_dir, imported_at = excluded.imported_at`,
      [r.metric, r.last_seen, r.rows, r.export_dir, r.imported_at],
    );
    recWritten++;
  }
} else {
  console.log('recovery_freshness not in healthos.db yet: run HealthOS/server/import-watch-sessions.mjs');
}

/* --- swim personal bests -------------------------------------------------------------------
 * Same `if exists` guard as recovery above: an older healthos.db that predates the table must not
 * fail the whole mirror, which also carries his weight. */
const hasPb = db
  .prepare(`select count(*) c from sqlite_master where type = 'table' and name = 'swim_pb'`)
  .get().c > 0;
if (hasPb) {
  for (const r of db.prepare('select distance_m, achieved_on, duration_ms, imported_at from swim_pb').all()) {
    await q(
      `insert into health_swim_pb (distance_m, achieved_on, duration_ms, imported_at)
       values ($1,$2,$3,$4)
       on conflict (distance_m, achieved_on, duration_ms) do update set imported_at = excluded.imported_at`,
      [r.distance_m, r.achieved_on, r.duration_ms, r.imported_at],
    );
    pbWritten++;
  }
} else {
  console.log('swim_pb not in healthos.db yet: run HealthOS/server/import-watch-sessions.mjs');
}

/* --- per-session detail ----------------------------------------------------------------------
 * The heart-rate trace, the swim splits and the treadmill cadence. Guarded like the others so an
 * older healthos.db cannot fail the whole mirror. */
const hasDetail = db
  .prepare(`select count(*) c from sqlite_master where type = 'table' and name = 'session_detail'`)
  .get().c > 0;
if (hasDetail) {
  const rows = db.prepare(`select uuid, date, kind, start_time, minutes, distance_m, calories,
    avg_hr, max_hr, min_hr, pct_easy, pool_length, lengths, avg_swolf, avg_cycles, stroke_rate,
    avg_cadence, max_cadence, detail, imported_at from session_detail`).all();
  for (const r of rows) {
    await q(
      `insert into health_session_detail (uuid, date, kind, start_time, minutes, distance_m,
         calories, avg_hr, max_hr, min_hr, pct_easy, pool_length, lengths, avg_swolf, avg_cycles,
         stroke_rate, avg_cadence, max_cadence, detail, imported_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)
       on conflict (uuid) do update set
         date=excluded.date, kind=excluded.kind, minutes=excluded.minutes,
         distance_m=excluded.distance_m, calories=excluded.calories, avg_hr=excluded.avg_hr,
         max_hr=excluded.max_hr, min_hr=excluded.min_hr, pct_easy=excluded.pct_easy,
         pool_length=excluded.pool_length, lengths=excluded.lengths, avg_swolf=excluded.avg_swolf,
         avg_cycles=excluded.avg_cycles, stroke_rate=excluded.stroke_rate,
         avg_cadence=excluded.avg_cadence, max_cadence=excluded.max_cadence,
         detail=excluded.detail, imported_at=excluded.imported_at`,
      [r.uuid, r.date, r.kind, r.start_time, r.minutes, r.distance_m, r.calories, r.avg_hr,
       r.max_hr, r.min_hr, r.pct_easy, r.pool_length, r.lengths, r.avg_swolf, r.avg_cycles,
       r.stroke_rate, r.avg_cadence, r.max_cadence, r.detail, r.imported_at],
    );
    detailWritten++;
  }
} else {
  console.log('session_detail not in healthos.db yet: run HealthOS/server/import-session-detail.mjs');
}

db.close();

// --- swim sessions (session-level, from the already-enriched JSON, not the raw CSV) -------------
swims = JSON.parse(readFileSync(SWIM_JSON_PATH, 'utf8'));
for (const s of swims) {
  if (!s.uuid || !s.date) continue;
  const avgHr = s.liveHR?.avg ?? s.csvHR?.mean ?? null;
  await q(
    `insert into health_swim_session (uuid, date, duration_ms, distance_m, pace_per_100m_ms, moving_pace_per_100m_ms, avg_hr, total_lengths)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (uuid) do update set
       date = excluded.date, duration_ms = excluded.duration_ms, distance_m = excluded.distance_m,
       pace_per_100m_ms = excluded.pace_per_100m_ms,
       moving_pace_per_100m_ms = excluded.moving_pace_per_100m_ms,
       avg_hr = excluded.avg_hr, total_lengths = excluded.total_lengths`,
    /* `?? null` rather than `|| null` on the two paces. `|| null` maps 0 to null, which is right for
       a distance and wrong here in principle, and more to the point it hides the difference between
       "not measured" and "measured as zero" on the exact column whose ambiguity is being fixed. */
    [s.uuid, s.date, s.durationMs || null, s.distanceM || null,
     s.pacePer100mMs ?? null, s.movingPacePer100mMs ?? null, avgHr, s.totalLengths || null],
  );
  swWritten++;
}

/* --- every individual length, from swim-laps.json ---------------------------------------------
 *
 * 19,327 of them back to 2018-01-03. Written in CHUNKS rather than one statement per row like every
 * other block in this file, and that is not a style choice: at one round trip per row this is
 * nineteen thousand round trips to Neon, which is minutes of wall clock on a scheduled task that
 * has a whole export to get through. One `unnest` per 1,000 rows makes it twenty.
 *
 * Guarded on the file existing rather than assumed, the same way the sqlite tables above are. An
 * older HealthOS that predates parse-swim-laps.js must not fail the mirror that also carries his
 * weight.
 *
 * THE KEY IS CHECKED HERE, NOT ASSUMED. `swim_session` lost two real sessions to a key that looked
 * sufficient, and the run that lost them reported success. So the distinct-pair count is compared
 * against the row count BEFORE anything is written: if the JSON ever ships two rows for one
 * (session, index), the upsert would silently keep the last one and the destination count would come
 * out short with no explanation. Better to refuse and say which key collided. */
if (existsSync(SWIM_LAPS_PATH)) {
  laps = JSON.parse(readFileSync(SWIM_LAPS_PATH, 'utf8')).filter(
    (l) => l.sessionUuid && l.lengthIndex != null && l.date,
  );
  const keys = new Set(laps.map((l) => `${l.sessionUuid}|${l.lengthIndex}`));
  if (keys.size !== laps.length) {
    throw new Error(
      `swim-laps.json has ${laps.length} usable rows but only ${keys.size} distinct ` +
        `(sessionUuid, lengthIndex) pairs. The key this table is built on is not unique in the ` +
        `source, so ${laps.length - keys.size} ${laps.length - keys.size === 1 ? 'length' : 'lengths'} ` +
        `would be discarded silently. Fix HealthOS/parse-swim-laps.js before mirroring.`,
    );
  }

  const CHUNK = 1000;
  for (let i = 0; i < laps.length; i += CHUNK) {
    const c = laps.slice(i, i + CHUNK);
    await q(
      `insert into health_swim_length (session_uuid, length_index, date, session_start_time,
         lengths_in_session, pool_length, duration_ms, stroke_type, stroke_count, rest_after_ms)
       select * from unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::int[], $6::int[],
         $7::int[], $8::text[], $9::int[], $10::int[])
       on conflict (session_uuid, length_index) do update set
         date = excluded.date, session_start_time = excluded.session_start_time,
         lengths_in_session = excluded.lengths_in_session, pool_length = excluded.pool_length,
         duration_ms = excluded.duration_ms, stroke_type = excluded.stroke_type,
         stroke_count = excluded.stroke_count, rest_after_ms = excluded.rest_after_ms`,
      [
        c.map((l) => l.sessionUuid),
        c.map((l) => l.lengthIndex),
        c.map((l) => l.date),
        c.map((l) => l.sessionStartTime ?? null),
        c.map((l) => l.lengthsInSession ?? null),
        c.map((l) => l.poolLength ?? null),
        /* `?? null` and not `|| null`, for the reason the two paces below record: a zero rest and an
           unmeasured rest are different facts, and `||` maps the first onto the second. A length
           with no gap after it is the normal case in a continuous swim. */
        c.map((l) => l.durationMs ?? null),
        c.map((l) => l.strokeType ?? null),
        c.map((l) => l.strokeCount ?? null),
        c.map((l) => l.restAfterMs ?? null),
      ],
    );
    lapWritten += c.length;
  }
} else {
  console.log('swim-laps.json not on disk yet: run HealthOS/parse-swim-laps.js');
}

// --- the published target ----------------------------------------------------------------
// Not recomputed here. publish-current.mjs derives it from lean mass and this copies the answer,
// so there is exactly one place that knows the formula.
const cur = JSON.parse(readFileSync(CURRENT_JSON_PATH, 'utf8'));
if (cur?.generatedAt && cur?.targets?.protein_g != null) {
  await q(
    `insert into health_target (generated_at, protein_g, protein_floor_g, basis, measured_date, measured_stale, lean_kg, weight_kg)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (generated_at) do update set
       protein_g = excluded.protein_g, protein_floor_g = excluded.protein_floor_g,
       basis = excluded.basis, measured_date = excluded.measured_date,
       measured_stale = excluded.measured_stale, lean_kg = excluded.lean_kg,
       weight_kg = excluded.weight_kg`,
    [
      cur.generatedAt,
      cur.targets.protein_g,
      cur.targets.protein_floor_g ?? null,
      cur.targets.basis ?? null,
      cur.measured?.date ?? null,
      cur.measured?.stale === true,
      cur.body?.lean_kg ?? null,
      cur.body?.weight_kg ?? null,
    ],
  );
  targetWritten = 1;
}

} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
}

console.log(`${DRY ? '[dry run] ' : ''}body_comp: ${bcWritten} rows (sqlite had ${bodyComp.length})`);
console.log(`${DRY ? '[dry run] ' : ''}watch_session (all training kinds, walking excluded): ${wsWritten} rows (sqlite had ${watchSessions.length})`);
console.log(`${DRY ? '[dry run] ' : ''}recovery: ${recWritten} rows`);
console.log(`${DRY ? '[dry run] ' : ''}swim PBs: ${pbWritten} rows`);
console.log(`${DRY ? '[dry run] ' : ''}session detail: ${detailWritten} rows`);
console.log(`${DRY ? '[dry run] ' : ''}swim_session: ${swWritten} rows (json had ${swims.length})`);
console.log(`${DRY ? '[dry run] ' : ''}swim_length: ${lapWritten} rows (json had ${laps.length})`);
console.log(`${DRY ? '[dry run] ' : ''}target: ${targetWritten} row from current.json`);

const checks = await Promise.all([
  client.query('select count(*)::int n from health_body_comp'),
  client.query('select count(*)::int n from health_watch_session'),
  client.query('select count(*)::int n from health_swim_session'),
  client.query('select count(*)::int n from health_swim_length'),
]);
console.log('Postgres row counts now:', checks.map((c) => c.rows[0].n));

/* THE COUNT IS A GATE, NOT A LOG LINE. Both failures this mirror has had were visible in these two
   numbers and invisible in every success message: an unrounded 117.5 into an integer column stopped
   it three weeks short after 108 of 151 rows, and a kind rename left 87 sessions duplicated. The
   mirror is a copy of sqlite, so more rows in Postgres than sqlite holds means something is stale
   in there, and fewer means the run did not finish. Only asserted on a real run. */
if (!DRY && !failure) {
  const pgWatch = checks[1].rows[0].n;
  if (pgWatch !== watchSessions.length) {
    failure = `mirror disagrees with sqlite: health_watch_session has ${pgWatch} rows, sqlite has ${watchSessions.length}. ` +
      (pgWatch > watchSessions.length
        ? 'Postgres is holding rows sqlite no longer has, so something was renamed or deleted upstream without being deleted here.'
        : 'The run did not finish writing.');
  }
  /* Same gate on the lengths, and it is the one that matters most here: 19,000 rows written in
     chunks is the block in this file most able to stop halfway and still print a friendly line.
     Only asserted when the source file was actually read, because a missing swim-laps.json is a
     skipped block and not a short write. Fewer in Postgres than the JSON holds means the run did
     not finish. MORE means rows are sitting here that the parser no longer produces, which is what
     a regenerated export with a changed uuid would look like, and it is worth being told about
     rather than left to accumulate the way the 87 duplicate sessions did. */
  if (laps.length) {
    const pgLaps = checks[3].rows[0].n;
    if (pgLaps !== laps.length) {
      failure = `mirror disagrees with swim-laps.json: health_swim_length has ${pgLaps} rows, the file has ${laps.length}. ` +
        (pgLaps > laps.length
          ? 'Postgres is holding lengths the parser no longer produces, so a session was re-keyed upstream without the old rows being deleted here.'
          : 'The run did not finish writing.');
    }
  }
}
if (DRY && before) console.log('Postgres row counts before:', before, '(unchanged, nothing was written)');

/* The run is recorded even when it failed, and especially then: a sync that throws every night is
   the case the page has to be able to see. Not written on a dry run, which is not a sync. */
if (!DRY) {
  await client.query(
    'insert into health_sync (ok, body_rows, watch_rows, swim_rows, length_rows, error) values ($1,$2,$3,$4,$5,$6)',
    [failure == null, bcWritten, wsWritten, swWritten, lapWritten, failure],
  );
}
await client.end();
if (failure) {
  console.error('sync FAILED:', failure);
  process.exit(1);
}
