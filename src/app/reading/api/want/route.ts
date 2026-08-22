import { NextResponse } from 'next/server';
import { addWant, removeWant } from '@/lib/reading/want-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The want list. Cookie-gated by src/proxy.ts, which is the only reason this may exist on a site
 * whose reading pages are otherwise read-only mirrors.
 *
 * A want is NOT a queue entry, and conflating them would break the thing Silvio was most annoyed
 * about. The queue is ten books he is reading next, and adding to it pushes something out. A want
 * is "remember this for the next shop trip", costs nothing, and must never evict anything. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.key || !b?.title || !b?.author) {
      return NextResponse.json({ ok: false, error: 'key, title and author are required' }, { status: 400 });
    }
    if (b.remove) {
      await removeWant(String(b.key));
      return NextResponse.json({ ok: true, wanted: false });
    }
    await addWant({ key: String(b.key), title: String(b.title), author: String(b.author), note: b.note ? String(b.note) : null });
    return NextResponse.json({ ok: true, wanted: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
