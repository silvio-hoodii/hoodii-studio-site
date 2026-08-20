-- The queue and acquisition status, mirrored from ReadingOS. Same Neon project as the rest
-- (reading_ prefix keeps the tables apart, no separate database) -- same road as swim, gym, kitchen.
--
-- ReadingOS/data/queue.json and ReadingOS/data/acquire.json stay canonical. Both are produced on
-- the laptop: queue.json by scripts/refill.mjs whenever a book is finished, acquire.json by
-- scripts/acquire.mjs (needs Silvio's own logged-in Chrome over CDP for CPL branch lookups and
-- retail prices, so it can never run on Vercel). content/reading/sync.mjs pushes a mirror here by
-- hand, after either script -- decided 2026-08-20 to start manual rather than on a cron, since
-- acquire.mjs cannot run unattended anyway. Nothing on the web writes back.

-- One book in the live ten. `key` is queue.json's own dedup key (e.g. "clarke|piranesi"), already
-- stable across runs, so no manufactured id is needed the way swim_session needed one.
--
-- `position` preserves queue.json's own array order, which is NOT a sort by score (Middlesex is
-- score 1 and sits first because it is the owned/reading book; The Underground Railroad is score
-- 8.4 and sits near the end). Re-sorting by score in SQL would show a different book first than
-- QUEUE.md does, which is confusing for no reason -- the page should show the same ten in the same
-- order Silvio already sees in Obsidian.
create table if not exists reading_queue_entry (
  key         text primary key,
  position    integer not null,
  title       text not null,
  author      text not null,
  year        integer,
  status      text not null,   -- unread | reading | finished
  track       text not null,   -- canon | current | nonfiction | genre
  score       numeric,
  categories  text[] not null default '{}',
  lists       text[] not null default '{}',
  pace        text,
  pace_note   text,
  pages       integer,
  era         text,
  language    text,
  mood        text[] not null default '{}',
  format      text,            -- print | null (null = not yet owned)
  why         text,
  picked_via  text,
  note        text,
  added       text,
  started     text,
  finished    text,
  rating      numeric
);
create index if not exists reading_queue_entry_position on reading_queue_entry (position);

-- Acquisition status for the unowned entries only -- acquire.mjs never runs against a book already
-- in hand (status = 'reading' or format already set), so there is no row here for those.
--
-- The rich per-channel detail (OverDrive, BiblioCommons, Open Library, per-branch shelf detail,
-- retail prices) stays as the JSON payload acquire.mjs already produced rather than being split
-- into columns: it is read-only, rendered as-is, and nothing here ever queries INTO it in SQL. The
-- few fields pulled out to real columns are the ones the page needs to sort/filter/color by.
create table if not exists reading_acquisition_entry (
  key                text primary key references reading_queue_entry (key) on delete cascade,
  verdict            text not null,   -- BORROW NOW | HOLD NOW | FREE ONLINE | BUY | MISS
  verdict_detail     text,
  checked_at         timestamptz,
  home_branch_label  text,            -- 'Westbrook' | 'Central' | null
  home_branch_now    boolean not null default false,  -- true only if AVAILABLE at that branch today
  payload            jsonb not null  -- the full acquire.json record for this book
);
create index if not exists reading_acquisition_entry_verdict on reading_acquisition_entry (verdict);

-- Every run of content/reading/sync.mjs writes a row here, successful or not -- same two-alarm
-- shape as swim_sync. `queue_updated` and `acquire_generated` are the source files' own timestamps,
-- not the mirror-write time, so a sync that keeps re-pushing a stale queue.json still reads as
-- stale rather than looking freshly synced.
create table if not exists reading_sync (
  id                 bigserial primary key,
  ran_at             timestamptz not null default now(),
  ok                 boolean     not null,
  queue_updated      text,          -- queue.json's own "updated" field (YYYY-MM-DD)
  acquire_generated  timestamptz,   -- acquire.json's own "generated" field, null if not synced
  queue_rows         integer,
  acquisition_rows   integer,
  error              text
);
create index if not exists reading_sync_ran on reading_sync (ran_at desc);
create index if not exists reading_sync_ok on reading_sync (ok, ran_at desc);
