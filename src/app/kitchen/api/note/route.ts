import { NextResponse } from 'next/server';
import { logStepNote } from '@/lib/kitchen/cook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A note written at the stove, mid-step. Sent the moment it is written and carrying the step index
 *  and the step's own text, so the offending recipe line can be found without guessing.
 *
 *  A captured question nobody answers is worse than no capture, because it teaches him the control
 *  does nothing. The 2026-08-02 parchment question sat unanswered for a week. */
/* Caps, per 06-security P2-3. `/gym/api/note` has capped at 5000 since it shipped and this route,
 * which is the same thing for the kitchen, capped nothing. A note is typed with one thumb while
 * something is on the heat; 5000 characters is far past anything he would write and far short of
 * anything that would matter in the row every later render of the cook log reads. */
const MAX_NOTE = 5000;
const MAX_STEP_TEXT = 4000;

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.dish || !b?.note) {
      return NextResponse.json({ ok: false, error: 'dish and note required' }, { status: 400 });
    }
    if (String(b.note).length > MAX_NOTE) {
      return NextResponse.json({ ok: false, error: `note over ${MAX_NOTE} characters` }, { status: 400 });
    }
    await logStepNote({
      dish: String(b.dish),
      note: String(b.note),
      step: Number(b.step ?? 0),
      stepOf: Number(b.stepOf ?? 0),
      kind: String(b.kind ?? 'note'),
      /* Truncated rather than refused: `stepText` is the app's own recipe line, sent so the
       * offending step can be found without guessing. Losing the note because the app sent a long
       * step would be the app punishing him for its own data. */
      stepText: String(b.stepText ?? '').slice(0, MAX_STEP_TEXT),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
