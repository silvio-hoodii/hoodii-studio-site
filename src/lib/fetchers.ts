// Shared Spotify + PSN fetchers. Both the public API routes
// (src/app/api/{spotify,psn}/route.ts) AND the RSC root page
// (src/app/page.tsx) call these: same code path, same response shape,
// so the initial server-rendered snapshot can hand off cleanly to the
// 60s client-side polling in useDataSources.

import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getRecentlyPlayedGames,
} from 'psn-api'

export type SpotifyPayload = {
  isPlaying: boolean
  title?: string
  artist?: string
  url?: string
}

export type PsnGame = {
  name: string
  platform: string
  imageUrl: string | null
  lastPlayedAt: string | null
}

export type PsnPayload = {
  games: PsnGame[]
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
      const track = data.items?.[0]?.track
      if (track) {
        return {
          isPlaying: false,
          title: track.name,
          artist: track.artists.map((a: { name: string }) => a.name).join(', '),
          url: track.external_urls.spotify,
        }
      }
    }

    return { isPlaying: false }
  } catch {
    return { isPlaying: false }
  }
}

export async function fetchPsn(): Promise<PsnPayload> {
  const npsso = process.env.PSN_NPSSO ?? process.env.SN_NPSSO
  if (!npsso) return { games: [] }

  try {
    const accessCode = await exchangeNpssoForAccessCode(npsso)
    const auth = await exchangeAccessCodeForAuthTokens(accessCode)
    const { data } = await getRecentlyPlayedGames(auth, {
      limit: 5,
      categories: ['ps5_native_game', 'ps4_game'],
    })
    const games = data.gameLibraryTitlesRetrieve?.games ?? []

    return {
      games: games.map((game) => ({
        name: game.name,
        platform: game.platform,
        imageUrl: game.image?.url ?? null,
        lastPlayedAt: game.lastPlayedDateTime ?? null,
      })),
    }
  } catch (error) {
    console.error('PSN fetch failed', error)
    return { games: [] }
  }
}
