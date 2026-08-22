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
-- `position` is NOT queue.json's own array order -- that order is the SELECTION order (which
-- refill.mjs pass picked each book), not the order a human reads. sync.mjs computes the same
-- reading-first-then-gentlest-first sort refill.mjs uses to render QUEUE.md, so this matches what
-- Silvio actually sees in Obsidian rather than an internal bookkeeping order (found 2026-08-20:
-- Middlesex kept showing first here by array position even after its status flipped back to
-- unread, while QUEUE.md had already resorted it down).
create table if not exists reading_queue_entry (
  key         text primary key,
  position    integer not null,
  title       text not null,
  author      text not null,
  year        integer,
  status      text not null,   -- unread | reading | finished
  track       text not null,   -- canon | current | nonfiction | genre | spanish
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

-- Every book in the four masters (canon, current, nonfiction, genre) that is NOT already in the
-- live ten or in ReadingOS/data/finished.json -- everything the ranking engines know about that
-- Silvio has neither queued nor read. Source: ReadingOS/data/master.json + data/current/master.json
-- + data/nonfiction/master.json + data/genre/master.json, cross-referenced against data/tags/ for
-- which ones have the rich metadata (pace, mood, why) that makes a book queue-eligible at all --
-- see ReadingOS/README.md "Deepening (the tagging bottleneck)": only a few hundred of ~2,934+ are
-- tagged. Untagged books still get a row here, honestly marked `tagged = false`, rather than being
-- hidden -- a book add.mjs would refuse to queue is still a real fact about the catalog.
--
-- A book that exists in more than one master (canon AND current both list some books) keeps only
-- its higher-scoring row, same tie-break scripts/add.mjs already uses, so there is one row per key
-- rather than a book appearing to compete with itself.
create table if not exists reading_catalog_entry (
  key         text primary key,
  track       text not null,   -- canon | current | nonfiction | genre | spanish
  title       text not null,
  author      text not null,
  year        integer,
  score       numeric not null,
  categories  text[] not null default '{}',
  lists       text[] not null default '{}',   -- source list names, for "why is this ranked here"
  tagged      boolean not null default false,
  pace        text,
  pace_note   text,
  pages       integer,
  era         text,
  language    text,
  mood        text[] not null default '{}',
  why         text
);
create index if not exists reading_catalog_entry_score on reading_catalog_entry (score desc);
create index if not exists reading_catalog_entry_track on reading_catalog_entry (track);
create index if not exists reading_catalog_entry_tagged on reading_catalog_entry (tagged);

-- The 33 actual named lists the scores are built from (Modern Library 100, Booker winners, NYT
-- current bestsellers, etc.) -- each master.json carries these at the top level, one row per
-- list, not per book. Synced alongside the catalog since they come from the same five files.
-- `count` is the list's own real size (1001 Books really does carry 1,305 titles); `status` says
-- whether the whole list was captured ('ok') or only part of it ('partial').
create table if not exists reading_source_list (
  slug      text primary key,
  track     text not null,
  name      text not null,
  category  text not null,   -- critic | award | popular
  url       text,
  count     integer,
  status    text
);
create index if not exists reading_source_list_track on reading_source_list (track);

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

-- Same idea as reading_sync, separate table because the catalog syncs on a different cadence --
-- the masters only change when a new source list gets added, not every time a book is finished --
-- so its own staleness has nothing to do with the queue's.
create table if not exists reading_catalog_sync (
  id       bigserial primary key,
  ran_at   timestamptz not null default now(),
  ok       boolean     not null,
  rows     integer,
  error    text
);
create index if not exists reading_catalog_sync_ran on reading_catalog_sync (ran_at desc);

-- The store-shelf finder behind /reading/shelf. Separate from reading_catalog_entry on purpose:
-- that table mirrors the five per-corpus masters and is keyed for "rank everything I have not
-- read"; this one mirrors ReadingOS/data/all/master.json, the single unified pool, and is keyed
-- for a different question asked in a different place. Standing in a second-hand shop that
-- shelves by section and then alphabetically by author surname, the query is "I am at the M's in
-- Mystery, what should I pull", so the columns that matter are file_under, letter and shelves.
--
-- file_under is NOT the join key's surname. ReadingOS/scripts/lib/keys.mjs surname() takes
-- everything after the first word, which is correct for matching and wrong for filing: it put
-- Louisa May Alcott under M and T. H. White under H. fileUnder() there is the shop's version.
create table if not exists reading_shelf_entry (
  key         text primary key,
  title       text not null,
  author      text not null,
  file_under  text not null,                  -- the name a shop files it under
  letter      text not null,                  -- first letter of file_under, '#' if not A-Z
  year        integer,
  score       numeric not null,
  honours     integer not null default 0,     -- distinct honours, after same-prize dedup
  tier        text not null,                  -- grab | good | maybe
  shelves     text[] not null default '{}',   -- store sections: fiction | scifi | mystery | nonfiction
  lists       text[] not null default '{}',   -- named lists, for "why is this here"
  status      text                            -- read | queued | seen, else null
);
create index if not exists reading_shelf_entry_letter on reading_shelf_entry (letter);
create index if not exists reading_shelf_entry_tier on reading_shelf_entry (tier);
create index if not exists reading_shelf_entry_file on reading_shelf_entry (file_under, title);
create index if not exists reading_shelf_entry_shelves on reading_shelf_entry using gin (shelves);

create table if not exists reading_shelf_sync (
  id       bigserial primary key,
  ran_at   timestamptz not null default now(),
  ok       boolean     not null,
  rows     integer,
  error    text
);
create index if not exists reading_shelf_sync_ran on reading_shelf_sync (ran_at desc);

-- Added 2026-08-21 with the shelf redesign. "Shortest first" is the sort that most helps someone
-- choose a book they will actually finish, and it silently did nothing without a pages column.
-- Both are null for about 95% of the pool, since they come from hand-written tags.
alter table reading_shelf_entry add column if not exists pages integer;
alter table reading_shelf_entry add column if not exists pace  text;
