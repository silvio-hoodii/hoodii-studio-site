import { NextResponse } from 'next/server';
import { logVeto } from '@/lib/kitchen/veto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hide a dish from the lists, or bring it back.
 *
 * Gated by `src/proxy.ts` like every other write under /kitchen/api, so this needs no auth of its own.
 * `probe-kitchen.mjs` must never call it: there is no development database and a probe writing into
 * his real logs is worse than no probe. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const ev = String(b?.ev ?? '');
    const dish = String(b?.dish ?? '').trim();
    if (!['hide', 'show'].includes(ev)) {
      return NextResponse.json({ ok: false, error: 'ev must be hide or show' }, { status: 400 });
    }
    /* The namespace is required rather than defaulted. A bare id would be accepted by a permissive
     * route and then never match anything on the read side, which fails as "the button does nothing"
     * rather than as an error. */
    if (!/^(card|meal):.+/.test(dish)) {
      return NextResponse.json({ ok: false, error: 'dish must be card:<id> or meal:<id>' }, { status: 400 });
    }
    await logVeto(ev as 'hide' | 'show', dish, b?.name ? String(b.name) : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
