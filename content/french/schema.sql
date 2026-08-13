-- LanguageOS (French) state, same Neon Postgres project as Gym/Kitchen/Health
-- (french_ prefix keeps the tables apart, no separate database).
--
-- Direct port of LanguageOS/server/db.mjs's schema: same columns, same keys, same
-- FSRS fields. See LanguageOS/DESIGN.md rule 4 (updated 2026-08-11) for why this
-- exists as a second copy alongside the original node:sqlite version rather than a
-- cutover. LanguageOS/data/french.db was empty (0 cards) at migration time.
--
-- Rule 1 still applies here exactly as it did on sqlite: nothing bulk-seeds these
-- tables. Cards enter only through the /french/api/cards POST, sourced from a real
-- photographed page.

create table if not exists french_cards (
  id             text primary key,
  front          text not null,          -- French
  back           text not null,          -- English
  es_hint        text,                   -- Spanish bridge / cognate note, nullable
  kind           text not null,          -- vocab | phrase | grammar | conjugation
  book           text,                   -- source book slug
  chapter        text,                   -- source chapter/section label
  page           text,                   -- page number as printed
  note           text,                   -- gotcha, gender, irregularity
  created_at     timestamptz not null,
  suspended      boolean not null default false,
  -- FSRS state
  stability      real    not null default 0,
  difficulty     real    not null default 0,
  state          int     not null default 0,
  reps           int     not null default 0,
  lapses         int     not null default 0,
  last_rating    int,
  interval_days  real    not null default 0,
  last_review_at timestamptz,
  next_review_at timestamptz
);
create index if not exists french_cards_due on french_cards (suspended, next_review_at);
create index if not exists french_cards_new on french_cards (suspended, reps);

create table if not exists french_reviews (
  id            bigserial primary key,
  card_id       text not null,
  rating        int not null,
  elapsed_days  real,
  interval_days real,
  reviewed_at   timestamptz not null
);
create index if not exists french_reviews_at on french_reviews (reviewed_at);

-- Where he is in each physical book. One row per section actually finished.
create table if not exists french_chapters (
  id         bigserial primary key,
  book       text not null,
  chapter    text not null,
  title      text,
  pages      text,
  cards_made int not null default 0,
  done_at    timestamptz not null,
  unique (book, chapter)
);

-- One row per day anything happened. Drives the streak and the honest counts.
create table if not exists french_days (
  date      text primary key,
  reviewed  int not null default 0,
  added     int not null default 0,
  book_work int not null default 0   -- 1 if a chapter was logged that day
);

create table if not exists french_state (
  id         int primary key check (id = 1),
  exam_date  text,
  started_at timestamptz not null
);
insert into french_state (id, exam_date, started_at)
  values (1, null, now())
  on conflict (id) do nothing;
