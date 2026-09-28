import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { finishSession } from '@/lib/gym/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Marks a session finished. HealthOS's version also triggered a Notion mirror; Notion mirroring was
 *  retired 2026-07-14 (NOTION_ENABLED=false in server.mjs) so that half is not ported: this route is
 *  just the state transition. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.date) return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 });
    /* `status: 'cutshort'` is the "ran out of time" ending. Same route rather than a new one, so it
       needs no entry in probe-gym's WRITE_ROUTES and cannot be forgotten there. */
    const updated = await finishSession({
      date: String(b.date),
      day: b.day ?? null,
      status: b.status === 'cutshort' ? 'cutshort' : 'finished',
    });
    /* NOTHING TO FINISH IS NOT A SUCCESS, since 2026-09-27. The update touched no row when no session
       exists for that date and day (a session row is only created by a set with reps or a tick), and
       this still answered ok, so the page printed "Session saved." over nothing. 409 is the client's
       signal to say so and not to retry. */
    if (updated === 0) {
      return NextResponse.json({ ok: false, error: 'no session logged for that date and day', updated }, { status: 409 });
    }
    revalidatePath('/');
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
