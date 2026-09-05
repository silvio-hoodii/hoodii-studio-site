import { NextResponse } from 'next/server';
import { logCook } from '@/lib/kitchen/cookbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* How a cook went. Gated by src/proxy.ts (every /kitchen/api route except unlock). A rating alone
 * or a note alone is enough; an empty row is refused because it would read as a cook that happened. */
const MAX_NOTE = 5000;
const RATINGS = new Set(['nailed', 'fine', 'wrong', '']);

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { dish?: unknown; rating?: unknown; note?: unknown };
    const dish = String(b?.dish ?? '').trim();
    const rating = String(b?.rating ?? '');
    const note = String(b?.note ?? '').trim();
    if (!dish) return NextResponse.json({ ok: false, error: 'dish required' }, { status: 400 });
    if (!RATINGS.has(rating)) return NextResponse.json({ ok: false, error: 'bad rating' }, { status: 400 });
    if (!rating && !note) return NextResponse.json({ ok: false, error: 'say something' }, { status: 400 });
    if (note.length > MAX_NOTE) {
      return NextResponse.json({ ok: false, error: `note over ${MAX_NOTE} characters` }, { status: 400 });
    }
    await logCook({ dish, rating, note });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
