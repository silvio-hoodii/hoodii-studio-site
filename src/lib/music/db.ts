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
