'use server';

import { wantByPaste, nameOfItem } from '@/lib/kitchen/want';

/* The server action behind the paste box.
 *
 * A POST rather than a GET because a pasted ingredient list does not fit in a query string, and a
 * truncated one would score as "you have everything" while quietly dropping the last four lines. That
 * is a false "you have it", which law 5 in `.agents/ENGINEERING.md` names as the worse direction.
 *
 * `src/proxy.ts` gates POSTs under `/kitchen/api` only, so this passes without the cookie. Correct:
 * the rule there is that reads are open and writes need the cookie, and this reads.
 *
 * Everything crossing back to the client is a plain string. Item ids are for code, and "via your
 * stockcube" is not a sentence he should ever see. */

export interface PasteResult {
  ok: boolean;
  error?: string;
  name?: string;
  missing?: { what: string; line: string; reason?: string }[];
  via?: { what: string; via: string }[];
  have?: string[];
  unknown?: string[];
  lines?: string[];
  /** Echoed back so the textarea can be refilled. Losing a long paste on submit means retyping
   *  it to change one line, and the whole point of this box is that he already did the copying. */
  text?: string;
}

export async function checkPaste(_prev: PasteResult | null, form: FormData): Promise<PasteResult> {
  const text = String(form.get('text') ?? '');
  if (!text.trim()) return { ok: false, error: 'Nothing pasted yet.' };

  const { hit, error, stock } = await wantByPaste(text);
  if (error || !hit) return { ok: false, error: error ?? 'Could not read that.', text };

  const label = (id: string) => nameOfItem(stock, id);
  const s = hit.score;
  return {
    ok: true,
    text,
    name: hit.name,
    missing: s.missing.map((m) => ({
      what: m.item ? label(m.item) : m.shown,
      line: m.line.trim(),
      reason: m.reason,
    })),
    via: s.haveVia.map((v) => ({ what: v.item ? label(v.item) : v.shown, via: String(v.via ?? '') })),
    have: s.have.map((h) => (h.item ? label(h.item) : h.shown)),
    unknown: s.unknown.map((u) => u.shown || u.line.trim()),
    lines: hit.ingredients,
  };
}
