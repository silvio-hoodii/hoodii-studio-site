import 'server-only';

/* A Spotify client that FAILS LOUDLY, which is the whole reason it exists separately from
 * src/lib/fetchers.ts.
 *
 * fetchSpotify() there is correct for what it does: it feeds a hub footer that should degrade to
 * nothing, so it catches everything and returns { isPlaying: false }. But that return value is
 * identical whether the integration is healthy and nothing is playing, or the refresh token died
 * and every call is 400ing. The token DOES die, silently, every 180 days while the app sits in
 * Development mode.
 *
 * A poller cannot use that shape. If it did, a dead token would look like six months of Silvio not
 * listening to music, and by the time anyone noticed, the 50-item window would have slid past
 * thousands of plays that Spotify will never hand back. So everything here throws, and sync.ts
 * writes the error into music_sync where it can be seen.
 *
 * Do not add a try/catch that returns a default from this file. That is the bug. */

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';

export class SpotifyAuthError extends Error {}
export class SpotifyApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface PlayRow {
  playedAt: string;
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  albumImage: string | null;
  trackUrl: string | null;
  durationMs: number | null;
  contextType: string | null;
}

export interface TopRow {
  rank: number;
  spotifyId: string;
  name: string;
  detail: string | null;
  image: string | null;
  url: string | null;
}

export const TIME_RANGES = ['short_term', 'medium_term', 'long_term'] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

/** What Spotify's opaque range names actually mean, so no other file has to remember. */
export const RANGE_LABEL: Record<TimeRange, string> = {
  short_term: 'last 4 weeks',
  medium_term: 'last 6 months',
  long_term: 'all time',
};

interface SpotifyArtist { id?: string; name?: string; genres?: string[] }
interface SpotifyImage { url?: string }
interface SpotifyTrack {
  id?: string;
  name?: string;
  artists?: SpotifyArtist[];
  album?: { name?: string; images?: SpotifyImage[] };
  external_urls?: { spotify?: string };
  duration_ms?: number;
}

export async function getAccessToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new SpotifyAuthError(
      'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN are not all set',
    );
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    cache: 'no-store',
  });

  if (!res.ok) {
    /* This is the 180-day death, and the message says so explicitly because the raw Spotify body
     * ("invalid_grant") reads like a code bug rather than an expiry that was always going to
     * happen. Re-auth: mint an authorize URL pointing at https://hoodii.studio/callback, click it,
     * paste the code back, exchange it, then update .env.local AND the Vercel env var. */
    const body = await res.text().catch(() => '');
    throw new SpotifyAuthError(
      `token refresh failed (${res.status}). The refresh token expires every 180 days while the ` +
        `Spotify app is in Development mode, and this is what that looks like. Re-auth via ` +
        `/callback and update SPOTIFY_REFRESH_TOKEN in .env.local and Vercel. Spotify said: ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new SpotifyAuthError('token refresh returned no access_token');
  return data.access_token;
}

async function api<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new SpotifyApiError(`GET ${path} failed (${res.status}): ${body.slice(0, 200)}`, res.status);
  }
  return (await res.json()) as T;
}

function artistsOf(t: SpotifyTrack): string {
  return (t.artists ?? []).map((a) => a.name).filter(Boolean).join(', ') || 'Unknown artist';
}

/**
 * The 50 most recent plays, newest first. Fifty is Spotify's hard ceiling, not a page size: there
 * is no cursor that walks further back, and `before`/`after` only move the window, never widen it.
 *
 * @param after Unix ms. Spotify returns plays strictly after this. Passing the newest play we
 *   already hold makes a re-run cheap, but the dedupe in sync.ts is what guarantees correctness,
 *   not this parameter.
 */
export async function getRecentlyPlayed(token: string, after?: number): Promise<PlayRow[]> {
  const qs = new URLSearchParams({ limit: '50' });
  if (after) qs.set('after', String(after));

  const data = await api<{
    items?: Array<{ track?: SpotifyTrack; played_at?: string; context?: { type?: string } }>;
  }>(`/me/player/recently-played?${qs}`, token);

  const rows: PlayRow[] = [];
  for (const item of data.items ?? []) {
    const t = item.track;
    if (!t?.id || !t.name || !item.played_at) continue;
    rows.push({
      playedAt: item.played_at,
      trackId: t.id,
      trackName: t.name,
      artistName: artistsOf(t),
      albumName: t.album?.name ?? null,
      albumImage: t.album?.images?.[0]?.url ?? null,
      trackUrl: t.external_urls?.spotify ?? null,
      durationMs: t.duration_ms ?? null,
      contextType: item.context?.type ?? null,
    });
  }
  return rows;
}

export async function getTopTracks(token: string, range: TimeRange, limit = 20): Promise<TopRow[]> {
  const data = await api<{ items?: SpotifyTrack[] }>(
    `/me/top/tracks?time_range=${range}&limit=${limit}`,
    token,
  );
  return (data.items ?? []).flatMap((t, i) =>
    t.id && t.name
      ? [{
          rank: i + 1,
          spotifyId: t.id,
          name: t.name,
          detail: artistsOf(t),
          image: t.album?.images?.[0]?.url ?? null,
          url: t.external_urls?.spotify ?? null,
        }]
      : [],
  );
}

export async function getTopArtists(token: string, range: TimeRange, limit = 20): Promise<TopRow[]> {
  const data = await api<{
    items?: Array<SpotifyArtist & { images?: SpotifyImage[]; external_urls?: { spotify?: string } }>;
  }>(`/me/top/artists?time_range=${range}&limit=${limit}`, token);
  return (data.items ?? []).flatMap((a, i) =>
    a.id && a.name
      ? [{
          rank: i + 1,
          spotifyId: a.id,
          name: a.name,
          detail: (a.genres ?? []).slice(0, 3).join(', ') || null,
          image: a.images?.[0]?.url ?? null,
          url: a.external_urls?.spotify ?? null,
        }]
      : [],
  );
}

export interface NowPlaying {
  trackName: string;
  artistName: string;
  albumImage: string | null;
  url: string | null;
}

/** null means genuinely nothing playing. A dead token throws instead, which is the entire point. */
export async function getNowPlaying(token: string): Promise<NowPlaying | null> {
  const res = await fetch(`${API}/me/player/currently-playing`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  // 204 is Spotify's "nothing is playing", and it has no body to parse.
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new SpotifyApiError(`currently-playing failed (${res.status}): ${body.slice(0, 200)}`, res.status);
  }
  const data = (await res.json()) as { is_playing?: boolean; item?: SpotifyTrack };
  if (!data.is_playing || !data.item?.name) return null;
  return {
    trackName: data.item.name,
    artistName: artistsOf(data.item),
    albumImage: data.item.album?.images?.[0]?.url ?? null,
    url: data.item.external_urls?.spotify ?? null,
  };
}
