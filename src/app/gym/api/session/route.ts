import { NextResponse } from 'next/server';
import { getSessionDay, getSessionForHydrate } from '@/lib/gym/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A date's logged sets, for resuming an in-progress session on a different device or after a
 *  storage clear (localStorage stays canonical while offline, this just rehydrates it). */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.date) return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 });
    const date = String(b.date);
    const [day, sets] = await Promise.all([getSessionDay(date), getSessionForHydrate(date)]);
    return NextResponse.json({ ok: true, date, day, sets });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
