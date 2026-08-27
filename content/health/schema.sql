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
-- between them is "trained but unlogged": CURRENT.md already surfaces it, the dashboard mirrors it.
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

-- Session-level swim history (not per-lap: swim-laps.json holds 19.3k individual lengths back to
-- 2018, which is more granularity than any v1 chart needed; a per-lap mirror is planned, see
-- hoodii-studio-site/docs/TRAINING-REDESIGN-PLAN-2026-08-26.md).
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

-- TWO PACES, added 2026-08-26, because one column was holding two different metrics.
--
-- `pace_per_100m_ms` is now ALWAYS wall clock: session duration over distance, rest included, so it
-- is comparable across every row. `moving_pace_per_100m_ms` is the rest-EXCLUDED figure that only
-- exists where the per-length detail was actually read, and it is null everywhere else rather than
-- falling back.
--
-- The old single column was computed whichever way the export allowed, which mattered because the
-- only thing anything did with it was take a minimum, and a minimum over a mixed column always
-- picks the definition that yields the smaller number. So /health's "Best pace / 100m" read 1:31,
-- which was a moving pace off a 300 m session on 2025-01-22 that ran 1534 s with 272 s of swimming
-- in it, under a label that reads as a time trial, and FASTER than the official 100 m personal best
-- of 1:38.71. Two numbers describing "how fast can he swim" that could not both be right, on two
-- pages, neither linking to the other.
--
-- `if not exists` because this table already holds 463 rows on a live database.
alter table health_swim_session add column if not exists moving_pace_per_100m_ms real;

-- Every run of content/health/sync.mjs writes a row here, successful or not.
--
-- Without it this surface cannot tell two very different things apart: he has not stepped on the
-- scale for three weeks, and the mirror stopped being written three weeks ago. The page showed the
-- same sentence for both. /music learned this first, from a Spotify token that dies silently every
-- 180 days, and the fix there was the same: log the RUN, not just the data, and shout when the last
-- successful run is old.
create table if not exists health_sync (
  id          bigserial primary key,
  ran_at      timestamptz not null default now(),
  ok          boolean     not null,
  body_rows   integer,
  watch_rows  integer,
  swim_rows   integer,
  error       text
);
create index if not exists health_sync_ran on health_sync (ran_at desc);

-- What HealthOS PUBLISHES about the body, as opposed to what it measured.
--
-- The protein target is computed from lean mass by HealthOS/server/publish-current.mjs and moves on
-- its own when he is measured again. HOODII/CLAUDE.md forbids restating it anywhere: every copy is
-- a number that goes stale silently, and one already produced a cross-agent discrepancy.
--
-- The obvious alternative, having the site read HealthOS/current.json off the disk, works on the
-- laptop and returns nothing on Vercel, which is the only place the kitchen is ever opened. So the
-- published figure travels the same road as the weight: computed once, mirrored, read everywhere.
create table if not exists health_target (
  generated_at    timestamptz primary key,
  protein_g       real,
  protein_floor_g real,
  basis           text,
  measured_date   text,
  measured_stale  boolean,
  lean_kg         real,
  weight_kg       real
);

-- How recently the watch was worn AT NIGHT, one row per metric, mirrored from
-- healthos.db `recovery_freshness` (written by HealthOS/server/import-watch-sessions.mjs).
--
-- Not a table of nights, because only one question is ever asked of it: can a statement about
-- recovery be made from measurement, or only from load arithmetic? On 2026-08-21 the answer was
-- "only arithmetic": exercise data arrived every day through 08-20 while sleep and HRV both stopped
-- on 08-15, because the watch is on his wrist all day and off it all night. The week surface applies
-- a max-consecutive-training-days rule, and a rule about fatigue computed with no fatigue
-- measurement has to say so on the page rather than imply a recovery judgment it cannot make.
create table if not exists health_recovery (
  metric      text primary key,   -- 'sleep' | 'hrv'
  last_seen   text,               -- local date of the newest reading
  rows        integer,
  export_dir  text,
  imported_at timestamptz
);

-- Swim personal bests, mirrored from healthos.db `swim_pb`, itself read from Samsung's
-- best_records file. Samsung had these all along and nothing read them until 2026-08-22.
--
-- A HISTORY, not one row per distance: Samsung keeps every time that was a record when it was set,
-- which is where the phone app's "top 5 times" list comes from. Keeping the history means the page
-- can show progression rather than a single number with no context.
--
-- The distance is DERIVED. Samsung stores a numeric type and a duration with no event label; the
-- mapping is tested on every import by requiring pace per 100 m to rise with distance. See
-- SWIM_PB_TYPES in HealthOS/server/import-watch-sessions.mjs.
--
-- Nothing below 100 m, deliberately. Samsung records no bests there, and deriving them from single
-- lengths does not survive the data: the fastest recorded 25 m is 9.03 s, faster than a world-record
-- 25 m split, and the answer moves four seconds depending on where the miscount filter is put.
create table if not exists health_swim_pb (
  distance_m  integer not null,
  achieved_on text    not null,
  duration_ms integer not null,
  imported_at timestamptz,
  primary key (distance_m, achieved_on, duration_ms)
);
create index if not exists health_swim_pb_dist on health_swim_pb (distance_m, duration_ms);

-- What the watch recorded INSIDE a session, as opposed to the one summary row per session that
-- health_watch_session already holds. Mirrored from healthos.db `session_detail`, written by
-- HealthOS/server/import-session-detail.mjs.
--
-- He asked for this directly: "just look into each activity and exploit all the information that we
-- have." The audit that preceded it found the four activities are NOT equal, and the page says so:
--
--   swimming   heart rate per second AND per length (duration, stroke count, stroke, rest). SWOLF,
--              distance per stroke and stroke rate all fall out of it. Much the richest.
--   treadmill  heart rate, CADENCE, speed and distance per second. Cadence IS measured indoors.
--   strength   heart rate only. It cannot judge a lift. It can show the shape of the session, which
--              is how 54% of every gym session turned out to sit under 110 bpm.
--   cycling    heart rate only. No rpm, no power, no resistance. Nothing to say, and the page says
--              nothing rather than dressing it up.
--
-- `detail` is the downsampled series plus, for a swim, the per-length array. Downsampled to about
-- 120 points by MEAN inside each bucket, not by taking every Nth sample: sampling drops peaks and
-- the peak is the part worth asking about. min/max/avg are computed from the FULL series before
-- downsampling, so no headline number depends on it. 151 sessions come to 137 KB in total.
create table if not exists health_session_detail (
  uuid        text primary key,
  date        text not null,
  kind        text not null,
  start_time  text not null,
  minutes     integer,
  distance_m  real,
  calories    real,
  avg_hr      integer,
  max_hr      integer,
  min_hr      integer,
  -- Fraction of the session under 110 bpm. For a lifting session this is the only honest thing
  -- heart rate can say, and it is about the shape of the hour rather than the quality of a lift.
  pct_easy    real,
  pool_length integer,
  lengths     integer,
  avg_swolf   real,
  avg_cycles  real,
  stroke_rate real,
  avg_cadence real,
  max_cadence real,
  detail      jsonb,
  imported_at timestamptz
);
create index if not exists health_session_detail_kind on health_session_detail (kind, date desc);


-- EVERY INDIVIDUAL LENGTH HE HAS EVER SWUM, added 2026-08-26 (plan D3).
--
-- 19,327 lengths across 364 sessions back to 2018-01-03, which have sat in
-- C:\Users\sneyr\Desktop\HOODII\HealthOS\swim-laps.json since the parser was written and have never
-- reached a database. `health_session_detail` carries a per-length array too, but it only backfills
-- about 120 days, so eight years of the richest data in this whole system was reachable from the
-- laptop and nowhere else.
--
-- THE KEY IS (session_uuid, length_index) AND NOTHING ELSE. `swim_session` lost two real sessions to
-- a key that merely looked sufficient and said nothing when it dropped them, which is why the sync
-- asserts the destination count against the source count rather than trusting a success message.
-- Checked before this table existed: the source JSON has 19,327 rows and 19,327 distinct pairs of
-- these two columns, no nulls in either.
--
-- `date` is denormalised from the session on purpose. Every question worth asking of this table is
-- "what happened over time", and a join to health_swim_session for a text date on 19,000 rows buys
-- nothing. `stroke_type` is one of Freestyle, Backstroke, Breaststroke, Butterfly, Mixed, Kickboard,
-- stored as the export's own word rather than an enum: a stroke this build has not seen must arrive
-- and be visible, not fail the mirror.
create table if not exists health_swim_length (
  session_uuid       text    not null,
  length_index       integer not null,
  date               text    not null,
  session_start_time text,
  lengths_in_session integer,
  pool_length        integer,
  duration_ms        integer,
  stroke_type        text,
  stroke_count       integer,
  rest_after_ms      integer,
  primary key (session_uuid, length_index)
);
create index if not exists health_swim_length_date on health_swim_length (date);
create index if not exists health_swim_length_session on health_swim_length (session_uuid, length_index);

-- The liveness figure for the lengths mirror goes in the row health_sync already writes, rather
-- than into a table of its own.
--
-- D3 asked for "its own liveness row, like swim_sync and health_sync have". This IS that, in the
-- run record the same script already writes on every run, successful or not. A second table would
-- be a second thing to consult that can only ever agree with this one, and `swim_sync`, the other
-- half of the comparison it was modelled on, was dropped with SwimOS on 2026-08-26.
alter table health_sync add column if not exists length_rows integer;
