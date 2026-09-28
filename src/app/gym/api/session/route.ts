import { NextResponse } from 'next/server';
import { getSessionForHydrate } from '@/lib/gym/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A date's logged sets, for resuming an in-progress session on a different device or after a
 *  storage clear (localStorage stays canonical while offline, this just rehydrates it). */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.date) return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 });
    const date = String(b.date);
    /* No `day` in the answer since 2026-09-27: nothing on the page read it. */
    const sets = await getSessionForHydrate(date);
    return NextResponse.json({ ok: true, date, sets });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
