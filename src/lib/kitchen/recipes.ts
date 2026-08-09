import 'server-only';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cache } from 'react';
import type { Recipe, Stock, Ingredient, Offer, StepUse } from './types';

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

  for (const ing of r.ingredients) {
    // A garnish is not a blocker. Without this, adding "lemon wedges to serve" would knock the whole
    // dish down to "one swap", which teaches him to ignore the status.
    if (ing.optional) continue;
    const h = have(ing, stock);
    if (h === 'no') missing.push(ing);
    else if (h === 'frozen') frozen.push(ing.display);
    else if (ing.stock && stock.items[ing.stock]?.level === 'low') low.push(ing.display);
  }

  if (missing.some((m) => m.defining)) return { status: 'blocked', missing, frozen, low };
  if (missing.length) return { status: 'adapt', missing, frozen, low };
  if (frozen.length) return { status: 'thaw', missing: [], frozen, low };
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
