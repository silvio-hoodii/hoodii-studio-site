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
--
-- `list` IS [{item, qty, url, price, note, need}] AND `need` IS NOT OPTIONAL. Added 2026-09-12 with
-- the one shopping list at /kitchen/shop, which unions every dish's list into one page. It is one of
-- exactly three strings:
--
--   buy       he does not have it, or not enough of it, and the trip fails without it
--   optional  the dish works without it. A topping, a nice-to-have, a piece of gear that is not blocking
--   owned     he has it. Confirmed, and it must never appear on a buy list
--
-- WHY IT IS A FIELD AND NOT A SENTENCE. Until then this lived in prose inside `note` and `price`:
-- "ESSENTIAL", "STILL NEEDED", "OPTIONAL", "DO NOT BUY", price 'ALREADY OWNED', price 'already have'.
-- Six spellings of three states, and every one of them was an agent's phrasing rather than a value.
-- A global list built by grepping those strings sends him to the shop for something in his cupboard
-- the first time a session writes the same idea a seventh way, and it looks like a shopping list
-- while it does it. See .agents/ENGINEERING.md law 1.
--
-- An item with no valid `need` is not guessed at in either direction. It lands in an "unsorted"
-- section that /kitchen/shop counts at the top of the page, so the gap is visible rather than being
-- silently resolved into a wrong answer.
create table if not exists dish (
  id           text primary key,                 -- slug, e.g. honeygarlicchicken
  name         text not null,                    -- display name; cook_log.dish matches on this
  source_url   text not null,                    -- the publisher's page. The app never copies its text
  publisher    text,                             -- "Budget Bytes", "NYT Cooking"
  servings     int,                              -- at the publisher's scale
  protein_g    numeric,                          -- grams per serving
  protein_note text,                             -- where that number comes from: their panel, or the arithmetic
  list         jsonb not null default '[]',      -- [{item, qty, url, price, note, need}]. See the block above
  notes        jsonb not null default '[]',      -- [{at, text}] his comments and substitutions, folded in from chat
  added_at     timestamptz not null default now()
);

-- One row per thing he has ticked off the shopping list, keyed the way `src/lib/kitchen/shoplist.ts`
-- keys a row: "url:<the walmart link>", "name:<the lowercased item>", or "extra:<shop_extra.id>".
--
-- A TICK EXPIRES AFTER A FORTNIGHT, and that is deliberate. It records "I bought this", which is a
-- fact about one trip, not "I have this", which is a fact about the kitchen. Modelling the kitchen is
-- what died on 2026-09-05. After TICK_DAYS the row returns to the list carrying the date it was last
-- bought, so it is a visible return he can re-tick in one tap instead of a silent reappearance. The
-- permanent answer to "I own this" is need='owned' on the dish row, which a session writes on purpose.
create table if not exists shop_tick (
  key   text primary key,
  label text not null,                            -- what it was called when ticked, so the got list reads right
  at    timestamptz not null default now()
);

-- Things he typed into the box on /kitchen/shop that no recipe knows about: dish soap, beer, milk.
-- They tick off through shop_tick under the key extra:<id> like anything else.
create table if not exists shop_extra (
  id   bigserial primary key,
  text text not null,
  at   timestamptz not null default now()
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
