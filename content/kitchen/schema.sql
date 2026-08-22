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
/* One row per dish per day, replaced rather than added to.
 *
 * The debrief can be submitted more than once: a refused save puts a retry button on the screen,
 * and the point of that button is to send the same thing again. A plain insert would count the
 * portions twice and the page would quietly overstate his intake. Overstating is the worse of the
 * two errors here (a false "you have this" beats no claim at all only when it is true), and this
 * surface already presents itself as a floor.
 *
 * Two genuine sittings of the same dish on one day are still expressible: the debrief asks how many
 * portions, so the answer is 2, not two submissions of 1. */
create unique index if not exists protein_log_day_dish on protein_log (day, dish);

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

-- ---------------------------------------------------------------------------------------------
-- The shopping list, added 2026-08-18. Silvio: "i dont understand where the shopping list is in
-- the app, worth buying section is not it, so i dont know how navigation works".
--
-- He was right twice. There was no list, and `KitchenOS/SHOPPING.md` claimed there was one in the
-- app "with tick-off that survives a reload", which described the retired laptop page. Two sections
-- were appended under that false sentence the same day nobody checked it.
--
-- Append-only, like every other table here. Ticking something off inserts `got`; it never updates a
-- row. `item_id` is a stock id where one exists, a `gap:<name>` for a hole in the vocabulary that has
-- no stock row yet (tortillas, ham), or a free label for anything he adds himself (beer, dish soap).
-- The generated part of the list is not stored at all: it is folded at read time from stock rows that
-- are low or out and from what the recipes are short of, exactly like stock state. A stored list is a
-- list that goes stale, and this project has thirteen dead hand-maintained tables on record.
create table if not exists shop_item (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  item_id text        not null,
  ev      text        not null,   -- add|got|drop
  label   text,                   -- what he typed, when he added it himself
  src     text,                   -- tap|seed|dish
  note    text
);
create index if not exists shop_item_item_at on shop_item (item_id, at desc);

-- ---------------------------------------------------------------------------------------------
-- "Stop showing me this." Added 2026-08-22.
--
-- Until now the app had exactly two signals about a dish: he OWNS the ingredients, and he has COOKED
-- it. Both are reasons to show something and neither is a reason not to. So Mongolian Ground Beef led
-- the home page from the day it was written, for three weeks, and every session he said so:
--
--   "Why is the fucking Mongolian ground beef thing here? I've been telling you that I don't even
--   understand why it is there... The fact that I cook something doesn't mean that I want to eat it
--   forever."
--
-- Both halves need this table. A dish he does not want is not distinguishable from one he has not got
-- round to, and a dish he cooked last week is not distinguishable from one he wants weekly, and no
-- amount of ranking can invent the difference. It has to be a tap.
--
-- Append-only, like every other table here: hiding inserts `hide`, changing his mind inserts `show`,
-- and nothing ever updates or deletes. The fold takes the last event per dish, so a dish can come
-- back without losing the record that it was once hidden.
--
-- `dish` is namespaced, `card:<recipe id>` or `meal:<corpus id>`, because the two libraries are
-- separate id spaces and an unqualified id would eventually collide. `name` is stored alongside it
-- purely so the undo list can be rendered without loading the corpus.
create table if not exists dish_veto (
  id    bigserial primary key,
  at    timestamptz not null default now(),
  dish  text        not null,
  ev    text        not null,   -- hide|show
  name  text,
  note  text
);
create index if not exists dish_veto_dish_at on dish_veto (dish, at desc);
