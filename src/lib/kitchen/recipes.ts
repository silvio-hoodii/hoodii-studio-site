import 'server-only';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cache } from 'react';
import type { Recipe, Stock, Ingredient, Offer, StepUse, StockItem } from './types';

const DIR = join(process.cwd(), 'content', 'kitchen', 'recipes');

export const allRecipes = cache(async (): Promise<Recipe[]> => {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
  const out = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(DIR, f), 'utf8')) as Recipe),
  );
  return out.sort((a, b) => a.name.localeCompare(b.name));
});

export const getRecipe = cache(async (id: string): Promise<Recipe | null> => {
  try {
    return JSON.parse(await readFile(join(DIR, `${id}.json`), 'utf8')) as Recipe;
  } catch {
    return null;
  }
});

export const equipmentVocab = cache(async (): Promise<Record<string, { name: string; present: boolean }>> => {
  const j = JSON.parse(await readFile(join(process.cwd(), 'content', 'kitchen', 'schema', 'equipment.json'), 'utf8'));
  return j.equipment;
});

/** Normalise a step's `uses`, which may be a bare ref or a ref with a share of the total. */
export const asUse = (u: string | StepUse): StepUse => (typeof u === 'string' ? { ref: u } : u);

/** Does this kitchen have the thing right now?
 *
 * Staples are the slow half of the three-speeds model: presence is binary and lives in KITCHEN.md,
 * not in event-sourced stock. An ingredient with no stock link is likewise assumed present, because
 * asserting an absence we never checked is how a real whisk got designed around for a week. */
/* Units this app can actually compare, normalised to a base. Anything not in here (a "bag", a
 * "bunch", a "clove") is deliberately NOT convertible: guessing that a bag is 500 g is exactly the
 * invented precision the stock rules forbid, so an unmatched pair falls back to a presence check. */
const UNIT_BASE: Record<string, { base: string; factor: number }> = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  count: { base: 'count', factor: 1 },
};

function toBase(qty: number, unit: string | null | undefined) {
  const u = UNIT_BASE[(unit ?? '').toLowerCase().trim()];
  return u ? { base: u.base, value: qty * u.factor } : null;
}

/** Is there ENOUGH, not merely SOME.
 *
 *  Returns null when the question cannot be answered honestly: no amount on the recipe, no amount in
 *  stock, or two units that cannot be converted without inventing a conversion. Null means "fall
 *  back to presence", never "assume enough" and never "assume not enough". */
function enoughFor(ing: Ingredient, it: StockItem): boolean | null {
  if (ing.qty == null || it.qty == null) return null;
  const need = toBase(ing.qty, ing.unit);
  const has = toBase(it.qty, it.unit);
  if (!need || !has || need.base !== has.base) return null;
  return has.value >= need.value;
}

function have(ing: Ingredient, stock: Stock): 'yes' | 'frozen' | 'no' {
  if (ing.staple || !ing.stock) return 'yes';
  const it = stock.items[ing.stock];
  if (!it) return 'yes';
  if (it.state === 'frozen') {
    // Some dishes WANT it frozen. A smoothie made with thawed fruit is a warm smoothie. The old app
    // had this backwards too and told him to move the berries to the fridge overnight before he
    // could make a protein shake.
    return ing.frozenOk ? 'yes' : 'frozen';
  }

  /* Amounts decide when both sides know one.
   *
   * Until 2026-08-11 this line was the whole test, and it asked "is this ingredient present at
   * all?" — so a dish needing 500 g of beef counted as READY against 50 g. That is the "it says X
   * recipes when really there is none" complaint: the number was never dishonest, it just answered
   * a different question than the one being asked of it.
   *
   * Where either side does not know its amount, nothing changes: presence still decides, exactly as
   * before. This tightens the answer where there is data and never manufactures one where there is
   * not. */
  const enough = enoughFor(ing, it);
  if (enough === false) return 'no';

  return it.level === 'have' || it.level === 'low' ? 'yes' : 'no';
}

/** THE question the whole app exists to answer, run per dish.
 *
 * The rule that changed on 2026-08-08: a dish whose DEFINING ingredient is missing is not offered
 * at all. "Chicken Piccata, no capers, and you can still make this" is the app arguing with the
 * person holding the pan. A dish named after an ingredient he does not have is not a dish.
 *
 * Non-defining absences still adapt, which is also his: "we are not going to limit a dish because
 * there is no cumin, so let's use what we have." */
export function offer(r: Recipe, stock: Stock): Offer {
  const missing: Ingredient[] = [];
  const frozen: string[] = [];
  const low: string[] = [];
  // The generic thaw line assumes a block of meat and an overnight fridge. Where an ingredient knows
  // its own thaw, that wins: telling him a 20-minute counter thaw is "tomorrow" reads as "not today"
  // and cancels a dinner he could have cooked.
  let thawText: string | undefined;

  for (const ing of r.ingredients) {
    // A garnish is not a blocker. Without this, adding "lemon wedges to serve" would knock the whole
    // dish down to "one swap", which teaches him to ignore the status.
    if (ing.optional) continue;
    const h = have(ing, stock);
    if (h === 'no') missing.push(ing);
    else if (h === 'frozen') {
      frozen.push(ing.display);
      if (!thawText && ing.thawText) thawText = ing.thawText;
    } else if (ing.stock && stock.items[ing.stock]?.level === 'low') low.push(ing.display);
  }

  if (missing.some((m) => m.defining)) return { status: 'blocked', missing, frozen, low };
  if (missing.length) return { status: 'adapt', missing, frozen, low };
  if (frozen.length) return { status: 'thaw', missing: [], frozen, low, thawText };
  return { status: 'ready', missing: [], frozen, low };
}

export interface Cookable {
  recipe: Recipe;
  offer: Offer;
  lastCooked: string | null;
  daysSinceCooked: number | null;
}

/** Rank what to put in front of him.
 *
 * Stated 2026-08-03: "I don't want to be the one that's coming up with all these ideas." So the
 * ordering is the system's job. Ready beats needs-a-thaw beats needs-adapting; blocked never
 * appears. Something cooked in the last three days sinks, because the complaint that started this
 * rebuild was a dish he had already eaten still being pushed at him. */
export function rank(items: Cookable[]): Cookable[] {
  const weight = { ready: 0, thaw: 1, adapt: 2, blocked: 9 } as const;

  // A dip and a tray of carrots are not answers to "what do I cook". They are things you put next
  // to an answer. Sides, sauces and the one dessert sink below real meals.
  const isSide = (c: Cookable) =>
    c.recipe.meal.some((m) => m === 'side' || m === 'sauce' || m === 'dessert') ||
    c.recipe.form === 'macro';

  return items
    .filter((c) => c.offer.status !== 'blocked')
    .sort((a, b) => {
      const recentA = a.daysSinceCooked !== null && a.daysSinceCooked <= 3 ? 1 : 0;
      const recentB = b.daysSinceCooked !== null && b.daysSinceCooked <= 3 ? 1 : 0;
      if (recentA !== recentB) return recentA - recentB;

      const w = weight[a.offer.status] - weight[b.offer.status];
      if (w !== 0) return w;

      const sa = isSide(a) ? 1 : 0;
      const sb = isSide(b) ? 1 : 0;
      if (sa !== sb) return sa - sb;

      // Protein is the one number this whole system tracks, so among real meals the biggest dent
      // goes first rather than the quickest.
      const pa = a.recipe.serves.proteinPerUnit ?? 0;
      const pb = b.recipe.serves.proteinPerUnit ?? 0;
      if (pa !== pb) return pb - pa;

      return (a.recipe.time.totalMin ?? 999) - (b.recipe.time.totalMin ?? 999);
    });
}
