import { NextResponse } from 'next/server';
import { logShop } from '@/lib/kitchen/list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Add something to the shopping list, or tick it off.
 *
 * Gated by `src/proxy.ts` like every other write under /kitchen/api, so this needs no auth of its own.
 * `probe-kitchen.mjs` must never call it: there is no development database and a probe writing into his
 * real list is worse than no probe. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const ev = String(b?.ev ?? '');
    const item = String(b?.item ?? '').trim();
    if (!['add', 'got', 'drop'].includes(ev)) {
      return NextResponse.json({ ok: false, error: 'ev must be add, got or drop' }, { status: 400 });
    }
    if (!item) return NextResponse.json({ ok: false, error: 'item required' }, { status: 400 });
    await logShop(ev as 'add' | 'got' | 'drop', item, b?.label ? String(b.label) : undefined, b?.note ? String(b.note) : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
