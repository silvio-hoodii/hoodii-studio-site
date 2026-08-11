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
