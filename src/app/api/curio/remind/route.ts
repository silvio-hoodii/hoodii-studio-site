import { NextResponse, type NextRequest } from 'next/server';
import { getToday } from '@/lib/curio/today';
import { sendToAll } from '@/lib/curio/push';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* The morning cron (vercel.json, 15:00 UTC: 9 am in Calgary in summer, 8 am in winter). Not under
 * src/proxy.ts, so it carries its own authorisation, the same way /api/music/sync does and for the
 * same reason: without CRON_SECRET this is a public URL that sends to his phone.
 *
 * The notification text is the first question itself. Nothing due and nothing to sort sends
 * nothing: a nudge with nothing behind it is how a notification gets ignored for good. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const t = await getToday();
    const first = t.quiz[0];
    if (!first && t.saves.length === 0) return NextResponse.json({ ok: true, skipped: 'nothing today' });
    const body = first ? first.question : 'One saved link to keep or drop.';
    const r = await sendToAll('Curio', body, '/curio');
    return NextResponse.json({ ok: r.failed.length === 0, ...r }, { status: r.failed.length ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
