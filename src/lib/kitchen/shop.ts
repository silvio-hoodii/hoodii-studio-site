import 'server-only';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveStock } from './stock';
import { scoreRecipe } from '../../../content/kitchen/match.mjs';
import type { CorpusMeal } from './corpus';

const ALIASES = JSON.parse(
  await readFile(join(process.cwd(), 'content', 'kitchen', 'stock', 'aliases.json'), 'utf8'),
) as { map: Record<string, string[]>; staples: string[] };

/* Staples resolve to __STAPLE__ rather than to their own id, so they can never be "used" and would sit
 * in a neglect list forever. The first version of this page told him salt, flour, oil, sugar and yeast
 * were going to waste. Non-food is the same problem: nobody is neglecting the mason jars. */
const NOT_FOOD = new Set(['jars']);
const STAPLE_IDS = new Set(
  Object.keys({
    salt: 1, flour: 1, oil: 1, sugar: 1, yeast: 1, honey: 1, cocoa: 1, vinegar: 1,
    seasoning: 1, cumin: 1, smokedpaprika: 1, peppercornblend: 1, stockcube: 1, cornstarch: 1,
  }),
);

/* A shopping list built from what it would UNLOCK, plus what is already here going nowhere.
 *
 * His ask, 2026-08-13: "maybe we build a shopping list to sort of add. For example you mentioned no
 * potatoes. That will open up a bunch of recipes so I will be open to buying potatoes but I also have
 * sweet potatoes that have been sitting there for a while now."
 *
 * Both halves of that sentence matter and they pull against each other. One is "what should I buy",
 * the other is "stop telling me to buy things while food I own rots". So this returns both, and the
 * second list is deliberately first on the page.
 *
 * NAMING. Gaps are grouped in aliases.json so a dish is not reported as missing two things that are
 * really one hole ("no thyme, sage, rosemary or oregano" is one shopping decision). That grouping is
 * right for scoring and wrong for a shopping list, where "green vegetables" is not a thing you can put
 * in a basket. So every unlock carries the actual ingredient lines the recipes asked for, counted, and
 * the group name is only the heading.
 *
 * NO PRICES ARE GUESSED. Anything without a real observed price says so. Guessed pasta prices produced
 * a confidently wrong buy recommendation on 2026-08-02 and the standing rule since is that a price
 * comes from a receipt or a live lookup or it does not appear.
 */

const DIR = join(process.cwd(), 'content', 'kitchen', 'corpus');

export interface Unlock {
  item: string;
  count: number;
  reason?: string;
  /** The ingredient lines the recipes actually asked for, most requested first. */
  asks: { name: string; n: number }[];
  examples: { name: string; source: string | null }[];
}

export interface Idle {
  id: string;
  name: string;
  ageDays: number | null;
  daysLeft: number | null;
  where: string;
}

export async function shoppingView() {
  const stock = await deriveStock();
  const available = new Set<string>();
  for (const it of Object.values(stock.items)) {
    if (it.level === 'have' || it.level === 'low') available.add(it.id);
  }

  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
  const meals: CorpusMeal[] = [];
  for (const f of files) {
    const raw = JSON.parse(await readFile(join(DIR, f), 'utf8'));
    for (const m of (raw.meals ?? []) as CorpusMeal[]) if (m.sourceOk === true) meals.push(m);
  }

  const scored = meals.map((m) => ({
    m,
    s: scoreRecipe(m.ingredients.map((i) => `${i.measure} ${i.name}`), available),
  }));

  /* ONE purchase, and it has to mean one. Counted only over dishes missing nothing else, because
   * "would help with" is not "would unlock" and he has been told inflated numbers before. */
  const byItem = new Map<string, { reason?: string; asks: Map<string, number>; ex: { name: string; source: string | null }[] }>();
  for (const x of scored) {
    if (x.s.missing.length !== 1) continue;
    const m = x.s.missing[0]!;
    const key = m.item ?? m.shown;
    const row = byItem.get(key) ?? {
      reason: m.reason,
      asks: new Map<string, number>(),
      ex: [] as { name: string; source: string | null }[],
    };
    // The literal thing the recipe asked for, cleaned of amounts, so the group name is not the answer.
    const ask = m.shown.trim();
    if (ask) row.asks.set(ask, (row.asks.get(ask) ?? 0) + 1);
    if (row.ex.length < 4) row.ex.push({ name: String(x.m.name), source: x.m.source });
    byItem.set(key, row);
  }

  const unlocks: Unlock[] = [...byItem.entries()]
    .map(([item, v]) => ({
      item,
      count: [...v.asks.values()].reduce((a, b) => a + b, 0),
      reason: v.reason,
      asks: [...v.asks.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 6),
      examples: v.ex,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 14);

  /* ALREADY HERE AND GOING NOWHERE. Every stock id that no nearly-cookable dish touches. This is the
   * half of his sentence that a shopping list normally ignores, and it is the half he raised first. */
  const touched = new Set<string>();
  for (const x of scored) {
    if (x.s.missing.length > 1) continue;
    for (const h of [...x.s.have, ...x.s.haveVia]) if (h.item) touched.add(h.item);
  }

  /* An item can only be "used" if some alias points at it. Staples resolve to __STAPLE__ rather than to
   * their id, and non-food like mason jars has no alias at all, so both would sit in an idle list
   * forever: the first version of this page listed salt, flour, oil, sugar and yeast as neglected food.
   * Items with NO alias are a different problem and get their own list, because no recipe can ever
   * reach them however long they sit there. That is a hole in the kitchen's vocabulary, not waste. */
  const aliasedIds = new Set(Object.keys(ALIASES.map));

  const unreachable: Idle[] = [...available]
    .filter((id) => !aliasedIds.has(id) && !STAPLE_IDS.has(id) && !NOT_FOOD.has(id))
    .map((id) => {
      const it = stock.items[id];
      return {
        id,
        name: (it?.n ?? id).replace(/\s*\([^)]*\)/g, '').trim(),
        ageDays: it?.ageDays ?? null,
        daysLeft: it?.daysLeft ?? null,
        where: it?.where ?? 'pantry',
      };
    })
    .filter((i) => i.daysLeft !== null || (i.ageDays ?? 0) > 0)
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

  const idle: Idle[] = [...available]
    .filter((id) => aliasedIds.has(id) && !touched.has(id))
    .map((id) => {
      const it = stock.items[id];
      return {
        id,
        name: (it?.n ?? id).replace(/\s*\([^)]*\)/g, '').trim(),
        ageDays: it?.ageDays ?? null,
        daysLeft: it?.daysLeft ?? null,
        where: it?.where ?? 'pantry',
      };
    })
    /* Sorted by urgency, then by how long it has sat. A thing with a clock beats a thing without one,
     * because the pantry can wait and the fridge cannot. */
    .sort((a, b) => {
      const ad = a.daysLeft ?? 999;
      const bd = b.daysLeft ?? 999;
      if (ad !== bd) return ad - bd;
      return (b.ageDays ?? 0) - (a.ageDays ?? 0);
    });

  return { unlocks, idle, unreachable, cookableNow: scored.filter((x) => x.s.missing.length === 0).length, total: meals.length };
}
