import 'server-only';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveStock } from './stock';
import { scoreRecipe, extractRecipe, type Score } from '../../../content/kitchen/match.mjs';
import type { CorpusMeal } from './corpus';

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

  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
  const rows: { m: CorpusMeal; provider: string }[] = [];
  for (const f of files) {
    const raw = JSON.parse(await readFile(join(DIR, f), 'utf8'));
    for (const m of (raw.meals ?? []) as CorpusMeal[]) {
      if (m.sourceOk === true) rows.push({ m, provider: raw.provider ?? f });
    }
  }

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

/** Fetch and score ONE page he pointed at. Works for any site publishing recipe markup. */
export async function wantByUrl(url: string): Promise<{ hit: WantHit | null; error: string | null; stock: Awaited<ReturnType<typeof deriveStock>> }> {
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
