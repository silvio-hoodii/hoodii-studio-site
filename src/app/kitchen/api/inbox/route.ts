import { NextResponse } from 'next/server';
import { addInbox } from '@/lib/kitchen/cookbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* "I want to make X", from the phone. Gated by src/proxy.ts. One row; the session-start hook in
 * HOODII/.claude/hooks/kitchen-inbox.mjs is what reads it. */
const MAX_TEXT = 2000;

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { text?: unknown };
    const text = String(b?.text ?? '').trim();
    if (!text) return NextResponse.json({ ok: false, error: 'text required' }, { status: 400 });
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ ok: false, error: `over ${MAX_TEXT} characters` }, { status: 400 });
    }
    await addInbox(text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
