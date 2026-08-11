-- HealthOS dashboard state, same Neon Postgres project as Kitchen/Gym (health_ prefix keeps the
-- tables apart, no separate database).
--
-- Only STATE lives here, sourced entirely from HealthOS/healthos.db + the Samsung Health export
-- pipeline that already runs on the laptop (parse-body-metrics.js, parse-swimming.js,
-- server/migrate-body-comp.mjs, server/import-watch-sessions.mjs). This is not a new source of
-- truth: healthos.db stays canonical, this is a mirror the dashboard can read without depending on
-- the laptop being online, same reasoning as the Gym cutover. Refresh after each new Samsung export
-- by re-running migrate-from-sqlite.mjs (idempotent).

create table if not exists health_body_comp (
  date      text not null,
  source    text not null,
  kg        real,
  bf_pct    real,
  fat_kg    real,
  lean_kg   real,
  skm_kg    real,
  water_kg  real,
  bmr_cal   real,
  bmi       real,
  logged_at timestamptz,
  primary key (date, source)
);

-- Watch-detected exercise sessions. This is the attendance record (every session the watch saw),
-- distinct from gym_set (the load record: only sessions actually logged in the app). The gap
-- between them is "trained but unlogged" — CURRENT.md already surfaces it, the dashboard mirrors it.
create table if not exists health_watch_session (
  date        text    not null,
  start_time  text    not null,
  kind        text    not null,
  minutes     integer,
  calories    integer,
  avg_hr      integer,
  primary key (start_time, kind)
);
create index if not exists health_watch_session_date on health_watch_session (kind, date);

-- Session-level swim history (not per-lap — swim-laps.json has ~18.8k individual lengths, which is
-- more granularity than any v1 chart needs; can migrate later if a per-lap view gets built).
create table if not exists health_swim_session (
  uuid              text primary key,
  date              text not null,
  duration_ms       real,
  distance_m        real,
  pace_per_100m_ms  real,
  avg_hr            integer,
  total_lengths     integer
);
create index if not exists health_swim_session_date on health_swim_session (date);
