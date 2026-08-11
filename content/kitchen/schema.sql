-- KitchenOS state, Neon Postgres.
--
-- Only STATE lives here. Recipes, the equipment vocabulary and the stock catalogue are JSON files
-- in this repo, because they are authored, reviewable, and gated by content/kitchen/validate.mjs at
-- build time. A recipe in a database is a recipe no validator can refuse.
--
-- Everything below is APPEND ONLY. Current state is folded from events at read time and never
-- stored, which is the rule that ended thirteen contradictory hand-maintained stock tables in one
-- day on 2026-08-04.

create table if not exists stock_event (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  item_id      text        not null,
  ev           text        not null,   -- bought|low|out|tossed|froze|thawing|cooked|confirm|note
  src          text,                   -- tap|receipt|doc|cook
  note         text,
  use_by       date,
  where_at     text,
  label        text,
  display_name text
);
create index if not exists stock_event_item_at on stock_event (item_id, at desc);
create index if not exists stock_event_at      on stock_event (at desc);

-- ---------------------------------------------------------------------------------------------
-- Quantity, added 2026-08-11. Additive on purpose: every column is nullable and every existing
-- event keeps working untouched.
--
-- Until now the AMOUNT of something lived in `label`, a free-text string, while its STATE lived in
-- `ev`. Two independent claims about the same thing with nothing reconciling them, so they drifted
-- and each one still read as true. The trace that forced this, all real rows:
--
--   08-08 22:37  low   Browned beef, 2 bags left (450 g): 250 g Arroz Tapado, 200 g Mongolian
--   08-08 22:46  low   Browned beef, 2 bags left (600 g): 350 g and 250 g, weighed on the scale
--   08-09 01:27  out   Ground beef: gone. 250 g bag still in freezer, undecided.
--
-- Two events nine minutes apart disagree by 150 g, and the item is marked `out` in the same row
-- that records a bag still existing. Silvio, correctly: "the agent was aware of the amount and this
-- keeps happening and not working at all." Being told was never the problem. Storing it as prose was.
--
-- The rules this encodes:
--   * `qty` is the amount, `unit` its unit. NULL means genuinely unknown, which stays unknown and is
--     never quietly replaced by the last number anyone typed. Not everything gets weighed.
--   * `qty_mode` says how to fold: 'delta' adds (a purchase, a portion used), 'absolute' sets (a
--     recount, which is ground truth and wins over any accumulated arithmetic).
--   * `portions` holds the individual bags, e.g. {350,250}. The COUNT and the TOTAL are both derived
--     from it, so "2 bags" and "600 g" can never again be two separately-typed numbers that differ.
--   * `level` stops being an independent axis wherever `qty` is known: it is computed from the
--     amount. That is what makes `out`-with-a-bag-left unrepresentable rather than merely fixed.
alter table stock_event add column if not exists qty      numeric;
alter table stock_event add column if not exists unit     text;
alter table stock_event add column if not exists qty_mode text;      -- absolute | delta
alter table stock_event add column if not exists portions numeric[];

-- What actually happened at the stove. The only honest record of it.
create table if not exists cook_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  dish      text        not null,
  rating    text,                       -- nailed|fine|wrong, empty for a step note
  note      text,
  step      int,
  step_of   int,
  kind      text,                       -- broke|confusing|question
  step_text text
);
create index if not exists cook_log_dish_at on cook_log (dish, at desc);
create index if not exists cook_log_at      on cook_log (at desc);

-- Protein in portions, never grams weighed. Day is stored explicitly rather than derived from `at`
-- so a 1 a.m. shake still counts against the right day if that is what he says.
create table if not exists protein_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  day       date        not null,
  dish      text        not null,
  units     real        not null default 1,
  protein_g real        not null
);
create index if not exists protein_log_day on protein_log (day);

-- Cooking a dish consumes its ingredients. This is the join that never existed: the old app wrote a
-- finished dish to cook-log.jsonl and NOTHING to stock, so a roast eaten on Aug 6 was still leading
-- the home screen on Aug 8 as "3 DAYS PAST ITS BEST, slice it TODAY".
create table if not exists cook_run (
  id        bigserial primary key,
  dish      text        not null,
  started   timestamptz not null default now(),
  finished  timestamptz,
  build     text
);
create index if not exists cook_run_dish on cook_run (dish, started desc);
