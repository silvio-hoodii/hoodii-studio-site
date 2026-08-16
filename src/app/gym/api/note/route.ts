import { NextResponse } from 'next/server';
import { addNote } from '@/lib/gym/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A note from the gym floor. Gated by src/proxy.ts along with every other POST under /gym/api.
 *
 *  There is no structure imposed on the body and nothing to categorise. He dictates these with the
 *  phone keyboard's microphone, so what arrives is spoken sentences, not form fields, and the moment
 *  it asks him to pick a type it stops being the thing he asked for. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const body = String(b?.body ?? '').trim();
    if (!b?.date || !body) {
      return NextResponse.json({ ok: false, error: 'date and body required' }, { status: 400 });
    }
    if (body.length > 5000) {
      return NextResponse.json({ ok: false, error: 'note too long' }, { status: 400 });
    }
    await addNote({ date: String(b.date), day: b.day ?? null, dayTitle: b.dayTitle ?? null, body });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
