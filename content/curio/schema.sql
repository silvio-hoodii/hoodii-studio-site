-- CuriosityOS, read model for /curio.
--
-- CuriosityOS/log.md stays the ledger and the only thing sessions append to. This is a one-way
-- mirror of it, the same shape of arrangement as notion-mirror: the markdown is source of truth,
-- Postgres is what the web can read. Nothing here writes back.
--
-- The ReadLater pile is deliberately NOT mirrored. Digest JSON carries a `pile` array of saved
-- links, and it is unfiltered personal reading: the 2026-08-11 digest included a link about
-- getting recruited through YC's Work At a Startup board. /curio is public, and publishing that
-- would put back the job-seeking signal the hub was deliberately built without.

create table if not exists curio_items (
  id          text primary key,
  logged      date        not null,
  question    text        not null,
  answer      text        not null,
  flavor      text        not null,          -- why | howto | myth | word
  source_kind text        not null,          -- model | verified | verify
  source_url  text,                          -- set only when source_kind = 'verified'
  origin      text        not null,          -- asked | seed | gen
  status      text        not null,          -- fresh | sent | digging | retired
  sent_dates  date[]      not null default '{}',
  updated_at  timestamptz not null default now()
);

create index if not exists curio_items_logged_idx on curio_items (logged desc);
create index if not exists curio_items_status_idx on curio_items (status);

create table if not exists curio_digests (
  day           date primary key,
  subject       text        not null,
  opener        text,
  fresh         jsonb       not null default '[]'::jsonb,
  recall        jsonb       not null default '[]'::jsonb,
  still_chasing jsonb       not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- 2026-09-27: /curio became a daily quiz, and the ReadLater pile got a way back out.
--
-- These tables are the FIRST things under /curio the web writes to, and the only rows in this
-- file that are not a mirror of a markdown ledger. Grades and verdicts are made on his phone and
-- exist nowhere else, which is why they live in their own tables and not as columns on the
-- mirrored rows: sync.mjs upserts and deletes curio_items freely, and a grade stored on that row
-- would be wiped by the next sync.

-- One row per question he has graded at least once. No foreign key: sync.mjs deletes a curio_items
-- row when its question text changes, and a review row left pointing at nothing is simply never
-- dealt again, which is the right outcome.
create table if not exists curio_review (
  item_id     text primary key,
  box         int         not null,
  due         date        not null,
  first_seen  date        not null,
  last_grade  text        not null,          -- knew | missed
  reviews     int         not null default 1,
  updated_at  timestamptz not null default now()
);

create index if not exists curio_review_due_idx on curio_review (due);

-- The ReadLater pile, mirrored from KnowledgeVault/ReadLater by content/curio/sync-saves.mjs.
-- PRIVATE. The pile is unfiltered personal reading (see the note at the top of this file), so
-- nothing reads this table except /curio/api, which src/proxy.ts gates for EVERY method, reads
-- included. That is the one difference from every other /api prefix on the site.
create table if not exists curio_save (
  id          text primary key,              -- vault-relative path, e.g. AI-and-Agents/foo.md
  title       text        not null,
  tldr        text        not null default '',
  url         text,
  category    text        not null,
  captured    date,
  verdict     text,                          -- keep | drop | null (not judged yet)
  judged_at   timestamptz,
  updated_at  timestamptz not null default now()
);

create index if not exists curio_save_unjudged_idx on curio_save (captured desc) where verdict is null;

-- Phone notifications. One row per browser that said yes.
create table if not exists curio_push (
  endpoint    text primary key,
  sub         jsonb       not null,
  created_at  timestamptz not null default now(),
  last_ok     timestamptz,
  last_error  text
);
