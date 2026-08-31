import { NextResponse } from 'next/server';
import { addNote } from '@/lib/gym/db';
import { asNoteKind } from '@/lib/gym/note-kinds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A note from the gym floor. Gated by src/proxy.ts along with every other POST under /gym/api.
 *
 *  There is no structure imposed on the body and nothing to categorise. He dictates these with the
 *  phone keyboard's microphone, so what arrives is spoken sentences, not form fields, and the moment
 *  it asks him to pick a type it stops being the thing he asked for.
 *
 *  THAT RULING STILL HOLDS FOR THE BOX AT THE END OF THE PAGE, and this route now also serves a
 *  second caller that is not that box. Added 2026-08-31 with gym_note.exercise_id and gym_note.kind.
 *
 *  `exerciseId` and `kind` are OPTIONAL and both default to null. The end-of-session box sends
 *  neither, so nothing about the thing he asked for changes: no picker, no required field, same
 *  placeholder. The per-exercise control on a card sends both, and the exercise costs no tap there
 *  because the card is the one that knows which exercise it is.
 *
 *  A BAD KIND WRITES NULL RATHER THAN REFUSING THE NOTE. `asNoteKind` narrows and returns null for
 *  anything it does not recognise, which is what a stale tab on an old build would send. The
 *  asymmetry: a note that arrives with no category is a note; a note refused with a 400 is gone from
 *  the world, and the client's own rule is that the text is only cleared once the write landed. The
 *  CHECK constraint in content/gym/schema.sql is the backstop for a writer that bypasses this route.
 *
 *  `exerciseId` IS NOT VALIDATED AGAINST THE CATALOGUE, on purpose. The one thing the whole feature
 *  is for is capturing work the programme does not describe, and validating the id against the
 *  programme would refuse exactly the substitutions that produced notes #16, #31 and #38. It is
 *  length-capped and stored as text; a name nothing resolves is still better than prose nobody
 *  can join. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const body = String(b?.body ?? '').trim();
    if (!b?.date || !body) {
      return NextResponse.json({ ok: false, error: 'date and body required' }, { status: 400 });
    }
    if (body.length > 5000) {
      return NextResponse.json({ ok: false, error: 'note too long' }, { status: 400 });
    }
    const exerciseId = b?.exerciseId == null ? null : String(b.exerciseId).trim().slice(0, 120) || null;
    await addNote({
      date: String(b.date),
      day: b.day ?? null,
      dayTitle: b.dayTitle ?? null,
      body,
      exerciseId,
      kind: asNoteKind(b?.kind),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
