import { NextResponse } from 'next/server'

const client_id = process.env.SPOTIFY_CLIENT_ID
const client_secret = process.env.SPOTIFY_CLIENT_SECRET
const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'
const NOW_PLAYING_ENDPOINT = 'https://api.spotify.com/v1/me/player/currently-playing'
const RECENTLY_PLAYED_ENDPOINT = 'https://api.spotify.com/v1/me/player/recently-played?limit=1'

async function getAccessToken() {
  const basic = Buffer.from(`${client_id}:${client_secret}`).toString('base64')
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh_token!,
    }),
  })
  return response.json()
}

export async function GET() {
  if (!client_id || !client_secret || !refresh_token) {
    return NextResponse.json({ isPlaying: false })
  }

  try {
    const { access_token } = await getAccessToken()

    // Try currently playing first
    const nowPlayingRes = await fetch(NOW_PLAYING_ENDPOINT, {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (nowPlayingRes.status === 200) {
      const data = await nowPlayingRes.json()
      if (data.is_playing && data.item) {
        return NextResponse.json(
          {
            isPlaying: true,
            title: data.item.name,
            artist: data.item.artists.map((a: { name: string }) => a.name).join(', '),
            url: data.item.external_urls.spotify,
          },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
            },
          },
        )
      }
    }

    // Fall back to recently played
    const recentRes = await fetch(RECENTLY_PLAYED_ENDPOINT, {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (recentRes.status === 200) {
      const data = await recentRes.json()
      const track = data.items?.[0]?.track
      if (track) {
        return NextResponse.json(
          {
            isPlaying: false,
            title: track.name,
            artist: track.artists.map((a: { name: string }) => a.name).join(', '),
            url: track.external_urls.spotify,
          },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
            },
          },
        )
      }
    }

    return NextResponse.json({ isPlaying: false })
  } catch {
    return NextResponse.json({ isPlaying: false })
  }
}
