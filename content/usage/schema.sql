-- Which app he opened, per day. Added 2026-09-27 after the usage audit could not tell his visits
-- from strangers' and crawlers': Vercel's request log has no field that says "him", and grouping by
-- user agent timed out. A signed-in device posts one beacon per page view to /me/api/open, which
-- src/proxy.ts gates, so every row here is him and nothing else. One row per day per app, a count,
-- nothing about what he did there.
create table if not exists app_open (
  day    date not null,
  app    text not null,
  opens  int  not null default 1,
  last_at timestamptz not null default now(),
  primary key (day, app)
);
