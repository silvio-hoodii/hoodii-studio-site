import { NextResponse } from 'next/server';
import { addShopExtra, removeShopExtra, tickShop, untickShop } from '@/lib/kitchen/cookbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The taps on the one shopping list: tick a row off, put it back, add something no recipe knows
 * about, drop one he typed by mistake.
 *
 * Gated by `src/proxy.ts` along with every other write under /kitchen/api, so it needs no auth of
 * its own, and the inline `Unlock` on the page turns the 401 into a password field where the button
 * was. Nothing here writes to `dish`: the classification of an item is a session's decision, not a
 * tap's, and a phone that could flip an item to "owned" would be the fridge model coming back one
 * checkbox at a time. */
const MAX_TEXT = 200;

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { op?: unknown; key?: unknown; label?: unknown; text?: unknown; id?: unknown };
    const op = String(b?.op ?? '');

    if (op === 'tick' || op === 'untick') {
      const key = String(b?.key ?? '').trim();
      if (!key) return NextResponse.json({ ok: false, error: 'key required' }, { status: 400 });
      if (op === 'tick') await tickShop(key, String(b?.label ?? '').trim() || key);
      else await untickShop(key);
      return NextResponse.json({ ok: true });
    }

    if (op === 'add') {
      const text = String(b?.text ?? '').trim();
      if (!text) return NextResponse.json({ ok: false, error: 'text required' }, { status: 400 });
      if (text.length > MAX_TEXT) {
        return NextResponse.json({ ok: false, error: `over ${MAX_TEXT} characters` }, { status: 400 });
      }
      await addShopExtra(text);
      return NextResponse.json({ ok: true });
    }

    if (op === 'remove') {
      /* Numeric, because it is a bigserial and the delete casts it. A non-numeric id here would
       * otherwise reach Postgres as NaN and delete nothing while reporting success. */
      const id = String(b?.id ?? '').trim();
      if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      await removeShopExtra(id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'op must be tick, untick, add or remove' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
