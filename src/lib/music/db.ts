import 'server-only';
import { neon } from '@neondatabase/serverless';
import type { PlayRow, TopRow, TimeRange } from './spotify';

/* Same connection-string ladder as curio, gym and kitchen. They are all literally the same Neon
 * database; the table prefix is what keeps the apps apart. The fallback chain exists because
 * `vercel env add` has silently written empty values before (see project_gym_migration_2026_08_10),
 * so a missing MUSIC_DATABASE_URL must not take the route down. */
const DATABASE_URL =
  process.env.MUSIC_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('MUSIC_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL as fallback) is not set');
}

export const sql = neon(DATABASE_URL);

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v ?? '');
}
function day(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
}

/* ---------------------------------------------------------------- writes */

/**
 * Insert plays, ignoring any we already hold.
 *
 * `on conflict (played_at) do nothing` is the dedupe the whole design rests on, and it is why the
 * poller can be run twice in a row, or run against an overlapping window, without corrupting the
 * history. Returns how many were genuinely new, which is the number worth logging: "50 fetched" is
 * noise, "3 new" is the signal that the window is not sliding past us.
 */
export async function insertPlays(rows: PlayRow[]): Promise<number> {
  let added = 0;
  for (const r of rows) {
    const res = await sql`
      insert into music_play
        (played_at, track_id, track_name, artist_name, album_name, album_image, track_url,
         duration_ms, context_type)
      values
        (${r.playedAt}, ${r.trackId}, ${r.trackName}, ${r.artistName}, ${r.albumName},
         ${r.albumImage}, ${r.trackUrl}, ${r.durationMs}, ${r.contextType})
      on conflict (played_at) do nothing
      returning played_at`;
    added += res.length;
  }
  return added;
}

/** Snapshot one (kind, range) pair for one day. Re-running the same day overwrites, so a second
 *  run never produces a half-old half-new chart. */
export async function replaceTop(
  capturedOn: string,
  kind: 'track' | 'artist',
  range: TimeRange,
  rows: TopRow[],
): Promise<number> {
  await sql`
    delete from music_top
     where captured_on = ${capturedOn} and kind = ${kind} and time_range = ${range}`;
  for (const r of rows) {
    await sql`
      insert into music_top (captured_on, kind, time_range, rank, spotify_id, name, detail, image, url)
      values (${capturedOn}, ${kind}, ${range}, ${r.rank}, ${r.spotifyId}, ${r.name},
              ${r.detail}, ${r.image}, ${r.url})`;
  }
  return rows.length;
}

export async function recordSync(e: {
  ok: boolean; playsAdded?: number; topsAdded?: number; error?: string | null;
}): Promise<void> {
  await sql`
    insert into music_sync (ran_at, ok, plays_added, tops_added, error)
    values (now(), ${e.ok}, ${e.playsAdded ?? 0}, ${e.topsAdded ?? 0}, ${e.error ?? null})`;
}

/** The newest play we hold, as Unix ms, for the `after` parameter. */
export async function newestPlayedAtMs(): Promise<number | undefined> {
  const [row] = (await sql`select max(played_at) as newest from music_play`) as Array<{ newest: unknown }>;
  if (!row?.newest) return undefined;
  const t = new Date(iso(row.newest)).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/* ---------------------------------------------------------------- reads */

export interface Play {
  playedAt: string; trackName: string; artistName: string;
  albumName: string | null; albumImage: string | null; trackUrl: string | null;
}

export interface Liveness {
  lastOkAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  /** Hours since the last SUCCESSFUL run. null when there has never been one. */
  hoursSinceOk: number | null;
  /** True when the collector has not succeeded recently enough to outrun the 50-item window. */
  stale: boolean;
}

export interface MusicSummary {
  plays: number;
  artists: number;
  tracks: number;
  since: string | null;
  /* The newest play in the store, which is a different question from whether the collector ran.
   * On 2026-08-14 the collector had run cleanly three times a day for three days and added zero
   * plays each time: everything in the table arrived in ONE backfill on 2026-08-11 that hit the
   * 50-item cap. A working collector with nothing to collect looks exactly like a broken one from
   * the outside, so the page has to state the last play rather than imply accumulation. */
  latest: string | null;
  liveness: Liveness;
}

/* A successful run older than this means plays are probably being lost. The 50-item cap covered
 * roughly two days of Silvio's listening as measured on 2026-08-11, and the poller is scheduled
 * three times a day, so 36 hours is several missed runs rather than one late one. */
const STALE_HOURS = 36;

export async function getLiveness(): Promise<Liveness> {
  const [ok] = (await sql`
    select max(ran_at) as at from music_sync where ok = true`) as Array<{ at: unknown }>;
  const [bad] = (await sql`
    select ran_at, error from music_sync where ok = false order by ran_at desc limit 1`) as Array<{
    ran_at: unknown; error: string | null;
  }>;

  const lastOkAt = ok?.at ? iso(ok.at) : null;
  const hoursSinceOk = lastOkAt ? (Date.now() - new Date(lastOkAt).getTime()) / 3_600_000 : null;

  return {
    lastOkAt,
    lastError: bad?.error ?? null,
    lastErrorAt: bad?.ran_at ? iso(bad.ran_at) : null,
    // Never having run counts as stale. An empty table is not a healthy one.
    stale: hoursSinceOk === null || hoursSinceOk > STALE_HOURS,
    hoursSinceOk,
  };
}

export async function getSummary(): Promise<MusicSummary> {
  const [counts] = (await sql`
    select count(*)::int                     as plays,
           count(distinct artist_name)::int  as artists,
           count(distinct track_id)::int     as tracks,
           min(played_at)                    as since,
           max(played_at)                    as latest
      from music_play`) as Array<{ plays: number; artists: number; tracks: number; since: unknown; latest: unknown }>;

  return {
    plays: counts?.plays ?? 0,
    artists: counts?.artists ?? 0,
    tracks: counts?.tracks ?? 0,
    since: counts?.since ? iso(counts.since) : null,
    latest: counts?.latest ? iso(counts.latest) : null,
    liveness: await getLiveness(),
  };
}

export async function getRecentPlays(limit = 60): Promise<Play[]> {
  const rows = (await sql`
    select played_at, track_name, artist_name, album_name, album_image, track_url
      from music_play order by played_at desc limit ${limit}`) as Array<{
    played_at: unknown; track_name: string; artist_name: string;
    album_name: string | null; album_image: string | null; track_url: string | null;
  }>;
  return rows.map((r) => ({
    playedAt: iso(r.played_at),
    trackName: r.track_name,
    artistName: r.artist_name,
    albumName: r.album_name,
    albumImage: r.album_image,
    trackUrl: r.track_url,
  }));
}

export interface Tally { name: string; plays: number }

/** Most-played from OUR OWN collected history, which is a different claim from Spotify's "top"
 *  and must never be labelled as the same thing. This one only knows what the poller caught. */
export async function getMostPlayed(limit = 10): Promise<{ artists: Tally[]; tracks: Tally[] }> {
  const artists = (await sql`
    select artist_name as name, count(*)::int as plays
      from music_play group by artist_name order by plays desc, name limit ${limit}`) as Tally[];
  const tracks = (await sql`
    select track_name as name, count(*)::int as plays
      from music_play group by track_name order by plays desc, name limit ${limit}`) as Tally[];
  return { artists, tracks };
}

export interface TopEntry {
  rank: number; name: string; detail: string | null; image: string | null; url: string | null;
}

/** The latest snapshot for one (kind, range). Empty until the poller has run once. */
export async function getLatestTop(kind: 'track' | 'artist', range: TimeRange): Promise<{
  capturedOn: string | null; entries: TopEntry[];
}> {
  const [latest] = (await sql`
    select max(captured_on) as day from music_top where kind = ${kind} and time_range = ${range}`) as
    Array<{ day: unknown }>;
  if (!latest?.day) return { capturedOn: null, entries: [] };

  const capturedOn = day(latest.day);
  const entries = (await sql`
    select rank, name, detail, image, url
      from music_top
     where kind = ${kind} and time_range = ${range} and captured_on = ${capturedOn}
     order by rank`) as TopEntry[];
  return { capturedOn, entries };
}
