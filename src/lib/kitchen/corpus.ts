import { readFile, readdir } from 'node:fs/promises';
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
  keywords?: string[];
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
  /** Every stock id this dish would draw on. Powers the "uses" filter, which is more useful to him
   *  than cuisine: the real question is "what can I make with the chicken thighs", not "show me
   *  Italian". Derived from the match, so it needs no tagging and cannot drift from the scoring. */
  usesIds: string[];
}

export interface Filters {
  q?: string;
  uses?: string;
  cuisine?: string;
  max?: number;
}

const DIR = join(process.cwd(), 'content', 'kitchen', 'corpus');

async function loadCorpus() {
  /* Every provider in corpus/ is merged. The directory is plural on purpose: TheMealDB was only ever
   * a seed, and it turned out to be the wrong SHAPE, not merely small. It is community-contributed,
   * so it carries 167 desserts and twelve pasta dishes, and its single bolognese had no source URL.
   * Silvio, 2026-08-13: "why are we trusting this purpose that apparently has the randomest recipes in
   * the world when we could have gone straight to BBC Good Food." Corpora are now ingested straight
   * from real sites via their published sitemaps, and only from sites whose robots.txt permits it. */
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
  const meals: CorpusMeal[] = [];
  const providers: { provider: string; count: number; attribution: string }[] = [];
  let totalKnown = 0;
  let checkedAt: string | null = null;

  for (const f of files) {
    const raw = JSON.parse(await readFile(join(DIR, f), 'utf8'));
    const all = (raw.meals ?? []) as CorpusMeal[];
    totalKnown += all.length;
    /* Only dishes whose source URL was VERIFIED to carry a real recipe. He clicked "Pollo en Salsa"
     * and landed on a Costa Rican site's category index, because that is what TheMealDB stored for it.
     * A link offered as a recipe has to be one, and a dish whose source yields nothing could never
     * become a cook card anyway. */
    const usable = all.filter((m) => m.sourceOk === true);
    meals.push(...usable);
    providers.push({
      provider: raw.provider ?? f,
      count: usable.length,
      attribution: raw.attribution ?? raw.provider ?? f,
    });
    if (raw.sourceCheckedAt && (!checkedAt || raw.sourceCheckedAt > checkedAt)) checkedAt = raw.sourceCheckedAt;
  }

  /* Same dish ingested twice under slightly different names is noise he already complained about
   * ("one is called shashuka and the other one is called chachuca"). This only removes EXACT
   * duplicates after normalising case and punctuation; near-duplicates are left alone deliberately,
   * because fuzzy-merging names hides real dishes. */
  const seen = new Set<string>();
  const deduped = meals.filter((m) => {
    const k = String(m.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    meals: deduped,
    providers: providers.sort((a, b) => b.count - a.count),
    hiddenNoSource: totalKnown - meals.length,
    dupesDropped: meals.length - deduped.length,
    totalKnown,
    sourceCheckedAt: checkedAt,
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

export async function findCandidates(filters: Filters = {}) {
  const [{ meals, providers, hiddenNoSource, dupesDropped, totalKnown, sourceCheckedAt }, stock] =
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
    const usesIds = [...new Set(hits.map((h) => h.item).filter((x): x is string => !!x))];
    return { meal, score, usesExpiring, usesIds };
  });

  const byName = (a: Candidate, b: Candidate) => a.meal.name.localeCompare(b.meal.name);
  const cookable = (c: Candidate) => c.score.missing.length === 0;

  /* FACETS, counted over everything BEFORE filtering, so a chip never claims a count the filter then
   * contradicts. `uses` is limited to things he actually has: offering "filter by pork" when there is
   * no pork in the kitchen is the app wasting his time. */
  const usesCount = new Map<string, number>();
  for (const c of all) for (const id of c.usesIds) usesCount.set(id, (usesCount.get(id) ?? 0) + 1);
  const usesFacets = [...usesCount.entries()]
    .filter(([id]) => available.has(id))
    .map(([id, count]) => ({ id, name: nameOf(stock, id), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const cuisineCount = new Map<string, number>();
  for (const c of all) if (c.meal.area) cuisineCount.set(c.meal.area, (cuisineCount.get(c.meal.area) ?? 0) + 1);
  const cuisineFacets = [...cuisineCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .filter((f) => f.count >= 8)
    .slice(0, 8);

  /* THE FILTER. He has 2,586 dishes and said: "some of these dishes seem to be extremely niche or
   * really random country cuisine. I wouldn't know how to filter those out." */
  const q = (filters.q ?? '').trim().toLowerCase();
  const filtered = all.filter((c) => {
    if (filters.max !== undefined && c.score.missing.length > filters.max) return false;
    if (filters.uses && !c.usesIds.includes(filters.uses)) return false;
    if (filters.cuisine && c.meal.area !== filters.cuisine) return false;
    if (q) {
      /* Ingredients are in the haystack because "cumin" or "sweet potato" is what he would type, and a
       * name-only search returned nothing for hundreds of dishes that use them while the page was
       * telling him to narrow it with the search box. */
      const hay = [
        c.meal.name,
        c.meal.area ?? '',
        c.meal.category ?? '',
        (c.meal.keywords ?? []).join(' '),
        c.meal.ingredients.map((i) => i.name).join(' '),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const isFiltered = Boolean(q || filters.uses || filters.cuisine || filters.max !== undefined);

  /* Ranked flat list for the filtered view. Fewest missing first, then whatever rescues food soonest,
   * then confidence, then name. A single ordered list beats five sections once a filter is applied,
   * because the whole point of filtering is that the result is short enough to read. */
  const rank = (a: Candidate, b: Candidate) =>
    a.score.missing.length - b.score.missing.length
    || (b.usesExpiring.length > 0 ? 1 : 0) - (a.usesExpiring.length > 0 ? 1 : 0)
    || a.score.unknown.length - b.score.unknown.length
    || byName(a, b);

  return {
    isFiltered,
    filters,
    usesFacets,
    cuisineFacets,
    matched: filtered.length,
    results: [...filtered].sort(rank),
    providers,
    total: meals.length,
    hiddenNoSource,
    dupesDropped,
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
        const k = m.item ?? m.shown;
        const cur = n.get(k) ?? { count: 0, reason: m.reason };
        n.set(k, { count: cur.count + 1, reason: cur.reason ?? m.reason });
      }
      return [...n.entries()].map(([item, v]) => ({ item, ...v }))
        .sort((a, b) => b.count - a.count).slice(0, 8);
    })(),
  };
}

/** TheMealDB serves a smaller derivative at /preview. NOBODY ELSE DOES.
 *
 *  This appended /preview to every image regardless of host, so 60 of the 114 thumbnails on the live
 *  page were 404s: budgetbytes, tasteofhome and bbcgoodfood all just 404. The photo is the thing he
 *  said he would choose by ("maybe from the picture and the name"), so half the menu was blank boxes.
 *  BBC Good Food happened to survive only because its URLs carry a query string, which /preview landed
 *  harmlessly inside. */
export const thumb = (image: string | null) => {
  if (!image) return null;
  return /(^|\.)themealdb\.com\//.test(image) ? `${image}/preview` : image;
};

/** How many dishes are browsable, without scoring any of them.
 *
 *  Exists because /kitchen hardcoded "625 published dishes" in the one link to the menu, and the real
 *  figure was 2,586 by then. A number typed into a sentence is a number that goes stale, which is the
 *  same lesson the stock rules already learned the hard way. */
export const corpusCount = async (): Promise<number> => (await loadCorpus()).meals.length;
