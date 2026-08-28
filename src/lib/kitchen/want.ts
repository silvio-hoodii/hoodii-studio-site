import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveStock } from './stock';
import { isAuthed } from '../auth-server';
import { scoreRecipe, extractRecipe, splitPaste, type Score } from '../../../content/kitchen/match.mjs';
import { loadCorpus, type CorpusMeal } from './corpus';

/* "I want a stroganoff. What do I need?"
 *
 * His words, 2026-08-12: "I want a stroganoff beef. I know I don't have beef... I want this. What do I
 * need to make it? There are some things here that I don't see and I don't know why."
 *
 * That is a different question from "what can I cook", and the find page could not answer it: it only
 * ranked what the fridge already supported, so anything needing a shop was buried a thousand rows
 * down or absent. This module answers the question he actually asks.
 *
 * It also closes the biggest hole a UX review found in /kitchen/find: every row on that page linked
 * OFF the site and nothing on it constituted picking a dish, so the intended flow was "memorise a
 * name, leave, open a chat, ask an agent". Now a row leads here.
 *
 * TWO SOURCES OF TRUTH, deliberately:
 *   - by name, searched across the local corpus, which is instant and needs no network
 *   - by URL, fetched live, which works for ANY recipe page including ones the corpus will never hold
 *
 * The URL path is what makes NYT Cooking and Maangchi usable. Both ask AI crawlers not to harvest
 * them, and we do not. Fetching one page HE hands us, to answer a question he asked about a dish he
 * intends to cook, is him using an agent as a browser. That distinction is the whole reason this
 * accepts a URL instead of quietly ingesting those sites.
 */

const DIR = join(process.cwd(), 'content', 'kitchen', 'corpus');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export interface WantHit {
  name: string;
  source: string | null;
  image: string | null;
  area: string | null;
  category: string | null;
  provider: string;
  ingredients: string[];
  score: Score;
}

async function usableStock() {
  const stock = await deriveStock();
  const ids = new Set<string>();
  for (const it of Object.values(stock.items)) {
    if (it.level === 'have' || it.level === 'low') ids.add(it.id);
  }
  return { stock, ids };
}

export function nameOfItem(stock: Awaited<ReturnType<typeof deriveStock>>, id: string) {
  return (stock.items[id]?.n ?? id).replace(/\s*\([^)]*\)/g, '').trim();
}

/** Search the local corpus by name, best first. */
export async function wantByName(q: string, limit = 12) {
  const query = q.trim().toLowerCase();
  if (!query) return { hits: [] as WantHit[], stock: (await usableStock()).stock };
  const { stock, ids } = await usableStock();

  /* The one shared loader, so this page cannot disagree with find or shop about what the corpus is.
   * It was the third independent reimplementation of it, and the only one of the three that deduped was
   * the find page's. */
  const { meals: corpusMeals } = await loadCorpus();
  const rows = corpusMeals.map((m) => ({ m, provider: m.provider ?? 'corpus' }));

  /* Rank by WHERE the query lands, not just whether it does. An exact title beats a title that starts
   * with it, which beats a mention anywhere, which beats a hit buried in the ingredient list. Without
   * this, searching "stroganoff" returns whatever happens to be alphabetically first. */
  const scored = rows
    .map(({ m, provider }) => {
      const name = String(m.name).toLowerCase();
      let rank = 99;
      if (name === query) rank = 0;
      else if (name.startsWith(query)) rank = 1;
      else if (name.includes(query)) rank = 2;
      else if ((m.keywords ?? []).some((k) => k.toLowerCase().includes(query))) rank = 3;
      else if (m.ingredients.some((i) => i.name.toLowerCase().includes(query))) rank = 4;
      return { m, provider, rank };
    })
    .filter((x) => x.rank < 99)
    .sort((a, b) => a.rank - b.rank || String(a.m.name).length - String(b.m.name).length);

  const resolve = (sc: Score) => {
    // Item ids are for code. "via your stockcube" is not a sentence.
    for (const v of sc.haveVia) if (v.via) v.via = nameOfItem(stock, v.via);
    return sc;
  };

  const hits: WantHit[] = scored.slice(0, limit).map(({ m, provider }) => ({
    name: String(m.name),
    source: m.source,
    image: m.image,
    area: m.area,
    category: m.category,
    provider,
    ingredients: m.ingredients.map((i) => `${i.measure} ${i.name}`.trim()),
    score: resolve(scoreRecipe(m.ingredients.map((i) => `${i.measure} ${i.name}`), ids)),
  }));

  return { hits, stock };
}

/** Score a recipe he PASTED, when no fetch can reach it.
 *
 * Added 2026-08-17, and it keeps a promise the app had been making for days without a way to honour
 * it: `wantByUrl` answers a 403 or 404 with "copy the ingredient list here instead and I will read
 * it", and there was no box to copy it into. The Kitchn answers 403 to anything that is not a
 * browser. Budget Bytes 404s some of its own recipe URLs. Every good site that blocks `ClaudeBot` by
 * name blocks it here too, and that is theirs to decide.
 *
 * He named this himself: "if it's the source then I'll personally go and open a website and copy
 * paste all the information. I don't care." Text he has already read, handed over deliberately, is
 * not a crawl of anybody's site.
 *
 * DELIBERATELY MORE LENIENT THAN `import.mjs`. That one refuses to guess which lines are method,
 * because a dropped step is a defect at the stove. Here there is no method at all: this answers "what
 * would this need", every line is a candidate ingredient, and the worst case is a stray line reading
 * as an unknown ingredient, which the page already renders honestly as "not sure about". Building a
 * cook card from pasted text stays a job for the CLI, where the refusal lives.
 */
export async function wantByPaste(text: string): Promise<{ hit: WantHit | null; error: string | null; stock: Awaited<ReturnType<typeof deriveStock>> }> {
  const { stock, ids } = await usableStock();
  const raw = String(text ?? '').trim();
  if (!raw) return { hit: null, error: null, stock };

  /* ONE parser, shared with `content/kitchen/import.mjs` via `match.mjs`. These were written as two
   * near-identical functions and merged within the hour: this repo has already paid for a duplicated
   * parser, when the corpus loader existed in three versions and only one of them deduped, so
   * /kitchen/find and /kitchen/shop disagreed about how many dishes exist.
   *
   * The strictness difference is a DECISION here, not a second implementation. The importer refuses a
   * paste with no method heading, because a capture missing a step becomes a cook card missing a step.
   * This path never renders a method, so a missing heading only means every line is a candidate
   * ingredient, and the worst case is a stray line appearing under "our list does not recognise
   * these", which the page already reports honestly. */
  const parsed = splitPaste(raw);
  const ingredients = parsed.ingredients.slice(0, 60);

  if (!ingredients.length) {
    return { hit: null, stock, error: 'Nothing in that looked like an ingredient list.' };
  }

  const name = parsed.name ?? 'Pasted recipe';
  const sc = scoreRecipe(ingredients, ids);
  for (const v of sc.haveVia) if (v.via) v.via = nameOfItem(stock, v.via);

  return {
    stock,
    error: null,
    hit: { name, source: null, image: null, area: null, category: null, provider: 'pasted by you', ingredients, score: sc },
  };
}

/** Fetch and score ONE page he pointed at. Works for any site publishing recipe markup.
 *
 * REQUIRES THE UNLOCK COOKIE, since 2026-08-28. The feature is not the problem and it stays: it is
 * how NYT Cooking and Maangchi become usable, which is the whole reason this file accepts a URL. Who
 * may drive it was the problem.
 *
 * WHAT IT WAS. The 2026-08-26 audit's theme T1, the one finding that is security and cost at once,
 * found from two directions (02-kitchen P1-1, 07-vercel P1-1) and verified by reading these lines:
 * a public `force-dynamic` page took an anonymous visitor's `?url=` and fetched it server-side over
 * http or https, with a spoofed Chrome user agent, a 20-second timeout, no host allowlist and no
 * private-address block, from Vercel's network. `/kitchen` and `/kitchen/find` link to it with
 * crawlable `?q=` and `?url=` hrefs, so it is a combinatorial URL space with a fetch behind every
 * point in it. It took 15,367 invocations during the meta-externalagent scrape and sits outside
 * firewall rule 3.
 *
 * WHY THE CHECK IS HERE AND NOT IN THE PAGE. Law 1: eliminate the class. A check in
 * `src/app/kitchen/want/page.tsx` protects one call site and leaves the next one to remember. There
 * is no code path to an anonymous server-side fetch if the function itself will not perform one.
 *
 * The `?q=` corpus search stays public. It is local, it costs nothing off-site, and it is the half
 * of the page anybody could reasonably want to look at.
 */
export async function wantByUrl(url: string): Promise<{ hit: WantHit | null; error: string | null; stock: Awaited<ReturnType<typeof deriveStock>> | null; locked?: true }> {
  /* The cookie is checked BEFORE the stock derivation, so a crawler walking the `?url=` hrefs off
   * /kitchen and /kitchen/find costs one 200 with no off-site fetch AND no Neon round trip. Neon is
   * the entire External API Requests bill on this site. */
  if (!(await isAuthed())) {
    return {
      hit: null,
      stock: null,
      locked: true,
      error: 'Reading a page you point at needs this device unlocked. Search by name instead, which is open to anyone.',
    };
  }

  const { stock, ids } = await usableStock();
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('bad protocol');
  } catch {
    return { hit: null, error: 'That does not look like a web address.', stock };
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return {
        hit: null,
        stock,
        error: `That page answered ${res.status}. Some sites refuse anything that is not a person in a browser; if it opens fine for you, copy the ingredient list here instead and I will read it.`,
      };
    }
    const r = extractRecipe(await res.text());
    if (!r?.ingredients?.length) {
      return {
        hit: null,
        stock,
        error: 'That page loaded but carries no machine-readable recipe, so its ingredients cannot be read. Most recipe sites publish one; index pages and paywalled pages do not.',
      };
    }
    return {
      stock,
      error: null,
      hit: {
        name: r.name ?? parsed.hostname,
        source: parsed.toString(),
        image: r.image ?? null,
        area: r.cuisine ?? null,
        category: r.category ?? null,
        provider: parsed.hostname.replace(/^www\./, ''),
        ingredients: r.ingredients,
        score: (() => {
          const sc = scoreRecipe(r.ingredients, ids);
          for (const v of sc.haveVia) if (v.via) v.via = nameOfItem(stock, v.via);
          return sc;
        })(),
      },
    };
  } catch (e) {
    return {
      hit: null,
      stock,
      error: e instanceof Error && e.name === 'TimeoutError'
        ? 'That page took too long to answer.'
        : 'Could not reach that page.',
    };
  }
}
