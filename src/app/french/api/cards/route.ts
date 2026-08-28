import { NextResponse } from 'next/server';
import { addCards } from '@/lib/french/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The ONLY card intake: see LanguageOS/DESIGN.md rule 1. Never call this with a generated or seeded
 * deck.
 *
 * This comment used to read "this route does not and must not decide what counts as a legitimate
 * card; that discipline lives in the caller". The second half was true and was the problem: a
 * discipline living in the caller is a discipline nothing executes, and the cookie limits WHO posts,
 * not WHAT. `addCards` now REFUSES a card with no book or no page and names it in `rejected`, which
 * is the mechanism DESIGN.md rule 7 has wanted since it was written. The caller's judgement about
 * whether a card is worth making is still the caller's; whether it can be traced to a page is not a
 * judgement.
 *
 * The two caps below are 06-security P2-3: this was the one write route on the site accepting an
 * unbounded array of unbounded strings. `/gym/api/note` caps at 5000 chars and `/swim/api/baseline`
 * at 500; this accepted thousands of cards in one call, and every page that later renders them pays.
 */

/** One page of a book is tens of cards, never hundreds. A batch past this is a mistake or a script
 *  gone wrong, and either way the right answer is a 400 rather than a thousand rows. */
const MAX_CARDS_PER_BATCH = 200;
/** A card face is a word or a phrase off a printed page. 2000 leaves room for a long example
 *  sentence with its translation and is still four orders of magnitude under an accident. */
const MAX_FIELD_CHARS = 2000;

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!Array.isArray(b?.cards) || !b.cards.length) {
      return NextResponse.json({ ok: false, error: 'cards[] required' }, { status: 400 });
    }
    if (b.cards.length > MAX_CARDS_PER_BATCH) {
      return NextResponse.json(
        { ok: false, error: `${b.cards.length} cards in one call, cap is ${MAX_CARDS_PER_BATCH}. Split the batch.` },
        { status: 400 },
      );
    }
    const oversize = b.cards.findIndex((c: unknown) => {
      const card = c as Record<string, unknown>;
      return ['front', 'back', 'es_hint', 'note'].some(
        (k) => typeof card?.[k] === 'string' && (card[k] as string).length > MAX_FIELD_CHARS,
      );
    });
    if (oversize >= 0) {
      return NextResponse.json(
        { ok: false, error: `card ${oversize + 1} has a field over ${MAX_FIELD_CHARS} characters. A card face is a phrase, not a page.` },
        { status: 400 },
      );
    }

    const result = await addCards(b.cards, b.source ?? {});
    /* A partial batch reports OUTCOMES, not intent (law 3): what landed, what did not, and why for
     * each. `ok: true` with a silent `rejected` list would be the same shape as a sync that logs
     * success while writing half the rows. */
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
