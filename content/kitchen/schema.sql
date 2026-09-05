-- KitchenOS, Neon project `kitchenos`. Rebuilt 2026-09-05 as a cookbook.
--
-- WHAT THIS IS NOW. A list of dishes Silvio chose, each pointing at the publisher's own page, with
-- the shopping list an agent built for it and his notes on how it went. Nothing here models the
-- fridge. Stock tracking (stock_event, shop_item, protein_log, cook_run, dish_veto) was dropped on
-- 2026-09-05: writes had stopped on 2026-08-23 and the app was scoring "what can I cook" against a
-- two-week-old fridge and presenting it as current. Exports of every dropped table are in
-- HOODII/KitchenOS/_archive-2026-09-05/neon/.
--
-- Apply with: node content/kitchen/apply-schema.mjs   (idempotent, create-if-not-exists only)

-- A dish he decided to cook. Written by an agent in a session, read by the phone.
create table if not exists dish (
  id           text primary key,                 -- slug, e.g. honeygarlicchicken
  name         text not null,                    -- display name; cook_log.dish matches on this
  source_url   text not null,                    -- the publisher's page. The app never copies its text
  publisher    text,                             -- "Budget Bytes", "NYT Cooking"
  servings     int,                              -- at the publisher's scale
  protein_g    numeric,                          -- grams per serving
  protein_note text,                             -- where that number comes from: their panel, or the arithmetic
  list         jsonb not null default '[]',      -- [{item, qty, url, price, note}] the Walmart list, links included
  notes        jsonb not null default '[]',      -- [{at, text}] his comments and substitutions, folded in from chat
  added_at     timestamptz not null default now()
);

-- "I want to make X", typed on the phone, anywhere. Read at session start by
-- HOODII/.claude/hooks/kitchen-inbox.mjs, which prints what is waiting. Nothing polls.
create table if not exists inbox (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  text    text not null,                          -- a dish name or a URL
  handled boolean not null default false
);
create index if not exists inbox_open on inbox (handled, at desc);

-- How it went. The only record of what happened at the stove. Kept from the first build, rows
-- since 2026-08-02 intact. step / step_of / kind / step_text belonged to the step renderer, which is
-- gone; new rows leave them null.
create table if not exists cook_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  dish      text        not null,                 -- display name, matches dish.name
  rating    text,                                 -- nailed | fine | wrong, or empty
  note      text,
  step      int,
  step_of   int,
  kind      text,
  step_text text,
  handled   boolean not null default false        -- has a session read and acted on it
);
create index if not exists cook_log_unhandled on cook_log (handled, at desc);
create index if not exists cook_log_dish_at on cook_log (dish, at desc);
