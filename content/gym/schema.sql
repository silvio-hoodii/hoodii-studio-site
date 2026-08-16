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
  rir               real,
  done              boolean     not null default false,
  swapped_from      text,
  logged_at         timestamptz,
  suggested_weight  real,
  suggested_reps    real,
  estimated         boolean,    -- null = not specified (treated as false downstream); true = recalled from memory, not measured live
  unique (date, exercise_id, set_idx)
);
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
