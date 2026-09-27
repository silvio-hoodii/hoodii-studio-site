import { NextResponse } from 'next/server';
import { isApp, recordOpen } from '@/lib/usage/opens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* One page view by HIM. src/proxy.ts refuses this route without the cookie, so a stranger's visit
 * never reaches the database: it gets a 401 at the edge and costs nothing. */
export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as { app?: unknown };
    if (!isApp(b.app)) return NextResponse.json({ ok: false, error: 'unknown app' }, { status: 400 });
    await recordOpen(b.app);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
