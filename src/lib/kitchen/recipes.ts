import 'server-only';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cache } from 'react';
import type { Recipe, Stock, Ingredient, Offer, StepUse, StockItem } from './types';

const DIR = join(process.cwd(), 'content', 'kitchen', 'recipes');

/* react's cache() dedupes within ONE render. It does not survive to the next request, so every
 * hit re-read and re-parsed the whole recipe directory. Same fix and same reasoning as
 * loadCorpus(): these files are bundled at build time and cannot change while the process lives,
 * so the parse is cached for the life of the instance and a deploy is what invalidates it.
 * Smaller than the corpus at 500 KB, but it is on /kitchen and /kitchen/[id], the pages he
 * actually opens while cooking. */
let recipesPromise: Promise<Recipe[]> | null = null;

export const allRecipes = cache(async (): Promise<Recipe[]> => {
  recipesPromise ??= (async () => {
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
    const out = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(join(DIR, f), 'utf8')) as Recipe),
    );
    return out.sort((a, b) => a.name.localeCompare(b.name));
  })();
  return recipesPromise;
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
   * all?", so a dish needing 500 g of beef counted as READY against 50 g. That is the "it says X
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

/** Forms with no heat step anywhere in them cannot burn a dinner. `SOURCING.md`'s verbatim-only bar
 *  exists because every defect that reached the stove was an invented heat, timing or doneness
 *  instruction; an assembly (stir measured things into a bowl) or a macro (freeze it) carries none of
 *  that risk by construction. Decided 2026-08-13 after an audit of the 27 machine-migrated recipes
 *  found 6 with no heat step, one already clean, the rest one qty/closure bug away from it. */
const NO_HEAT_FORMS = new Set(['assembly', 'macro']);

/** The no-heat claim, and where it is allowed to come from.
 *
 *  This used to be `!r.steps.some(s => s.heat)`, an inference from a missing field, and the field is
 *  empirically unpopulated: eight recipes here print oven temperatures and air-fryer times and carry
 *  `heat` on no step at all, so all eight claimed no heat. `form` and stale read stamps were the only
 *  things keeping them out, and neither is about heat. Law 1: the absence is now unrepresentable as
 *  evidence. A recipe must SAY it applies no heat, and `validate.mjs` refuses to build if the words
 *  on the screen disagree. See `provenance.heatFree` in types.ts and content/kitchen/heat-evidence.mjs. */
const claimsNoHeat = (r: Recipe) => r.provenance?.heatFree === true;

/** Is this recipe fit to be OFFERED, as opposed to merely present.
 *
 *  Lives here because two surfaces were answering it differently and disagreeing by 14x: the hub row
 *  counted every recipe whose stock was satisfied and announced "14 dishes you can cook right now",
 *  then /kitchen applied the read gate and the verbatim gate and said "1 ready to start". Same claim,
 *  same session, one tap apart. The first thing the app did on open was overpromise by an order of
 *  magnitude, which is exactly what primes "not sure what I'm supposed to be looking for".
 *
 *  The bar, and all four parts matter:
 *    - every step has been READ as the app renders them, at this exact build
 *    - the rendered text has not drifted since (readHash)
 *    - it did not fail at the stove
 *    - it is `sourced` (nothing changed by an agent) OR it is a no-heat assembly/macro, which cannot
 *      carry the invented-instruction risk `sourced` exists to rule out. Still `provenance.tier` is
 *      whatever it honestly is ('authored' stays 'authored'); CookClient shows that tier's warning
 *      regardless of whether the dish is offered.
 */
export function isOfferable(r: Recipe): boolean {
  const p = r.provenance;
  if (!p) return false;
  if (p.cookedResult === 'failed') return false;
  if (!p.readAt || p.readAt !== r.build) return false;
  /* HE COOKED IT AND IT WORKED. Added 2026-08-21, and it is the missing half of the rule directly
   * above it.
   *
   * Until today this function reasoned only about WHO WROTE the card. `failed` removed a dish and
   * nothing admitted one, so the single route into the menu was agent paperwork: capture a page,
   * build a card, read it, stamp it. That has happened six times, which is why the answer to "what
   * can I make" was six dishes for ten days running while a freezer full of food sat behind it. His
   * words, 2026-08-21: "we're just trapped on four or five dishes because those are the ones that
   * I've made... it's actually just frustrating and we're just wasting time and tokens."
   *
   * The asymmetry was indefensible on the gate's own logic. `sourced` is a PROXY for "this will not
   * burn your dinner", and the reason it is trusted is that three sourced cards were cooked and three
   * worked. A dish he has already cooked, on this hob, with this pan, and rated good is not a proxy
   * for that: it is the measurement. Requiring the proxy from something that has passed the real test
   * is the tail wagging the dog, and it threw away the only evidence in the system that came from
   * outside an agent.
   *
   * Scoped deliberately, and each clause is load-bearing:
   *   - The read gate above still applies, so this cannot resurrect a card that was edited after he
   *     cooked it. What he validated has to be what is on the screen.
   *   - `failed` is checked FIRST and still wins, so this can never overturn a bad outcome.
   *   - It admits the dish; it does NOT launder the tier. `provenance.tier` stays whatever it
   *     honestly is and CookClient still shows that tier's warning. Offered and vouched-for are
   *     different claims and the screen keeps making both.
   *
   * `cookedResult` is set from his rating in `cook_log`, never from an agent's read of how a cook
   * went. That distinction had already been violated once: `beefmushroomrice` carried
   * `cookedResult: "worked"` because he ate the food, while his actual rating was `wrong` and the
   * cook_log entry says so in the first line. Corrected to `failed` in the same commit as this
   * change, because a field that means "he liked it" cannot be populated by inference. */
  if (p.cookedResult === 'worked') return true;
  if (p.tier === 'sourced') return true;
  return NO_HEAT_FORMS.has(r.form) && claimsNoHeat(r);
}
