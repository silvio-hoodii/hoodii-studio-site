import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveStock, expiringSoon } from './stock';
// One matcher implementation, in .mjs, so the CLI and the app can never disagree. See match-mjs.d.ts.
import { scoreRecipe, type Score } from '../../../content/kitchen/match.mjs';

export interface CorpusMeal {
  id: string;
  name: string;
  category: string;
  area: string | null;
  image: string | null;
  source: string | null;
  youtube: string | null;
  tags: string[];
  ingredients: { name: string; measure: string }[];
  /** Set by corpus-verify.mjs: does the source URL actually carry a JSON-LD recipe. */
  sourceOk?: boolean;
  sourceFail?: string;
}

export interface Candidate {
  meal: CorpusMeal;
  score: Score;
  /** Stock ids this dish would consume that are on a clock, soonest first. */
  usesExpiring: { id: string; name: string; daysLeft: number }[];
}

const DIR = join(process.cwd(), 'content', 'kitchen', 'corpus');

async function loadCorpus() {
  const raw = JSON.parse(await readFile(join(DIR, 'themealdb.json'), 'utf8'));
  const all = raw.meals as CorpusMeal[];
  /* Only dishes whose source URL was VERIFIED to carry a real recipe. He clicked "Pollo en Salsa" and
   * landed on a Costa Rican site's category index, because that is what TheMealDB has stored for it.
   * corpus-verify.mjs fetched all 594 sources and found 183 that cannot yield a recipe: 86 pages with
   * no recipe markup at all, 62 HTTP 402s from the Dotdash sites (allrecipes, simplyrecipes,
   * thespruceeats) blocking bots, and the rest dead or 404. Offering those is offering a link we
   * cannot stand behind, and it is also offering a dish that could never become a cook card. */
  const usable = all.filter((m) => m.sourceOk === true);
  return {
    meals: usable,
    attribution: raw.attribution as string,
    hiddenNoSource: all.length - usable.length,
    totalKnown: all.length,
    sourceCheckedAt: raw.sourceCheckedAt as string | null,
  };
}

/** Stock ids usable right now. Frozen counts: it needs a thaw, not a shop. */
function usableIds(stock: Awaited<ReturnType<typeof deriveStock>>): Set<string> {
  const s = new Set<string>();
  for (const it of Object.values(stock.items)) {
    if (it.level === 'have' || it.level === 'low') s.add(it.id);
  }
  return s;
}

/** Item ids are for code. `tomatoes_grape` and `stockcube` are not words, and they were rendering
 *  raw on the find page as "tinned tomatoes via your tomatoes_grape". */
export function nameOf(stock: Awaited<ReturnType<typeof deriveStock>>, id: string): string {
  const n = stock.items[id]?.n;
  return (n ?? id).replace(/\s*\([^)]*\)/g, '').trim();
}

export async function findCandidates() {
  const [{ meals, attribution, hiddenNoSource, totalKnown, sourceCheckedAt }, stock] =
    await Promise.all([loadCorpus(), deriveStock()]);
  const available = usableIds(stock);

  /* Dishes that would eat something already on a clock. This is the single most valuable ranking in
   * the whole surface: he has said twice that food going to waste is what he most wants this app to
   * prevent, and he has lost clearance peppers to exactly that. A dish that is merely cookable is
   * less useful than one that saves something. */
  const soon = new Map(
    expiringSoon(stock, 7, 25).map((i) => [i.id, { name: i.n, daysLeft: i.daysLeft ?? 99 }]),
  );

  const all: Candidate[] = meals.map((meal) => {
    const score = scoreRecipe(meal.ingredients.map((i) => `${i.measure} ${i.name}`), available);
    const hits = [...score.have, ...score.haveVia];
    const usesExpiring = hits
      .map((h) => (h.item && soon.has(h.item) ? { id: h.item, ...soon.get(h.item)! } : null))
      .filter((x): x is { id: string; name: string; daysLeft: number } => x !== null)
      // One dish can reach the same item on two lines; count it once.
      .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    // Resolve substitute ids to words here, once, so no surface has to know about item ids.
    for (const v of score.haveVia) if (v.via) v.via = nameOf(stock, v.via);
    return { meal, score, usesExpiring };
  });

  const byName = (a: Candidate, b: Candidate) => a.meal.name.localeCompare(b.meal.name);
  const cookable = (c: Candidate) => c.score.missing.length === 0;

  return {
    attribution,
    total: meals.length,
    hiddenNoSource,
    totalKnown,
    sourceCheckedAt,
    nameOf: (id: string) => nameOf(stock, id),
    /* Cookable AND saves something. Sorted by urgency, then by how much it uses up. */
    rescue: all
      .filter((c) => cookable(c) && c.usesExpiring.length > 0)
      .sort((a, b) => a.usesExpiring[0]!.daysLeft - b.usesExpiring[0]!.daysLeft
        || b.usesExpiring.length - a.usesExpiring.length),
    ready: all.filter((c) => c.score.verdict === 'ready' && c.usesExpiring.length === 0).sort(byName),
    probably: all.filter((c) => c.score.verdict === 'probably-ready' && c.usesExpiring.length === 0).sort(byName),
    unclear: all.filter((c) => c.score.verdict === 'unclear' && c.usesExpiring.length === 0).sort(byName),
    missingOne: all.filter((c) => c.score.missing.length === 1).sort(byName),
    missingTwo: all.filter((c) => c.score.missing.length === 2).sort(byName),
    /* What one purchase would unlock the most dishes. Counted only over dishes missing EXACTLY that
     * one thing, because "would unlock" has to mean it, not "would help with". */
    unlocks: (() => {
      const n = new Map<string, { count: number; reason?: string }>();
      for (const c of all) {
        if (c.score.missing.length !== 1) continue;
        const m = c.score.missing[0]!;
        const k = m.item ?? m.name;
        const cur = n.get(k) ?? { count: 0, reason: m.reason };
        n.set(k, { count: cur.count + 1, reason: cur.reason ?? m.reason });
      }
      return [...n.entries()].map(([item, v]) => ({ item, ...v }))
        .sort((a, b) => b.count - a.count).slice(0, 8);
    })(),
  };
}

/** TheMealDB serves a smaller derivative at /preview, which is what a grid wants. */
export const thumb = (image: string | null) => (image ? `${image}/preview` : null);
