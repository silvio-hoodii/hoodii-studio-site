-- The one number the whole swim ladder is measured from.
--
-- Every rung in content/swim/plan.json reads "your number plus 100 m". Until 2026-08-22 there was
-- nowhere to put that number, which he said out loud: "If there's a number that I need here, why is
-- there not a slot for me to actually input a number? Where am I supposed to put that number and
-- then how to actually do it?" The plan had a hole in the middle of it for a month.
--
-- THE TABLE KEEPS ITS gym_ PREFIX. The file moved here on 2026-08-26 with the rest of swim; the
-- table did not get renamed, deliberately. Renaming a live table to tidy a prefix is churn that
-- buys nothing, breaks the HealthOS importer, and would need a migration on a store holding the
-- only copy of the number.
--
-- A HISTORY, not one row. Re-calibrating in eight weeks is the point of the ladder, and overwriting
-- would throw away the evidence that it worked.
create table if not exists gym_swim_baseline (
  id          bigserial primary key,
  measured_on text not null,
  metres      integer not null,
  -- Whether the buoy was on the deck. The whole reason the number is unknown is that the lap data
  -- says 600 m and he said 200 m, and nothing in the watch export records a pull buoy. A baseline
  -- swum with one between the legs is a different number and must not silently replace the other.
  no_buoy     boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists gym_swim_baseline_on on gym_swim_baseline (measured_on desc);
