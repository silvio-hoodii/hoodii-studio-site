/* The Spotify fetcher. Both the public API route (src/app/api/spotify/route.ts) and the RSC root
 * page call it: same code path, same response shape, so the server-rendered snapshot hands off
 * cleanly to the client-side polling.
 *
 * THE PSN HALF IS GONE, 2026-09-04, E5 and section F of that day's audit. `PSN_NPSSO` had been
 * expired for months, /api/psn and /api/psn-image had zero callers, nothing on the site rendered a
 * game, and the expired token logged a caught error on every build. The routes, this fetcher and
 * the `psn-api` dependency went together: keeping the client for a feature with no surface is how
 * a repo accumulates things a reader has to work out are dead.
 */

export type SpotifyPayload = {
  isPlaying: boolean
  title?: string
  artist?: string
  url?: string
  /* When the track finished, ISO, and ONLY set on the recently-played branch. A "last played" with
   * no age is the same defect the hub's body weight had before 2026-08-14: a true fact presented
   * with no way to tell whether it is hours or a fortnight old. Absent while isPlaying is true,
   * because "now" is the answer. */
  playedAt?: string
}

const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'
const SPOTIFY_NOW_PLAYING = 'https://api.spotify.com/v1/me/player/currently-playing'
const SPOTIFY_RECENTLY_PLAYED = 'https://api.spotify.com/v1/me/player/recently-played?limit=1'

async function getSpotifyAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data: { access_token?: string } = await res.json()
  return data.access_token ?? null
}

export async function fetchSpotify(): Promise<SpotifyPayload> {
  try {
    const accessToken = await getSpotifyAccessToken()
    if (!accessToken) return { isPlaying: false }

    const headers = { Authorization: `Bearer ${accessToken}` }

    const nowRes = await fetch(SPOTIFY_NOW_PLAYING, { headers, cache: 'no-store' })
    if (nowRes.status === 200) {
      const data = await nowRes.json()
      if (data.is_playing && data.item) {
        return {
          isPlaying: true,
          title: data.item.name,
          artist: data.item.artists.map((a: { name: string }) => a.name).join(', '),
          url: data.item.external_urls.spotify,
        }
      }
    }

    const recentRes = await fetch(SPOTIFY_RECENTLY_PLAYED, { headers, cache: 'no-store' })
    if (recentRes.status === 200) {
      const data = await recentRes.json()
      const item = data.items?.[0]
      const track = item?.track
      if (track) {
        return {
          isPlaying: false,
          title: track.name,
          artist: track.artists.map((a: { name: string }) => a.name).join(', '),
          url: track.external_urls.spotify,
          playedAt: item.played_at,
        }
      }
    }

    return { isPlaying: false }
  } catch {
    return { isPlaying: false }
  }
}
