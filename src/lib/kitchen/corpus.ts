import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { deriveStock, expiringSoon } from './stock';
import { allRecipes } from './recipes';
import type { Recipe } from './types';
// One matcher implementation, in .mjs, so the CLI and the app can never disagree. See match-mjs.d.ts.
import { scoreRecipe, unreachableStock, type Score } from '../../../content/kitchen/match.mjs';

export interface CorpusMeal {
  /** Filled in by loadCorpus during the merge, so counts can be tallied after the dedupe. */
  provider?: string;
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
  /** The id of a cook card that already exists for this dish, so the row can link straight to it. */
  cardId?: string | null;
  meal: CorpusMeal;
  score: Score;
  /** Stock ids this dish would consume that are on a clock, soonest first. */
  usesExpiring: { id: string; name: string; daysLeft: number }[];
  /** Every stock id this dish would draw on. Powers the "uses" filter, which is more useful to him
   *  than cuisine: the real question is "what can I make with the chicken thighs", not "show me
   *  Italian". Derived from the match, so it needs no tagging and cannot drift from the scoring. */
  usesIds: string[];
  /** Which of the six course buckets this dish falls in. Several, usually. */
  courses: string[];
  /* WHAT IS STILL IN THE FREEZER, by name.
   *
   * `usableIds` counts frozen food as available, which is right for "do I need to shop" and wrong for
   * "can I cook this now". 41 of the 139 dishes badged ready depended on something frozen, and no
   * surface said so. DESIGN.md is explicit: "frozen is not have. Discovering at 6pm that dinner needed
   * thawing at 6am is a specific, avoidable failure, and it deserves its own state." The hub already
   * models it as status 'thaw'; find, want and shop all threw the axis away. */
  needsThaw: string[];
}

export interface Filters {
  q?: string;
  uses?: string;
  cuisine?: string;
  course?: string;
  max?: number;
}

/* WHAT KIND OF FOOD IT IS, which the page could not ask until 2026-08-16.
 *
 * He asked what sweet things he could make with 4.5 kg of oats, got an answer in chat, and then:
 * "where is all this i dont see it in the app". Fair. The corpus carries a `category` off every
 * page's JSON-LD, 102 of them Dessert and 25 Treat, and the only facets offered were CUISINE (by
 * country) and USES (by ingredient). "Show me sweet things" was reachable only by guessing that
 * typing "oat" into a search box would work.
 *
 * Publishers' categories are messy and overlapping (Dinner, Main course, Supper and Lunch all sit on
 * the same recipe), so they are grouped into the six a person actually picks between. Name matching
 * backs up the category for baking, because a lot of cake is filed under Snack. */
const COURSES: { id: string; label: string; cats: RegExp; names?: RegExp }[] = [
  { id: 'dinner',    label: 'Dinner',          cats: /^(Dinner|Main course|Supper)$/i },
  { id: 'sweet',     label: 'Sweet & baking',  cats: /^(Dessert|Treat|Afternoon tea)$/i,
    names: /cookie|brownie|muffin|cake|scone|flapjack|granola|crumble|pancake|pudding|shortbread|biscuit|banana bread|energy ball|energy bite/i },
  { id: 'breakfast', label: 'Breakfast',       cats: /^(Breakfast|Brunch)$/i },
  { id: 'lunch',     label: 'Lunch',           cats: /^(Lunch)$/i },
  { id: 'soup',      label: 'Soup',            cats: /^(Soup)$/i },
  { id: 'side',      label: 'Sides & snacks',  cats: /^(Side dish|Side|Snack|Starter|Canapes|Buffet)$/i },
];

function coursesOf(meal: CorpusMeal): string[] {
  const cats = String(meal.category ?? '').split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const c of COURSES) {
    if (cats.some((cat) => c.cats.test(cat))) out.add(c.id);
    if (c.names && c.names.test(meal.name)) out.add(c.id);
  }
  return [...out];
}

const DIR = join(process.cwd(), 'content', 'kitchen', 'corpus');

/* ONE LOADER, and it is exported because there were three.
 *
 * Found 2026-08-13: /kitchen/find said 2,586 dishes and /kitchen/shop said 2,626, one tap apart, along
 * with 139 versus 144 cookable and different unlock counts on every row. `shop.ts` and `want.ts` each
 * reimplemented this function and neither deduped, so every number on the shop page was computed over a
 * corpus 40 rows larger than the one the find page used.
 *
 * This is a verbatim recurrence of what `recipes.ts` documents as fixed, where two surfaces disagreed
 * about the same word by 14x. The lesson taken then was "extract isOfferable()". The lesson available
 * was "one loader", and taking the smaller one bought a second instance of the same bug six hours later.
 * Law 1: eliminate the class. Two callers of one function cannot disagree. */
export async function loadCorpus() {
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
  let unchecked = 0;
  let checkedAt: string | null = null;

  for (const f of files) {
    const raw = JSON.parse(await readFile(join(DIR, f), 'utf8'));
    const all = (raw.meals ?? []) as CorpusMeal[];
    totalKnown += all.length;
    /* Only dishes whose source URL was VERIFIED to carry a real recipe. He clicked "Pollo en Salsa"
     * and landed on a Costa Rican site's category index, because that is what TheMealDB stored for it.
     * A link offered as a recipe has to be one, and a dish whose source yields nothing could never
     * become a cook card anyway. */
    const provider = raw.provider ?? f;
    /* THREE STATES, not two. `sourceOk === false` was checked and failed; `sourceOk` ABSENT was never
     * checked at all. The find page said "214 of 2840 are hidden ... checked one by one", and 31 of
     * those 214 had never been fetched. Law 3, in a sentence written to demonstrate rigour. */
    unchecked += all.filter((m) => m.sourceOk === undefined).length;
    const usable = all.filter((m) => m.sourceOk === true).map((m) => ({ ...m, provider }));
    meals.push(...usable);
    /* count is filled in AFTER the dedupe below. It used to be `usable.length`, which is why the find
     * page's byline added up to 2,626 under a headline saying 2,586: the provider tallies were taken
     * before 40 duplicates were dropped. He checks arithmetic like that with a phone calculator. */
    providers.push({
      provider,
      count: 0,
      attribution: raw.attribution ?? provider ?? f,
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

  for (const p of providers) p.count = deduped.filter((m) => m.provider === p.provider).length;

  return {
    meals: deduped,
    providers: providers.sort((a, b) => b.count - a.count),
    hiddenNoSource: totalKnown - meals.length - unchecked,
    uncheckedCount: unchecked,
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
  const [{ meals, providers, hiddenNoSource, uncheckedCount, dupesDropped, totalKnown, sourceCheckedAt }, stock] =
    await Promise.all([loadCorpus(), deriveStock()]);
  const cards: Recipe[] = await allRecipes();

  /* WHICH OF THESE ALREADY HAS A COOK CARD, keyed by the source url the card cites.
   *
   * 2026-08-16, on Honey Garlic Chicken: "if I click one recipe from the What Can I Make page it
   * takes me to the one specific dish with the link already in the Read It thing... how many clicks
   * do I have to make to get to the actual? There's no way for me to naturally click around and
   * find this thing." Correct: every row here pointed at /kitchen/want, which is the page that says
   * what a dish would NEED. For a dish that has already been written out step by step that is one
   * screen of nothing, and the card it should have opened was unreachable except by typing the id. */
  const cardByUrl = new Map<string, string>();
  for (const r of cards) {
    const urls = [
      typeof r.source === 'string' ? r.source : r.source?.url,
      ...(r.provenance?.sources ?? []).map((x) => x.url),
    ].filter((u): u is string => !!u);
    // Trailing slashes differ between the corpus and what a recipe cites, and that is not a reason
    // to send him the long way round.
    for (const u of urls) cardByUrl.set(u.replace(/\/+$/, ''), r.id);
  }
  const available = usableIds(stock);

  /* Dishes that would eat something already on a clock. This is the single most valuable ranking in
   * the whole surface: he has said twice that food going to waste is what he most wants this app to
   * prevent, and he has lost clearance peppers to exactly that. A dish that is merely cookable is
   * less useful than one that saves something. */
  const soon = new Map(
    expiringSoon(stock, 7, 25).map((i) => [i.id, { name: i.n, daysLeft: i.daysLeft ?? 99 }]),
  );
  /* deriveStock already knows where everything is. Nothing was reading the freezer axis. */
  const frozen = new Set(
    Object.values(stock.items).filter((it) => it.where === 'freezer').map((it) => it.id),
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
    const needsThaw = [...new Set(usesIds.filter((id) => frozen.has(id)).map((id) => nameOf(stock, id)))];
    const cardId = meal.source ? cardByUrl.get(meal.source.replace(/\/+$/, '')) ?? null : null;
    return { meal, score, usesExpiring, usesIds, needsThaw, cardId, courses: coursesOf(meal) };
  });

  const byName = (a: Candidate, b: Candidate) => a.meal.name.localeCompare(b.meal.name);
  const cookable = (c: Candidate) => c.score.missing.length === 0;

  /* FACETS, counted over everything BEFORE filtering, so a chip never claims a count the filter then
   * contradicts. `uses` is limited to things he actually has: offering "filter by pork" when there is
   * no pork in the kitchen is the app wasting his time. */
  /* COUNTED OVER COOKABLE DISHES, not over all 2,586. Changed 2026-08-16, and the reason is the
   * whole point of the chips. Silvio, looking at a page listing 135 dishes he can cook: "why is it
   * not possible to pick one, like five options?"
   *
   * Counted over everything, the eight chips came out butter, eggs, frozen veg, garlic, spice rack,
   * stock, tinned tomatoes, yellow onions. **Not one protein.** Garlic wins that race because garlic
   * is in everything, which is exactly why filtering by it tells him nothing, and meanwhile the 5 kg
   * of ground beef, the chicken breast, the drumsticks and the tilapia, which are the things a
   * dinner is built around, never got a chip at all. The most abundant ingredient in a corpus is the
   * least useful thing to filter by.
   *
   * Over cookable dishes the order changes to garlic, eggs (41), butter, green onions, yellow onions,
   * soy, parsley, spice rack, CHICKEN BREAST (19), tinned tomatoes, grape tomatoes, pasta. Twelve
   * rather than eight, because the ninth was the first one that answered "what do I do with the
   * chicken". */
  const usesCount = new Map<string, number>();
  for (const c of all) {
    if (c.score.missing.length > 0) continue;
    for (const id of c.usesIds) usesCount.set(id, (usesCount.get(id) ?? 0) + 1);
  }
  const usesFacets = [...usesCount.entries()]
    .filter(([id]) => available.has(id))
    .map(([id, count]) => ({ id, name: nameOf(stock, id), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  /* Counted over COOKABLE dishes and the chip pins max=0, same rule as the ingredient chips: the
   * number on a chip has to be the number of rows tapping it produces. */
  const courseCount = new Map<string, number>();
  for (const c of all) {
    if (c.score.missing.length > 0) continue;
    for (const id of c.courses) courseCount.set(id, (courseCount.get(id) ?? 0) + 1);
  }
  const courseFacets = COURSES
    .map((c) => ({ id: c.id, label: c.label, count: courseCount.get(c.id) ?? 0 }))
    .filter((c) => c.count > 0);

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
    if (filters.course && !c.courses.includes(filters.course)) return false;
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

  const isFiltered = Boolean(q || filters.uses || filters.cuisine || filters.course || filters.max !== undefined);

  /* Ranked flat list for the filtered view. Fewest missing first, then whatever rescues food soonest,
   * then confidence, then name. A single ordered list beats five sections once a filter is applied,
   * because the whole point of filtering is that the result is short enough to read. */
  const rank = (a: Candidate, b: Candidate) =>
    a.score.missing.length - b.score.missing.length
    || (b.usesExpiring.length > 0 ? 1 : 0) - (a.usesExpiring.length > 0 ? 1 : 0)
    || a.score.unknown.length - b.score.unknown.length
    || byName(a, b);

  /* Food he owns that the matcher cannot see, named on the page rather than gated in the build. The
   * reasoning and the 2026-08-16 incident are in `unreachableStock` in match.mjs. Zero is the normal
   * state; anything else means a receipt added stock nobody gave an alias row, and every dish wanting
   * that food is being reported as blocked while it sits in the pantry. */
  const invisible = unreachableStock(Object.values(stock.items));

  return {
    invisible,
    isFiltered,
    filters,
    usesFacets,
    courseFacets,
    cuisineFacets,
    matched: filtered.length,
    results: [...filtered].sort(rank),
    providers,
    total: meals.length,
    hiddenNoSource,
    uncheckedCount,
    dupesDropped,
    totalKnown,
    sourceCheckedAt,
    nameOf: (id: string) => nameOf(stock, id),
    /* THE ONE NUMBER A HEADLINE MAY USE, added 2026-08-21.
     *
     * Nothing missing, nothing unrecognised, nothing frozen. `scoreRecipe` only returns verdict
     * 'ready' when both `missing` and `unknown` are empty, so this is the set where the app can say
     * yes without a qualifier.
     *
     * It exists because the home page headline was wrong twice in one sitting, both times in the same
     * direction. First it counted `rescue + ready` and read "193 you can cook from the fridge", while
     * `rescue` did not exclude frozen food. Fixed, and it still read 156, because `rescue` uses
     * `cookable()`, which is `missing.length === 0` and deliberately tolerates unrecognised
     * ingredients: the top row of that group was a steak dish, in a kitchen with no steak, badged
     * "4 unsure".
     *
     * Both mistakes came from a headline assembled out of display buckets. Display buckets are sorted
     * and sliced for reading, and the moment a count is built by adding two of them together it means
     * whatever their filters happen to mean today. So the claim gets its own definition, next to the
     * buckets, and a false "you have this" stops being one refactor away. Law 5. */
    confidentNow: all.filter((c) => c.score.verdict === 'ready' && c.needsThaw.length === 0),
    /* Cookable AND saves something. Sorted by urgency, then by how much it uses up. */
    /* `&& needsThaw.length === 0` added 2026-08-21. This group is headed "Cook one of these and
     * nothing goes to waste" and described as "Cookable now", and it did not exclude frozen food,
     * so it made exactly the claim the comment below forbids `ready` from making. It mattered the
     * moment the home page started counting: the headline read "193 you can cook from the fridge"
     * and some of those needed several hours in the fridge first. A false "you have this" is worse
     * than a false "you lack this", which is law 5.
     *
     * Nothing is lost by the exclusion: `thaw` no longer requires `usesExpiring` to be empty, so a
     * dish that would save something AND needs a thaw lands there and sorts to the front. Checked
     * because this codebase has already shipped a bucket that was computed and rendered nowhere. */
    rescue: all
      .filter((c) => cookable(c) && c.usesExpiring.length > 0 && c.needsThaw.length === 0)
      .sort((a, b) => a.usesExpiring[0]!.daysLeft - b.usesExpiring[0]!.daysLeft
        || b.usesExpiring.length - a.usesExpiring.length),
    /* READY NOW means the pan can go on now. A dish needing a thaw is not that, and calling it ready
     * paints the `--signal` colour on a claim that is false for the next several hours. `kitchen.css`
     * says of that colour: "the one place --signal is allowed: a value that is true right now." */
    ready: all.filter((c) => c.score.verdict === 'ready' && c.usesExpiring.length === 0 && c.needsThaw.length === 0).sort(byName),
    /* No longer requires `usesExpiring` to be empty, so it catches the dishes `rescue` now excludes
     * for needing a thaw. Anything on a clock sorts first, because those are the ones where the thaw
     * has to be started tonight rather than whenever. */
    thaw: all.filter((c) => cookable(c) && c.needsThaw.length > 0)
      .sort((a, b) => (a.usesExpiring[0]?.daysLeft ?? 99) - (b.usesExpiring[0]?.daysLeft ?? 99) || byName(a, b)),
    probably: all.filter((c) => c.score.verdict === 'probably-ready' && c.usesExpiring.length === 0 && c.needsThaw.length === 0).sort(byName),
    /* `unclear` was computed and never rendered, so four dishes missing nothing at all belonged to no
     * group and were unreachable in the default view while the "nothing missing" chip still counted
     * them. The chip said 139 and the sections added to 135. */
    unclear: all.filter((c) => c.score.verdict === 'unclear' && c.usesExpiring.length === 0 && c.needsThaw.length === 0).sort(byName),
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
