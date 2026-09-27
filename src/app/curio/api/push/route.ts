import { NextResponse } from 'next/server';
import type { PushSubscription } from 'web-push';
import { removeSubscription, saveSubscription } from '@/lib/curio/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Subscribe (POST the browser's PushSubscription) or unsubscribe (DELETE with its endpoint).
 * Gated by src/proxy.ts, so a stranger cannot sign their own browser up for his questions. */
export async function POST(req: Request) {
  try {
    const sub = (await req.json()) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    if (typeof sub?.endpoint !== 'string' || !sub.endpoint.startsWith('https://')
        || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') {
      return NextResponse.json({ ok: false, error: 'not a push subscription' }, { status: 400 });
    }
    await saveSubscription(sub as PushSubscription);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const b = (await req.json()) as { endpoint?: unknown };
    if (typeof b?.endpoint !== 'string') {
      return NextResponse.json({ ok: false, error: 'endpoint required' }, { status: 400 });
    }
    await removeSubscription(b.endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
