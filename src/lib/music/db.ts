import 'server-only';
import { today } from '@/lib/day';
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

/* THE SATURATION WARNING'S MARK, shared by the writer (sync.ts) and the reader (getSummary), so the
 * two cannot drift. music_sync has no column for it and the warning lives in `error` beside any
 * top-snapshot failures, so the page alarms on this phrase only, never on "the run had a warning".
 * Every saturated row already stored carries it. */
export const SATURATION_MARK = 'full 50-item maximum';

/**
 * Insert plays, ignoring any we already hold. ONE statement for the whole batch (unnest over column
 * arrays), not fifty round trips.
 *
 * `on conflict (played_at) do nothing` is the dedupe the whole design rests on, and it is why the
 * poller can be run twice in a row, or run against an overlapping window, without corrupting the
 * history. Returns how many were genuinely new, which is the number worth logging: "50 fetched" is
 * noise, "3 new" is the signal that the window is not sliding past us.
 */
export async function insertPlays(rows: PlayRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const res = await sql`
    insert into music_play
      (played_at, track_id, track_name, artist_name, album_name, album_image, track_url,
       duration_ms, context_type)
    select * from unnest(
      ${rows.map((r) => r.playedAt)}::timestamptz[],
      ${rows.map((r) => r.trackId)}::text[],
      ${rows.map((r) => r.trackName)}::text[],
      ${rows.map((r) => r.artistName)}::text[],
      ${rows.map((r) => r.albumName)}::text[],
      ${rows.map((r) => r.albumImage)}::text[],
      ${rows.map((r) => r.trackUrl)}::text[],
      ${rows.map((r) => r.durationMs)}::integer[],
      ${rows.map((r) => r.contextType)}::text[])
    on conflict (played_at) do nothing
    returning played_at`;
  return res.length;
}

export interface TopSnapshot { kind: 'track' | 'artist'; range: TimeRange; rows: TopRow[] }

/** Snapshot every (kind, range) pair for one day in ONE transaction: a delete and a multi-row insert
 *  per pair. Re-running the same day overwrites, so a second run never produces a half-old half-new
 *  chart, and a failure part way leaves the previous snapshot whole. */
export async function replaceTops(capturedOn: string, snaps: TopSnapshot[]): Promise<number> {
  if (snaps.length === 0) return 0;
  await sql.transaction(
    snaps.flatMap(({ kind, range, rows }) => [
      sql`
        delete from music_top
         where captured_on = ${capturedOn} and kind = ${kind} and time_range = ${range}`,
      sql`
        insert into music_top (captured_on, kind, time_range, rank, spotify_id, name, detail, image, url)
        select ${capturedOn}::date, ${kind}, ${range}, u.* from unnest(
          ${rows.map((r) => r.rank)}::integer[],
          ${rows.map((r) => r.spotifyId)}::text[],
          ${rows.map((r) => r.name)}::text[],
          ${rows.map((r) => r.detail)}::text[],
          ${rows.map((r) => r.image)}::text[],
          ${rows.map((r) => r.url)}::text[]) as u`,
    ]),
  );
  return snaps.reduce((n, s) => n + s.rows.length, 0);
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

/* THE PRIMARY ARTIST, wherever plays are counted by artist. spotify.ts stores every credited artist
 * joined with ", " ("A, B"), so grouping on the raw column counted each collaboration as an artist
 * of its own. The first name is the lead credit. The stored data is unchanged. Known gap: an artist
 * whose own name contains ", " is cut at the comma. Inlined as SQL text in each query below because
 * a tagged-template fragment would be sent as a bound string parameter, not as SQL. */

export interface Play {
  playedAt: string; trackName: string; artistName: string;
  albumName: string | null; albumImage: string | null; trackUrl: string | null;
}

export interface Liveness {
  lastOkAt: string | null;
  /** The newest failure since the last success. */
  lastError: string | null;
  /** True when the collector has not succeeded recently enough to outrun the 50-item window. */
  stale: boolean;
  /** THE NEWEST SATURATED RUN IN THE LAST 7 DAYS, and the reason this field exists.
   *
   * A successful run that returned the full 50-item maximum means listening outran the poll interval
   * and the plays between runs are gone from everywhere. sync.ts writes that sentence into
   * `music_sync.error` with `ok: true`, because the run itself succeeded. Until 2026-08-28 nothing
   * read it (05-small-apps M1: a partial capture presenting as a complete one). Until 2026-09-27 the
   * page read the LAST run's whole warning string, so the notice fired on any top-snapshot failure
   * and cleared on the next clean run. Now it matches SATURATION_MARK and holds for 7 days. */
  lostPlaysAt: string | null;
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

/** Counts and liveness in ONE round trip: two statements in one transaction. */
export async function getSummary(): Promise<MusicSummary> {
  const [[counts], [live]] = (await sql.transaction([
    sql`
      select count(*)::int                                          as plays,
             count(distinct split_part(artist_name, ', ', 1))::int  as artists,
             count(distinct track_id)::int                          as tracks,
             min(played_at)                                         as since,
             max(played_at)                                         as latest
        from music_play`,
    /* THE NEWEST FAILURE SINCE THE LAST SUCCESS, and the `ran_at >` bound is the whole point: an
     * unbounded "newest failure ever" printed July's already-recovered error as the reason nothing
     * had run since (05-small-apps M4). `coalesce(..., '-infinity')` so a table that has NEVER
     * succeeded still surfaces its failures. */
    sql`
      select (select max(ran_at) from music_sync where ok) as last_ok_at,
             (select error from music_sync
               where not ok
                 and ran_at > coalesce((select max(ran_at) from music_sync where ok), '-infinity'::timestamptz)
               order by ran_at desc limit 1) as last_error,
             (select max(ran_at) from music_sync
               where ok and ran_at > now() - interval '7 days'
                 and position(${SATURATION_MARK} in coalesce(error, '')) > 0) as lost_at`,
  ])) as [
    Array<{ plays: number; artists: number; tracks: number; since: unknown; latest: unknown }>,
    Array<{ last_ok_at: unknown; last_error: string | null; lost_at: unknown }>,
  ];

  const lastOkAt = live?.last_ok_at ? iso(live.last_ok_at) : null;
  const hoursSinceOk = lastOkAt ? (Date.now() - new Date(lastOkAt).getTime()) / 3_600_000 : null;

  return {
    plays: counts?.plays ?? 0,
    artists: counts?.artists ?? 0,
    tracks: counts?.tracks ?? 0,
    since: counts?.since ? iso(counts.since) : null,
    latest: counts?.latest ? iso(counts.latest) : null,
    liveness: {
      lastOkAt,
      lastError: live?.last_error ?? null,
      // Never having run counts as stale. An empty table is not a healthy one.
      stale: hoursSinceOk === null || hoursSinceOk > STALE_HOURS,
      lostPlaysAt: live?.lost_at ? iso(live.lost_at) : null,
    },
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

export interface TopEntry {
  rank: number; name: string; detail: string | null; image: string | null; url: string | null;
}

export interface TopSnap { capturedOn: string | null; entries: TopEntry[] }

/** The latest snapshot of every (kind, range), in ONE query. A pair never captured comes back with
 *  capturedOn null and no entries. */
export async function getLatestTops(): Promise<Record<'track' | 'artist', Record<TimeRange, TopSnap>>> {
  const rows = (await sql`
    select t.kind, t.time_range, t.captured_on, t.rank, t.name, t.detail, t.image, t.url
      from music_top t
      join (select kind, time_range, max(captured_on) as day
              from music_top group by kind, time_range) l
        on l.kind = t.kind and l.time_range = t.time_range and l.day = t.captured_on
     order by t.kind, t.time_range, t.rank`) as Array<TopEntry & {
    kind: 'track' | 'artist'; time_range: TimeRange; captured_on: unknown;
  }>;
  const empty = (): Record<TimeRange, TopSnap> => ({
    short_term: { capturedOn: null, entries: [] },
    medium_term: { capturedOn: null, entries: [] },
    long_term: { capturedOn: null, entries: [] },
  });
  const out = { track: empty(), artist: empty() };
  for (const r of rows) {
    const snap = out[r.kind]?.[r.time_range];
    if (!snap) continue;
    snap.capturedOn = day(r.captured_on);
    snap.entries.push({ rank: r.rank, name: r.name, detail: r.detail, image: r.image, url: r.url });
  }
  return out;
}

/* ---- the pictures on /music (2026-09-27) ---------------------------------------------------------
 *
 * His ask: "it's just like showing off songs, so maybe we can just find something else to kind of
 * show instead of just lists of songs, something more graphic". Everything below is counted from
 * music_play, OUR collected history, never from Spotify's top charts.
 *
 * THE HOUR IS CALGARY'S BY ZONE NAME, and that is a deliberate exception to the workspace rule that
 * an offset comes off the row: Spotify's recently-played gives a UTC instant and no offset, so there
 * is nothing on the row to read. America/Edmonton is right for every play he makes at home, which is
 * all of them so far. A play made abroad would land in the wrong hour of the clock and nowhere else.
 */

/** Spotify serves every album image at three sizes on the same hash; only the size prefix differs. */
export function spotifyImage(url: string | null, size: 64 | 300 | 640): string | null {
  if (!url) return null;
  const code = size === 64 ? 'ab67616d00004851' : size === 300 ? 'ab67616d00001e02' : 'ab67616d0000b273';
  return url.replace(/ab67616d0000(?:b273|1e02|4851)/, code);
}

export interface Listening {
  /** The window the clock, the wall and the bars cover: 60 days, or fewer while the table is younger. */
  days: number;
  /** minutes[weekday 0=Mon..6=Sun][hour 0..23] */
  clock: number[][];
  /** One entry per day, oldest first: the last 30 days, or every day since the first play. */
  perDay: { day: string; minutes: number }[];
  albums: { name: string; artist: string; image: string | null; plays: number }[];
  artists: Tally[];
  totalMinutes: number;
}

/* MINUTES ARE TRACK LENGTHS. Spotify's recently-played gives the track's duration and no listened
 * time, so a skip counts as the whole track. The page labels them "track" minutes for that reason.
 *
 * THE WINDOW IS CAPPED AT THE COLLECTED DAYS. Collection began 2026-08-11, so "the last 60 days"
 * was a claim about days the table does not hold. `days` is 60 or the whole days since the first
 * play, whichever is smaller, and the page prints it. */
export async function getListening(maxDays = 60): Promise<Listening> {
  const [firstRows, clockRows, dayRows, albumRows, artistRows] = (await sql.transaction([
    sql`
      select min(played_at) as first,
             to_char(min(played_at) at time zone 'America/Edmonton', 'YYYY-MM-DD') as first_day
        from music_play`,
    sql`
      select extract(isodow from played_at at time zone 'America/Edmonton')::int as dow,
             extract(hour   from played_at at time zone 'America/Edmonton')::int as hour,
             sum(coalesce(duration_ms, 0))::float / 60000 as minutes
        from music_play
       where played_at > now() - make_interval(days => ${maxDays})
       group by 1, 2`,
    sql`
      select to_char(played_at at time zone 'America/Edmonton', 'YYYY-MM-DD') as day,
             sum(coalesce(duration_ms, 0))::float / 60000 as minutes
        from music_play
       where played_at > now() - make_interval(days => 30)
       group by 1 order by 1`,
    /* By album AND primary artist: two albums that share a title ("Greatest Hits") are different
     * records. No album id is stored, so this pair is the key. */
    sql`
      select album_name as name, split_part(artist_name, ', ', 1) as artist,
             max(album_image) as image, count(*)::int as plays
        from music_play
       where played_at > now() - make_interval(days => ${maxDays}) and album_name is not null
       group by 1, 2 order by plays desc, name limit 15`,
    /* The primary artist: see THE PRIMARY ARTIST at the top of the reads. */
    sql`
      select split_part(artist_name, ', ', 1) as name, count(*)::int as plays
        from music_play
       where played_at > now() - make_interval(days => ${maxDays})
       group by 1 order by plays desc, name limit 8`,
  ])) as [
    Array<{ first: unknown; first_day: string | null }>,
    Array<{ dow: number; hour: number; minutes: number }>,
    Array<{ day: string; minutes: number }>,
    Array<{ name: string; artist: string; image: string | null; plays: number }>,
    Tally[],
  ];

  const first = firstRows[0]?.first ? new Date(iso(firstRows[0].first)).getTime() : null;
  const days = first === null
    ? 0
    : Math.min(maxDays, Math.max(1, Math.ceil((Date.now() - first) / 86_400_000)));

  const clock = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let totalMinutes = 0;
  for (const r of clockRows) {
    const row = clock[r.dow - 1];
    if (row) row[r.hour] = r.minutes;
    totalMinutes += r.minutes;
  }

  /* Every day of the window, zeros included: a day with no music is part of the picture. A day
   * before the first play is not a day with no music, so it is not drawn. */
  const byDay = new Map(dayRows.map((r) => [r.day, r.minutes]));
  const perDay: { day: string; minutes: number }[] = [];
  const todayCal = today();
  const firstDay = firstRows[0]?.first_day ?? todayCal;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(`${todayCal}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (key < firstDay) continue;
    perDay.push({ day: key, minutes: byDay.get(key) ?? 0 });
  }

  return {
    days,
    clock,
    perDay,
    albums: albumRows.map((a) => ({ ...a, image: spotifyImage(a.image, 300) })),
    artists: artistRows,
    totalMinutes,
  };
}
