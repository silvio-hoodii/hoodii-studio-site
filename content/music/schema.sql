-- Music, the read+write model for /music.
--
-- Unlike content/curio/schema.sql, this is NOT a mirror of a file that already holds the truth.
-- There is no ledger behind it. Spotify's `recently-played` endpoint returns at most 50 items and
-- will never return more, which for Silvio's listening reaches back roughly two days. Spotify does
-- not keep a history for us to fetch, so this table IS the history: it exists only because a job
-- writes into it before the 50-item window slides past. Miss enough runs and the tracks in the gap
-- are gone permanently, from everywhere, not just from here.
--
-- That is also why nothing on the page may imply history older than this table. The first play row
-- is the beginning of recorded time, and saying otherwise would be inventing state we cannot reach,
-- which is the rule src/app/page.tsx is built around.

create table if not exists music_play (
  -- Spotify's own played_at is the dedupe key the whole design rests on. It is millisecond
  -- precision and one person cannot start two tracks in the same millisecond, so re-running the
  -- poller against an overlapping window is a no-op rather than a duplicate. Never generate a
  -- surrogate id here: that would make every overlapping run insert the same play again.
  played_at    timestamptz primary key,
  track_id     text        not null,
  track_name   text        not null,
  artist_name  text        not null,
  album_name   text,
  album_image  text,
  track_url    text,
  duration_ms  integer,
  context_type text,                                   -- playlist | album | artist, null when none
  inserted_at  timestamptz not null default now()
);

create index if not exists music_play_played_idx on music_play (played_at desc);
create index if not exists music_play_artist_idx on music_play (artist_name);
create index if not exists music_play_track_idx  on music_play (track_id);

-- Top tracks and artists, snapshotted rather than proxied.
--
-- Spotify computes these itself over three windows and they are cheap to read, but snapshotting
-- means the page renders from Postgres with no API round trip, and it means that months from now
-- the movement between snapshots is visible. That movement is the only trend data this project can
-- ever have: audio-features, related-artists and recommendations are all permanently 403/404 for
-- apps registered after 2024-11-27, verified empirically 2026-08-11. No mood charts, no genre
-- graph, no recommender. Do not design around those endpoints.
create table if not exists music_top (
  captured_on date    not null,
  kind        text    not null,                        -- track | artist
  time_range  text    not null,                        -- short_term (4wk) | medium_term (6mo) | long_term (all)
  rank        integer not null,
  spotify_id  text    not null,
  name        text    not null,
  detail      text,                                    -- the artist, for a track; genres, for an artist
  image       text,
  url         text,
  primary key (captured_on, kind, time_range, rank)
);

create index if not exists music_top_recent_idx on music_top (captured_on desc, kind, time_range, rank);

-- Every poller run, success and failure alike.
--
-- This table is the liveness check, and it exists because of a specific silent failure. The
-- refresh token expires every 180 days while the Spotify app sits in Development mode, and
-- fetchSpotify() in src/lib/fetchers.ts catches everything and returns { isPlaying: false },
-- which is exactly what a working call returns when nothing is playing. A dead integration and a
-- quiet evening are indistinguishable from the outside.
--
-- So liveness is asserted by a row that says a call SUCCEEDED. It is never inferred from the
-- absence of an error, because the absence of an error is the failure mode.
create table if not exists music_sync (
  ran_at      timestamptz primary key default now(),
  ok          boolean     not null,
  plays_added integer     not null default 0,
  tops_added  integer     not null default 0,
  error       text
);

create index if not exists music_sync_ok_idx on music_sync (ok, ran_at desc);
