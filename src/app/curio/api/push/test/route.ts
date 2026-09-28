import { NextResponse } from 'next/server';
import { sendToAll } from '@/lib/curio/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* One notification now, to every subscribed device. The button beside the reminder switch calls
 * it, so the first proof that reminders work is one he sees on his own phone, not a log line.
 *
 * The text promises nothing. It said "The first question arrives tomorrow morning", which is false
 * before the 15:00 UTC run and on any day with nothing due.
 *
 * The page sends its own endpoint, so the answer can say what happened on THIS device (`thisDevice`)
 * beside the counts for all of them. Endpoints are never returned. */
export async function POST(req: Request) {
  let endpoint: string | null = null;
  try {
    const b = (await req.json()) as { endpoint?: unknown };
    if (typeof b?.endpoint === 'string') endpoint = b.endpoint;
  } catch {
    /* No body: the counts still answer. */
  }
  try {
    const { outcomes, ...r } = await sendToAll('Curio', 'Test sent.', '/curio');
    const thisDevice = endpoint ? (outcomes.get(endpoint) ?? 'unknown') : 'unknown';
    return NextResponse.json({ ok: r.sent > 0, thisDevice, ...r }, { status: r.sent > 0 ? 200 : 502 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
