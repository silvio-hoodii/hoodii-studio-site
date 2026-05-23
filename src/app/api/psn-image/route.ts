import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// PSN image CDN does not send Access-Control-Allow-Origin, so a browser
// TextureLoader can't read pixels cross-origin. This route proxies the
// requested PSN image server-side and re-serves it with same-origin
// headers + a 1-hour cache.
//
// Host allowlist prevents the proxy from being abused as a generic
// outbound fetch endpoint. PSN's image CDN is the only legitimate
// upstream for v1.
const ALLOWED_HOSTS = new Set(['image.api.playstation.com'])

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return new NextResponse('missing url', { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new NextResponse('invalid url', { status: 400 })
  }

  if (!ALLOWED_HOSTS.has(parsed.host)) {
    return new NextResponse('disallowed host', { status: 403 })
  }

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return new NextResponse('upstream error', { status: 502 })
    }
    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('proxy failed', { status: 502 })
  }
}
