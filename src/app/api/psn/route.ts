import { NextResponse } from 'next/server'
import { fetchPsn } from '@/lib/fetchers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

export async function GET() {
  const payload = await fetchPsn()
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': payload.game
        ? 'public, s-maxage=300, stale-while-revalidate=600'
        : 'no-store, max-age=0',
    },
  })
}
