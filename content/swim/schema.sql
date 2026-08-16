-- Lane-swim schedules for Calgary pools, same Neon project as the rest (swim_ prefix keeps the
-- tables apart, no separate database).
--
-- SwimOS/wedge/app/data/schedule.json stays canonical. Six scrapers run on the laptop at 05:30 and
-- write it; content/swim/sync.mjs pushes a mirror here. Nothing on the web writes back, so there is
-- no /swim/api at all.
--
-- WHY THE SCRAPERS ARE NOT ON VERCEL. The City scraper makes seven sequential HTTP calls and the
-- YMCA one makes roughly six branches x three calls, all against council and gym websites that
-- change their markup without warning. That is a different reliability problem than this site has,
-- and it belongs on a machine where a failure is a log line rather than a 504. The laptop is the
-- source of truth, Neon is the mirror, a scheduled task pushes it. Same road as health and curio.

-- One lane-swim session at one pool on one day.
--
-- `id` is a manufactured key, because the source has none: schedule.json is regenerated from
-- scratch every morning and nothing in it is stable across runs. The sync joins the identifying
-- fields with a separator and stores the result, the same way content/curio/sync.mjs manufactures
-- an id from a question. That also makes the sync idempotent for free.
--
-- DETAIL AND NOTE ARE PART OF THE KEY, and leaving them out silently lost real sessions. The first
-- version keyed on (pool, activity, date, start, "end") and 439 sessions became 437 rows without
-- complaining, because two pairs collide:
--
--   MNP, 2026-08-19 10:30 to 12:30, "North Comp" and "South Comp"
--   Seton YMCA, 2026-08-21 09:00 to 12:00, "Limited" and "50m Configuration - 6 Lanes"
--
-- Those are two different bodies of water and two different lane setups at the same hour, both
-- genuinely swimmable. An `on conflict do update` merged each pair into one row, so the page
-- under-reported what was open and nothing anywhere said so. A key that quietly discards rows is
-- worse than a key that collides loudly. Hence a single text id built from every field that can
-- distinguish two sessions, with nulls coalesced, since a primary key cannot hold one.
--
-- Times are Calgary wall clock as "HH:MM", zero-padded, 24-hour, exactly as the scrapers emit them.
-- Kept as text on purpose. Every comparison this app makes is either against another such string or
-- against the current local time, and string compare is correct for both because of the padding.
-- Storing them as timestamptz would mean choosing a timezone for a value whose whole meaning is
-- "what the clock on the pool wall will say", and would break the day the province stops observing
-- daylight time.
create table if not exists swim_session (
  id        text primary key,
  pool      text not null,
  activity  text not null,
  date      text not null,
  start     text not null,
  "end"     text not null,
  op        text not null,
  detail    text,
  spaces    integer,
  note      text
);
create index if not exists swim_session_date on swim_session (date, start);

-- Every Calgary pool, INCLUDING the ones with no schedule here.
--
-- This is the trust mechanism and not a footnote. SwimOS/wedge/DESIGN.md is explicit about why:
-- silent omission is what killed the hand-built Reddit list this app replaced. A pool that is
-- seasonal, closed for renovation, or simply not scraped yet has to appear and say which, or a
-- reader cannot tell "no lane swim there" from "we did not look".
create table if not exists swim_coverage (
  name    text primary key,
  op      text not null,
  area    text,
  status  text not null,   -- live | coming | seasonal | closed
  note    text
);

-- Straight-line distance needs a point, and pool length is the other thing worth knowing before you
-- drive. Only pools the registry has a fix for get a row, which is fewer than are covered.
create table if not exists swim_pool (
  name  text primary key,
  lat   double precision,
  lng   double precision,
  len   integer
);

-- Every run of content/swim/sync.mjs writes a row here, successful or not.
--
-- TWO DIFFERENT THINGS CAN BE WRONG and this surface has to tell them apart, which is one more than
-- /health had to. First, the mirror stops being written: the laptop was asleep, the task did not
-- fire, Neon refused. `ran_at` catches that. Second, and unique to this app, the mirror is written
-- perfectly from a schedule.json whose seven-day window no longer includes today, because the
-- scrapers themselves stopped returning anything. `covers_through` catches that.
--
-- The second one is the dangerous one. A body weight that is a fortnight old is merely old. A lane
-- swim timetable that is one day old is ACTIVELY WRONG, and it fails in the quietest possible way:
-- the page filters for today, finds nothing, and says "nothing else today" as though the pools were
-- shut. `generated` and `covers_through` exist so the page can say the true thing instead.
create table if not exists swim_sync (
  id             bigserial primary key,
  ran_at         timestamptz not null default now(),
  ok             boolean     not null,
  generated      timestamptz,   -- payload.generated: when the scrapers ran, not when we mirrored
  covers_through text,          -- max(session.date) in the payload
  session_rows   integer,
  coverage_rows  integer,
  error          text
);
create index if not exists swim_sync_ran on swim_sync (ran_at desc);
create index if not exists swim_sync_ok on swim_sync (ok, ran_at desc);
