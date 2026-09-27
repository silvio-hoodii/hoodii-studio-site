import { NextResponse } from 'next/server';
import { sendToAll } from '@/lib/curio/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* One notification now, to every subscribed device. The button beside the reminder switch calls
 * it, so the first proof that reminders work is one he sees on his own phone, not a log line. */
export async function POST() {
  try {
    const r = await sendToAll('Curio', 'Reminders work. The first question arrives tomorrow morning.', '/curio');
    return NextResponse.json({ ok: r.sent > 0, ...r }, { status: r.sent > 0 ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
