import { NextResponse } from 'next/server';
import { addCards } from '@/lib/french/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The ONLY card intake — see LanguageOS/DESIGN.md rule 1. This route does not and must not decide
// what counts as a legitimate card; that discipline lives in the caller (scripts/ingest-page.mjs's
// anti-fabrication prompt, or an agent reading a photographed page in-session). Never call this with
// a generated/seeded deck.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!Array.isArray(b?.cards) || !b.cards.length) {
      return NextResponse.json({ ok: false, error: 'cards[] required' }, { status: 400 });
    }
    const result = await addCards(b.cards, b.source ?? {});
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
