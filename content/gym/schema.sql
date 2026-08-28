-- Gym state, Neon Postgres (same project as Kitchen; gym_ prefix keeps the tables apart).
--
-- Only STATE lives here. The program itself (days/blocks/exercises/alts) is JSON in this repo,
-- same split as Kitchen: authored content is reviewable and gated by content/gym/validate.mjs,
-- logged history is not something a validator has an opinion about.
--
-- This is a straight port of HealthOS/healthos.db's schema (server/db.mjs), not a redesign: the
-- upsert-by-(date, exercise_id, set_idx) key and the append-only session/set split are both real
-- fixes already earned there (re-logging a set updates in place rather than duplicating; a set and
-- its session are separate rows so a session can exist before any set is entered). Existing history
-- moves over via migrate-from-sqlite.mjs, nothing is re-derived or reset.

create table if not exists gym_session (
  id          bigserial primary key,
  date        text        not null,
  day         text,
  day_title   text,
  started_at  timestamptz,
  finished_at timestamptz,
  status      text        not null default 'active',
  unique (date, day)
);

create table if not exists gym_set (
  id                bigserial primary key,
  date              text        not null,
  day               text,
  exercise_id       text        not null,
  exercise_name     text,
  set_idx           int         not null,
  weight            real,
  reps              real,
  -- `rir real` was here and was DROPPED 2026-08-27, his call. It held a value in 0 of 569 rows for
  -- its whole life: written on every insert as null, carried by the upsert, selected back out, and
  -- read by nothing. Do not re-add it without an input that fills it. The RIR guide on /gym is
  -- separate content and stays.
  done              boolean     not null default false,
  swapped_from      text,
  logged_at         timestamptz,
  suggested_weight  real,
  suggested_reps    real,
  estimated         boolean,    -- null = not specified (treated as false downstream); true = recalled from memory, not measured live
  /* Was this logged through the off-plan capture box rather than prescribed. Added 2026-08-28.
   *
   * It is NOT part of the unique key, deliberately. Giving off-plan rows their own key space would
   * let an off-plan set and a prescribed set of the same exercise share an index, and the point of
   * the fix is that they never collide at all: `appendOffPlanSet` derives the index from what is
   * already in the table for that (date, exercise_id), inside the insert, so no client counter is
   * involved. The column is here so the two kinds stay distinguishable in the record forever.
   *
   * What it replaces: the client counted `extraLog.filter(...).length + 1`, and that state is never
   * rehydrated, so a reload restarted the counter at 1 and the upsert REPLACED the earlier set. It
   * could also overwrite a prescribed set outright, because the off-plan datalist offers every
   * catalogue name including exercises prescribed that same day. */
  off_plan          boolean     not null default false,
  unique (date, exercise_id, set_idx)
);
alter table gym_set add column if not exists off_plan boolean not null default false;
create index if not exists gym_set_ex_date on gym_set (exercise_id, date);
create index if not exists gym_set_date    on gym_set (date);

-- Deferred to the follow-up session per the migration phasing (swim log tab, body-weight card):
-- gym_swim, gym_body_weight. Schema for both is a straight copy of healthos.db's `swims` and
-- `body_weight` tables when that lands, not designed yet because the UI that would read them isn't
-- built yet either, and a state table nothing reads is exactly the kind of thing that goes stale.

-- Notes written during or after a session, added 2026-08-16. Silvio: "maybe a note place in the
-- end for when I find something that I wanna write it down or tell you."
--
-- Same job as the kitchen's cook_log: the ONLY record of what actually happened, in his words, at
-- the moment it happened. Everything else in this database is numbers he typed into boxes, which
-- cannot say "the racks were all taken" or "my knee felt off on the second set".
--
-- No exercise_id. He asked for one box at the END of the workout, not a note per exercise, and a
-- per-exercise note is a different feature with a different failure mode (nine empty boxes on
-- screen while he is trying to lift). `day` and `date` are enough to find the session it belongs to.
create table if not exists gym_note (
  id         bigserial primary key,
  date       text        not null,
  day        text,
  day_title  text,
  body       text        not null,
  handled    boolean     not null default false,  -- set true once an agent has acted on it
  created_at timestamptz not null default now()
);
create index if not exists gym_note_date on gym_note (date desc);

-- The bike, added 2026-08-27. THE ONLY TABLE HERE THE WATCH CANNOT FILL.
--
-- Every other number in this database arrives from the Samsung export or from a box he types on a
-- page that already exists. The bike has neither: src/lib/gym/session.ts:135 says of a bike session
-- "no rpm, no power, no resistance", the watch contributes a heart rate and nothing else, and the
-- resistance level is the one number the session is actually steered by. So the app starts owning
-- what the watch cannot see. This is the only new WRITE PATH in the training redesign
-- (docs/TRAINING-REDESIGN-PLAN-2026-08-26.md, D2).
--
-- NO PAGE READS THIS YET, and that is the plan's intent: /bike is Phase C. The API ships first so
-- the gates around it are built while somebody is looking at them, rather than bolted on afterwards.
-- "Afterwards" is how /gym/api/note shipped outside the probe harness on 2026-08-16 and the first
-- test posted into the real training log.
--
-- FOUR LEVELS, NOT ONE. The plan said a single `resistance` column. Checking that against what the
-- session actually asks him to do killed it: content/gym/conditioning.json, cue "Do not touch the
-- resistance before 2:00", ends "Write down the level you finished each effort on, so next week
-- starts from real numbers." That is four numbers, one per interval of the Norwegian 4x4, and the
-- whole point of writing them down is the comparison across weeks that one column throws away at
-- the moment of entry. Silvio chose the four on 2026-08-27, asked directly. THIS IS A DEVIATION
-- FROM THE PLAN'S LETTER and it is recorded here rather than only in a handoff.
--
-- An array rather than r1/r2/r3/r4 because the session has two published shapes: four rounds at 43
-- minutes, three at 31 when the morning is tight. Four columns make a three-interval ride carry a
-- null that means "did not happen" in the same slot where a null would otherwise mean "did not
-- write it down". A list of the intervals that happened cannot express the difference wrongly.
--
-- 1 TO 20 is his bike's dial, answered 2026-08-27 and recorded in content/gym/equipment.json, which
-- until that day said "No resistance scale recorded yet". The bound is enforced here as well as in
-- the route, because a check in one route protects one route.
--
-- A HISTORY with no unique key on `date`, the same shape as gym_swim_baseline. Two rides in a day
-- is unlikely but not wrong, and a unique key would refuse the real one to prevent a duplicate that
-- has not happened yet.
--
-- `bike_ride`, not `gym_bike_ride`: the prefixes in this shared Neon database are per APP, and bike
-- becomes its own route in Phase C. gym_swim_baseline keeps its gym_ prefix for the opposite
-- reason, that renaming a live table holding the only copy of a number buys nothing.
create table if not exists bike_ride (
  id          bigserial   primary key,
  date        text        not null,
  minutes     integer     not null,
  -- One entry per interval, in order, holding the level he FINISHED that interval on. Expect the
  -- number to fall across a session: conditioning.json says so, and says it is not a failure.
  resistance  integer[]   not null,
  -- How hard the whole ride felt, 1 to 10, optional. The watch already records what his heart did;
  -- this is the half it cannot see. Null means he did not say, never "easy".
  effort      integer,
  note        text,
  created_at  timestamptz not null default now(),
  constraint bike_ride_minutes_sane   check (minutes > 0 and minutes <= 300),
  constraint bike_ride_effort_scale   check (effort is null or effort between 1 and 10),
  /* cardinality, not array_length: array_length('{}', 1) is NULL, and a CHECK that evaluates to
     NULL PASSES, so the obvious spelling would have accepted a ride with no intervals at all. */
  constraint bike_ride_levels_flat    check (array_ndims(resistance) = 1),
  constraint bike_ride_levels_count   check (cardinality(resistance) between 1 and 8),
  /* array_position searches with IS NOT DISTINCT FROM semantics, so it genuinely finds a NULL
     element and this rejects {12, null, 11}. Without it the scale check below is not enough: a
     containment test involving NULL does not reliably return false. */
  constraint bike_ride_levels_filled  check (array_position(resistance, null::integer) is null),
  constraint bike_ride_levels_scale
    check (resistance <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20}'::integer[])
);
create index if not exists bike_ride_date on bike_ride (date desc);
