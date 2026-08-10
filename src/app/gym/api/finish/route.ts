import { NextResponse } from 'next/server';
import { finishSession } from '@/lib/gym/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Marks a session finished. HealthOS's version also triggered a Notion mirror; Notion mirroring was
 *  retired 2026-07-14 (NOTION_ENABLED=false in server.mjs) so that half is not ported — this route is
 *  just the state transition. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.date) return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 });
    await finishSession({ date: String(b.date), day: b.day ?? null });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
