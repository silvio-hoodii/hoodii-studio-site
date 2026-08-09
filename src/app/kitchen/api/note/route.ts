import { NextResponse } from 'next/server';
import { logStepNote } from '@/lib/kitchen/cook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A note written at the stove, mid-step. Sent the moment it is written and carrying the step index
 *  and the step's own text, so the offending recipe line can be found without guessing.
 *
 *  A captured question nobody answers is worse than no capture, because it teaches him the control
 *  does nothing. The 2026-08-02 parchment question sat unanswered for a week. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.dish || !b?.note) {
      return NextResponse.json({ ok: false, error: 'dish and note required' }, { status: 400 });
    }
    await logStepNote({
      dish: String(b.dish),
      note: String(b.note),
      step: Number(b.step ?? 0),
      stepOf: Number(b.stepOf ?? 0),
      kind: String(b.kind ?? 'note'),
      stepText: String(b.stepText ?? ''),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
