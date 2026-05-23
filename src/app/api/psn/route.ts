import { NextResponse } from 'next/server'
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getRecentlyPlayedGames,
} from 'psn-api'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

function noStoreJson(body: unknown) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}

export async function GET() {
  const npsso = process.env.PSN_NPSSO ?? process.env.SN_NPSSO

  if (!npsso) {
    return noStoreJson({ game: null })
  }

  try {
    const accessCode = await exchangeNpssoForAccessCode(npsso)
    const auth = await exchangeAccessCodeForAuthTokens(accessCode)

    const { data } = await getRecentlyPlayedGames(auth, {
      limit: 1,
      categories: ['ps5_native_game', 'ps4_game'],
    })

    const game = data.gameLibraryTitlesRetrieve?.games?.[0]

    if (!game) {
      return noStoreJson({ game: null })
    }

    return NextResponse.json(
      {
        game: {
          name: game.name,
          platform: game.platform,
          imageUrl: game.image?.url ?? null,
          lastPlayedAt: game.lastPlayedDateTime ?? null,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      },
    )
  } catch (error) {
    console.error('PSN route failed', error)
    return noStoreJson({ game: null })
  }
}
