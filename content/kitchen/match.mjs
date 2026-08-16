#!/usr/bin/env node
/**
 * Score a published recipe against what is actually in this kitchen.
 *
 *   node content/kitchen/match.mjs <recipe-url>
 *   node content/kitchen/match.mjs <recipe-url> --json
 *
 * Why this exists. Silvio, 2026-08-12: "looking for the recipes online is the easy part, I think the
 * hard part is us figuring out how we connect that to what's in the kitchen." Correct, and this file
 * is that connection.
 *
 * Recipe corpora and scrapers are commodities. Every serious recipe site publishes JSON-LD because
 * Google requires it for recipe search results, so extraction needs no API key and no library: six
 * sites were parsed by hand in one session on 08-12. What cannot be bought is the mapping from
 * "1 small onion (about 2 to 3 ounces), sliced thinly" to the specific bag of yellow onions in HIS
 * pantry, kept distinct from the two white ones he bought that night. `stock/aliases.json` holds
 * that, and it is the actual product.
 *
 * The one rule that matters most here: an ingredient this table does not recognise is reported
 * UNKNOWN, never MISSING. Missing means we know he lacks it. Unknown means our table has a gap.
 * Conflating them would silently reject dishes he could cook, which is exactly how the verbatim-only
 * experiment took the catalogue to 0 of 30.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ALIASES = JSON.parse(readFileSync(join(HERE, 'stock', 'aliases.json'), 'utf8'));

/* ---------------- parsing an ingredient line ---------------- */

const UNITS = [
  'cups?', 'c', 'tablespoons?', 'tbsps?', 'tbs', 'tbl', 'teaspoons?', 'tsps?',
  'ounces?', 'oz', 'pounds?', 'lbs?', 'lb', 'grams?', 'g', 'kilograms?', 'kg',
  'milliliters?', 'millilitres?', 'ml', 'liters?', 'litres?', 'l',
  'cloves?', 'sprigs?', 'pinch(?:es)?', 'dash(?:es)?', 'cans?', 'jars?', 'packages?',
  'packs?', 'bunch(?:es)?', 'slices?', 'sticks?', 'heads?', 'stalks?', 'pieces?',
  'handfuls?', 'quarts?', 'pints?', 'bowls?', 'servings?',
];
const SIZES = ['large', 'small', 'medium', 'big', 'extra large', 'jumbo', 'thin', 'thick'];

/* Compiled once. These were being rebuilt from a join on every ingredient line, which is 40,000
 * needless compilations per page render. */
const UNITS_RE = new RegExp(`\\b(?:${UNITS.join('|')})\\b`, 'g');
const SIZES_RE = new RegExp(`\\b(?:${SIZES.join('|')})\\b`, 'g');

/** Does the recipe itself mark this line as optional?
 *
 * Must be asked BEFORE parseIngredient, which strips parentheticals. Found 2026-08-12: gyudon's
 * "Japanese red pickled ginger (benishoga) (optional), to serve" lost the word `optional` to the
 * paren strip and was then reported as a missing ingredient, which is the app arguing with him about
 * a garnish its own source called optional. */
export function isOptionalLine(raw) {
  /* Deliberately narrow. A first version also treated "to serve" as optional and swallowed gyudon's
   * "4 cups short-grain white rice, to serve", which is the BASE of the dish, not a garnish. "to
   * serve" usually means "for serving alongside" and sometimes means "this is the starch", and
   * nothing in the text distinguishes them. So only an explicit optional marker counts. */
  const s = String(raw);
  if (/\boptional\b|\bif (?:using|desired|you like|you have)\b|\bfor garnish\b/i.test(s)) return true;
  /* THE DISCRIMINATOR THE 2026-08-12 VERSION WAS MISSING, added 2026-08-16. "nothing in the text
   * distinguishes them" was not true: the amount does. A line that is a serving suggestion carries no
   * quantity ("green vegetables to serve", "crusty bread to serve"), and a line that is part of the
   * dish carries one ("4 cups short-grain white rice, to serve", "50g parmesan, plus extra to serve").
   * So require BOTH the serving phrase and the absence of any number.
   *
   * What this cost while it was missing: 50 dishes across the corpus were reported as blocked by
   * "green vegetables" and 28 by "bread", every one of them a side dish BBC Good Food suggests and
   * none of them an ingredient. 87 cookable dishes were hidden behind a suggestion to eat some
   * broccoli with it, in an app whose whole job is to answer "what can I make right now".
   * 571 lines in the corpus match this rule; the amount-carrying ones above are all kept. */
  return /\b(?:to serve|for serving|on the side|to accompany)\b/i.test(s) && !/[0-9¼½¾⅓⅔⅛⅜⅝⅞]/.test(s);
}

/** Turn a published ingredient line into a bare ingredient name, or '' if nothing survives. */
export function parseIngredient(raw, opts = {}) {
  const { keepAfterComma = false, keepOr = false } = typeof opts === 'boolean' ? { keepAfterComma: opts } : opts;
  /* Strip diacritics rather than delete them. The final `[^a-z\s]` sweep was destroying accented
   * letters, so "100g creme fraiche" arrived as "cr me fra che" and never matched anything: 29
   * mentions for that one and 24 for jalapeno. Decomposing first keeps the letters. */
  let s = String(raw).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /* `&amp;` becomes the word, not a space. Budget Bytes writes "salt &amp; pepper to taste" and the
   * blanket entity strip left "salt pepper", which no alias and no staple matches and which the
   * and-compound split can no longer see. 77 lines in the corpus carry it. Before this, the fallback
   * chain reached the bare "pepper" alias and credited his four yellow sweet peppers for a pinch of
   * seasoning: a false HAVE, which is the expensive direction. */
  s = s.replace(/&amp;/g, ' and ');                 // BEFORE the blanket strip, or it becomes a space
  s = s.replace(/&frac\d+;|&[a-z]+;/g, ' ');       // html entities from scraped pages
  s = s.replace(/&/g, ' and ');                     // and a bare ampersand, after the entities are gone
  s = s.replace(/\([^)]*\)/g, ' ');                 // "(about 2 to 3 ounces)"
  s = s.replace(/\[[^\]]*\]/g, ' ');
  if (!keepAfterComma) s = s.split(/,/)[0];         // prep after the first comma
  if (!keepOr) s = s.split(/\bor\b/)[0];            // "parmesan or pecorino" -> first named
  /* Trailing noise. This matters more since staples became whole-name matches: any leftover word means
   * "extra-virgin olive oil plus extra" no longer equals "olive oil" and a pantry staple reads as an
   * unknown. Stripped anywhere, not just at the end, because these clauses turn up mid-line too. */
  s = s.replace(/\bplus\b.*$/g, ' ');
  s = s.replace(/\b(?:to taste|as needed|to serve|for (?:serving|garnish|the pan|dusting|frying|greasing)|optional|divided|defrosted|thawed|at room temperature|roughly|approx)\b/g, ' ');
  s = s.replace(/\b(?:extra virgin|extravirgin|virgin|light|dark|low sodium|reduced sodium|free range|organic|unsalted|salted|semi skimmed|full fat|reduced fat|skimmed)\b/g, ' ');
  s = s.replace(/[¼-¾⅐-⅞]/g, ' ');  // vetted fractions
  s = s.replace(/\d+\s*\/\s*\d+/g, ' ');            // 1/2
  s = s.replace(/\d+(?:[.,]\d+)?/g, ' ');           // remaining numbers
  s = s.replace(/[-–—]/g, ' ');   // lint-prose-allow: this line exists to REMOVE them
  s = s.replace(UNITS_RE, ' ');
  s = s.replace(SIZES_RE, ' ');
  /* PREP words go. PRODUCT-IDENTITY words STAY.
   *
   * This list used to strip ground, minced, sliced, cooked, raw, dried, frozen and fresh, and that was
   * the single worst bug in this file. Those words ARE the product. An audit of all 2,586 dishes found
   * 91 of 139 "ready" dishes contained something he does not have, and nearly every case traced here:
   *
   *   "ground chicken"  -> "chicken"  so a 2.25 kg WHOLE CHICKEN matched one bag of frozen mince, and
   *                                   the app offered eight roast dinners on the strength of it
   *   "cooked ground beef" -> "beef"  so "4 lbs boneless beef rump roast" matched 700 g of browned mince
   *   "sliced turkey"   -> "turkey"   so "1 lb ground turkey" matched deli slices
   *   "frozen berries"  -> "berries"  so mango chutney matched the frozen fruit
   *   "cooked pasta"    -> "pasta"    so "8 oz pasta (uncooked)" matched the fridge leftovers
   *   fresh vs dried                  so "1 tsp dried basil" matched a 28 g packet of fresh basil
   *
   * Keeping words is SAFE, because item matching is containment: "onion sliced" still contains "onion".
   * Only the stripping destroyed information, and it destroyed exactly the information that tells two
   * products apart. */
  /* `crushed` was in this list until 2026-08-13 and it was the same mistake as ground and minced,
   * one word later. Measured over all 29,787 ingredient lines in the corpus: "crushed" is followed by
   * "red pepper" 59 times and "tomatoes" 27, and in the ~320 remaining cases it TRAILS the ingredient
   * ("garlic cloves, crushed"). So leading `crushed` is product identity and trailing `crushed` is prep,
   * and stripping it unconditionally destroyed the identity to save the prep.
   *
   * The cost was a false "you have this", which is the expensive direction: "crushed red pepper" parsed
   * down to "red pepper", which is a BELL PEPPER alias, so 59 recipes wanting chilli flakes were told
   * the fridge had them because there are bell peppers in it. Same for a bare "jalapeno", which landed
   * on the jar of crushed jalapeno instead of the fresh chilli he does not have.
   *
   * Not stripping it costs nothing, because trailing prep is already handled: "2 garlic cloves crushed"
   * still contains the phrase "garlic", and matchToItem tests containment for items. */
  s = s.replace(/\b(?:freshly|chopped|grated|shredded|diced|beaten|peeled|trimmed|rinsed|deseeded|halved|quartered|of|the|a|an|about|approximately|good|quality|ripe|thinly|roughly|finely)\b/g, ' ');
  s = s.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

/* ---------------- matching a name to this kitchen ---------------- */

/** Alias phrases sorted longest-first, so `ground beef` is tested before `beef`. */
function aliasIndex() {
  const rows = [];
  for (const [itemId, phrases] of Object.entries(ALIASES.map)) {
    for (const p of phrases) rows.push({ itemId, phrase: parseIngredient(p) || p.toLowerCase() });
  }
  /* Staples are matched on the WHOLE ingredient name, never a fragment. Found 2026-08-13: the `water`
   * staple swallowed "145g tuna in spring water, drained", so a tuna pasta reported READY in a kitchen
   * with no tuna. A staple claim says "this ingredient IS just salt"; an item claim legitimately says
   * "this ingredient CONTAINS chicken thighs". Different claims, so different matching. */
  for (const p of ALIASES.staples) rows.push({ itemId: '__STAPLE__', phrase: parseIngredient(p) || p.toLowerCase(), whole: true });
  // Gaps match on their key AND on their aliases, because a recipe writes "Japanese dashi powder",
  // never "hondashi". Without the aliases that line landed in UNKNOWN instead of MISSING.
  for (const g of Object.keys(ALIASES._knownGaps)) {
    if (g.startsWith('_')) continue;
    const phrases = [g, ...((ALIASES._gapAliases || {})[g] || [])];
    for (const p of phrases) rows.push({ itemId: `__GAP__${g}`, phrase: parseIngredient(p) || p.toLowerCase() });
  }
  /* Compile each phrase ONCE, here, instead of once per ingredient per row. The find page scores
   * 2,626 recipes against ~450 alias rows, so building these inside the match loop meant on the order
   * of fifteen million regex compilations and a 16-second page. Same matching, ~100x less work. */
  return rows
    .filter((r) => r.phrase)
    .sort((a, b) => b.phrase.length - a.phrase.length)
    .map((r) => ({
      ...r,
      re: r.whole ? null : new RegExp(`(?:^|\\s)${r.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`),
    }));
}
const INDEX = aliasIndex();

/* An inverted index, word to candidate rows.
 *
 * Precompiling the regexes was not enough. Scoring 2,626 recipes meant 2,626 x ~12 ingredients x ~450
 * rows, so fourteen million regex tests and a 17-second page even with every pattern compiled once.
 * The fix is to stop testing patterns that cannot possibly match: an alias phrase can only match a
 * name if they share at least one word. Looking rows up by the words actually present cuts the
 * candidate set from ~450 to single digits.
 *
 * Rows are kept in the same longest-phrase-first order inside each bucket, so `ground beef` still wins
 * over `beef` and the matching behaviour is identical. This is purely a way of skipping impossible
 * work, not a change to what matches. */
const BY_WORD = new Map();
for (const r of INDEX) {
  for (const w of new Set(r.phrase.split(' '))) {
    if (!w) continue;
    let bucket = BY_WORD.get(w);
    if (!bucket) BY_WORD.set(w, (bucket = []));
    bucket.push(r);
  }
}

/** Only the rows that share a word with this name, still longest-phrase-first. */
function candidates(name) {
  const words = new Set(name.split(' '));
  const seen = new Set();
  const out = [];
  for (const w of words) {
    const bucket = BY_WORD.get(w);
    if (!bucket) continue;
    for (const r of bucket) {
      if (seen.has(r)) continue;
      seen.add(r);
      out.push(r);
    }
  }
  return out.sort((a, b) => b.phrase.length - a.phrase.length);
}

const VETOES = ALIASES._vetoes || {};
/* Lowercased once. `veto.some(...)` ran on every row of every ingredient. */
const VETO_LC = Object.fromEntries(
  Object.entries(VETOES).map(([k, v]) => [
    k,
    (Array.isArray(v) ? v : []).map((x) => {
      const t = String(x).toLowerCase();
      return { t, re: new RegExp(`(?:^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z]|$)`) };
    }),
  ]),
);

/** '__STAPLE__' | '__GAP__<name>' | '<itemId>' | null
 *
 * Vetoes exist because longest-match alone is not enough. Found on the first real run, 2026-08-12:
 * "short-grain white rice" CONTAINS the phrase "white rice", so it matched longgrainrice and reported
 * that he had the right rice when he does not. A false "you have this" is worse than a false "you are
 * missing this", because the first silently produces the wrong dish and the second only costs a shop.
 * So a qualifier in the text can disqualify an item outright, whatever the alias table says. */
export function matchToItem(name, raw = name) {
  if (!name) return null;
  const rawLc = String(raw).toLowerCase();
  for (const r of candidates(name)) {
    const veto = VETO_LC[r.itemId];
    /* Vetoes test the RAW line, never the parsed name. Their entire job is to catch qualifiers that
     * parseIngredient deliberately strips: "ground", "pickled", "canned", "short-grain". Testing them
     * against the parsed name was self-defeating and produced a spectacular bug, found 2026-08-12 by
     * counting unrecognised ingredients across 625 recipes: `ginger`'s veto list contains "ground
     * ginger", which parses down to "ginger", which then vetoed ginger against itself. Ginger came
     * back UNRECOGNISED 48 times in a kitchen that has had fresh ginger since August 4. */
    /* Word-boundary aware. A plain substring test made the `cooked` veto fire inside "uncooked",
     * which pushed 78 dry-pasta lines onto the fridge leftovers. */
    if (veto && veto.some((v) => v.re.test(rawLc))) continue;
    /* Staples must match the WHOLE name; items and gaps match a phrase inside it. Found 2026-08-13:
     * the `water` staple swallowed "145g tuna in spring water, drained", so a tuna pasta reported
     * READY in a kitchen with no tuna. The two claims are genuinely different. A staple claim is
     * "this ingredient IS just salt". An item claim is "this ingredient CONTAINS chicken thighs".
     * Only the second one is legitimately about a fragment. */
    if (r.whole) {
      if (name === r.phrase) return r.itemId;
      continue;
    }
    // Word-boundary guarded so `oil` does not match `boiling`.
    const re = new RegExp(`(?:^|\\s)${r.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
    if (re.test(name)) return r.itemId;
  }
  return null;
}

/* EVERY item that could serve a line, not just the winner.
 *
 * `matchToItem` returns on the first hit and stops, which is right for scoring: one line needs one
 * answer. It is WRONG for the question "is this food usable by anything", and the difference showed up
 * on 2026-08-13 as a lie on the most prominent list on the shop page.
 *
 * He owns a box of Barilla Rotini, a box of spaghetti, and a seed row called `pasta`. All three alias
 * lists claim "penne", "macaroni", "shells". `pasta` wins the race on every generic pasta line, so
 * `rotini` and `spaghetti` are never credited and the page reported them as food nothing is using. Same
 * with his white onions: "1 onion, chopped" resolves to `yellowonion` because that row happens to own
 * the generic phrase, so the white onions read as neglected while 242 dishes would happily take one.
 *
 * The claim "nothing is using this" is about the FOOD. Deriving it from "the matcher did not credit
 * this ROW" is Law 3: reporting an intermediate as an outcome. So ask the real question directly.
 */
export function matchAllItems(name, raw = name) {
  const out = new Set();
  if (!name) return out;
  const rawLc = String(raw).toLowerCase();
  for (const r of candidates(name)) {
    const veto = VETO_LC[r.itemId];
    if (veto && veto.some((v) => v.re.test(rawLc))) continue;
    if (r.whole) {
      if (name === r.phrase) out.add(r.itemId);
      continue;
    }
    const re = new RegExp(`(?:^|\\s)${r.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
    if (re.test(name)) out.add(r.itemId);
  }
  return out;
}

/** availableIds: Set of stock ids usable now (level have/low). */
const SUBS = ALIASES._substitutes || {};

/** A requirement he can meet with a different product he owns. Reported separately from `have`. */
function substituteFor(requirement, availableIds) {
  const s = SUBS[requirement];
  if (!s || !availableIds.has(s.have)) return null;
  return { via: s.have, note: s.note };
}

export function scoreRecipe(ingredientLines, availableIds) {
  const have = [], haveVia = [], missing = [], unknown = [], staples = [], optional = [];
  for (const line of ingredientLines) {
    const name = parseIngredient(line);
    /* Try the full line too. "200g bag frozen, shelled cooked prawn defrosted" reduces to just "bag"
     * once everything after the comma is dropped, which lost the prawns entirely and let a prawn pasta
     * look cookable. Prefer whichever parse actually resolves, and prefer a real answer over silence. */
    /* Four ways to read one line, tried in order of how much they trust the punctuation. Published
     * ingredient lines are prose, and each of these fallbacks exists because a specific real line was
     * being lost:
     *   1. the plain parse
     *   2. keep text after the first comma  ("200g bag frozen, shelled cooked prawn" was just "bag")
     *   3. keep text after "or"            ("vegetable or sunflower oil" was just "vegetable", 40x)
     *   4. split an "and" compound         ("salt and pepper to taste", 48x)
     * First one that resolves wins, and a resolved answer always beats silence. */
    let hit = matchToItem(name, line);
    let shown = name;
    if (hit === null) {
      for (const cand of [
        parseIngredient(line, { keepAfterComma: true }),
        parseIngredient(line, { keepOr: true }),
        parseIngredient(line, { keepAfterComma: true, keepOr: true }),
      ]) {
        const alt = matchToItem(cand, line);
        if (alt !== null) { hit = alt; shown = cand; break; }
      }
    }
    /* Split compounds and alternatives into parts and try each. Needed because staples match the
     * WHOLE name: "vegetable or sunflower oil" can never equal "sunflower oil", so the keepOr parse
     * alone did not rescue those 40 mentions. Splitting does. Same for "salt and pepper", 48. */
    if (hit === null) {
      const parts = parseIngredient(line, { keepAfterComma: true, keepOr: true })
        .split(/ and | or |, /)
        .map((x) => x.trim())
        .filter((x) => x.length > 2);
      for (const part of parts) {
        const alt = matchToItem(part, line);
        if (alt !== null) { hit = alt; shown = part; break; }
      }
    }
    // A garnish the source itself calls optional must never block a dish or count against it.
    if (isOptionalLine(line) && !(hit && !hit.startsWith('__') && availableIds.has(hit))) {
      optional.push({ line, shown, item: hit && !hit.startsWith('__') ? hit : null });
      continue;
    }
    if (hit === '__STAPLE__') { staples.push({ line, shown }); continue; }
    if (hit === null) { unknown.push({ line, shown }); continue; }

    const req = hit.startsWith('__GAP__') ? hit.slice(7) : hit;
    const sub = substituteFor(req, availableIds);
    if (sub) { haveVia.push({ line, shown, item: req, ...sub }); continue; }

    if (hit.startsWith('__GAP__')) { missing.push({ line, shown, item: req, reason: ALIASES._knownGaps[req] }); continue; }
    if (availableIds.has(hit)) have.push({ line, shown, item: hit });
    else missing.push({ line, shown, item: hit });
  }

  /* An unrecognised ingredient must never be silently ignored, because that is what produced a
   * fictional "285 dishes ready" on 2026-08-12 with Singapore Noodles WITH SHRIMP in the list. It is
   * still not counted as MISSING, since we do not know he lacks it. It downgrades confidence instead,
   * and the count is surfaced so the gap can be closed rather than hidden. */
  const verdict = missing.length > 0
    ? `missing-${missing.length}`
    : unknown.length === 0 ? 'ready'
      : unknown.length <= 2 ? 'probably-ready' : 'unclear';

  return {
    have, haveVia, missing, unknown, staples, optional,
    /* Deduped by item id. One dish can reach the same id on several lines, and counting each line
     * inflated "N of M tracked ingredients" on 743 of 2,586 dishes: one reported `seasoning` twice out
     * of a total of four. */
    counted: new Set([...have, ...haveVia, ...missing].map((h) => h.item ?? h.shown)).size,
    verdict,
  };
}

/** Food he owns that NO published ingredient line can ever reach.
 *
 * THE BUG THIS EXISTS TO MAKE VISIBLE, found 2026-08-16. The 08-14 receipt ingest created thirteen new
 * stock ids straight from photos: `potatoes_red`, `tomatoes_canned`, `beansprouts`, `ryebread`, `tuna`,
 * `fettuccine`, `beefconsomme`, `beanmedley`, `chickendrumsticks` and more. Not one of them got an
 * alias row, so the matcher could not see any of them. Worse, four were ALSO still listed in
 * `_knownGaps`, so `/kitchen/find` was actively telling him he had no potatoes while nine sat in the
 * pantry, no tinned tomatoes while a 796 ml tin sat beside them, and no bread while a loaf did.
 *
 * `lint-aliases.mjs` could not catch it. Its checks are about CONFLICTS between rows that exist, and
 * these rows did not exist. And the ingest path cannot be gated at build time either, because stock is
 * events in Neon and a build must not depend on a database being up.
 *
 * So the mechanism is a report on the page instead of a gate in the build: /kitchen/find states the
 * count out loud whenever it is not zero. Anything live in the fold that no alias phrase and no staple
 * can reach is named, unless it is declared in `_notAnIngredient` (currently just the mason jars).
 * A future receipt cannot add itself to that list, which is the whole point.
 *
 * @param items  the folded stock items: `{ id, n, level }`
 * @returns      `[{ id, n }]`, empty when everything is reachable
 */
export function unreachableStock(items) {
  const aliased = new Set(Object.keys(ALIASES.map || {}));
  const skip = new Set((ALIASES._notAnIngredient?.ids) || []);
  return (items || [])
    .filter((it) => it && (it.level === 'have' || it.level === 'low'))
    .filter((it) => !skip.has(it.id) && !aliased.has(it.id))
    // The display name is the fallback probe: `red potatoes` would have resolved even with no alias
    // row of its own. Only something no phrase at all can reach is reported.
    .filter((it) => matchToItem(parseIngredient(it.n ?? it.id), it.n ?? it.id) === null)
    .map((it) => ({ id: it.id, n: it.n ?? it.id }));
}

/* ---------------- JSON-LD extraction ---------------- */

export function extractRecipe(html) {
  const out = [];
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    let d;
    try { d = JSON.parse(m[1]); } catch { continue; }
    const items = Array.isArray(d) ? d : (d['@graph'] || [d]);
    for (const o of items) {
      if (!o || typeof o !== 'object') continue;
      if (!String(o['@type'] || '').includes('Recipe')) continue;
      /* recipeCuisine and recipeCategory were not captured on the first ingest, which is why 2,215 of
       * 2,626 dishes had no cuisine and could not be filtered. They are right there in the markup:
       * BBC Good Food's lasagne carries recipeCuisine "Italian" and recipeCategory "Dinner". He asked
       * to filter out "random Turkish cuisine or Nigerian, whatever", and this is the field that
       * answers it. Missing it cost a second crawl of pages already fetched once. */
      const str = (v) => (Array.isArray(v) ? v[0] : v);
      out.push({
        name: o.name,
        yield: o.recipeYield,
        image: typeof o.image === 'string' ? o.image : (o.image?.url || o.image?.[0]?.url || o.image?.[0]),
        totalTime: o.totalTime,
        cuisine: str(o.recipeCuisine) ? String(str(o.recipeCuisine)).trim() : null,
        category: str(o.recipeCategory) ? String(str(o.recipeCategory)).trim() : null,
        keywords: typeof o.keywords === 'string'
          ? o.keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 12)
          : (Array.isArray(o.keywords) ? o.keywords.map(String).slice(0, 12) : []),
        ingredients: (o.recipeIngredient || []).map((x) => String(x)),
        rating: o.aggregateRating?.ratingValue ?? null,
        ratingCount: o.aggregateRating?.ratingCount ?? o.aggregateRating?.reviewCount ?? null,
      });
    }
  }
  return out[0] || null;
}

/* ---------------- CLI ---------------- */

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntry) {
  const url = process.argv.find((a) => a.startsWith('http'));
  if (!url) {
    console.error('usage: node content/kitchen/match.mjs <recipe-url> [--json]');
    process.exit(2);
  }

  // Live stock. Folded here rather than importing the TS so this stays a zero-build script.
  const envPath = join(HERE, '..', '..', '.env.local');
  const available = new Set();
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf8');
    const dbUrl = env.match(/^KITCHEN_DATABASE_URL=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
    if (dbUrl) {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(dbUrl);
      const rows = await sql`select item_id, ev, qty from stock_event order by at asc`;
      const state = {};
      for (const r of rows) {
        const s = (state[r.item_id] ||= { ev: 'none', qty: null });
        s.ev = r.ev;
        if (r.qty !== null && r.qty !== undefined) s.qty = Number(r.qty);
        if (r.ev === 'out' || r.ev === 'tossed') s.qty = 0;
      }
      const seed = JSON.parse(readFileSync(join(HERE, 'stock', 'items.json'), 'utf8')).items;
      for (const [id, v] of Object.entries(seed)) {
        if (['have', 'low', 'frozen'].includes(v.state)) available.add(id);
      }
      for (const [id, s] of Object.entries(state)) {
        const usable = !['out', 'tossed', 'none'].includes(s.ev) && s.qty !== 0;
        if (usable) available.add(id); else available.delete(id);
      }
    }
  }

  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' },
  });
  const r = extractRecipe(await res.text());
  if (!r) { console.error(`No JSON-LD recipe found at ${url}`); process.exit(1); }

  const score = scoreRecipe(r.ingredients, available);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ url, ...r, score }, null, 2));
  } else {
    console.log(`\n${r.name}`);
    console.log(`${url}`);
    console.log(`serves ${JSON.stringify(r.yield)}${r.rating ? ` · rated ${r.rating} from ${r.ratingCount}` : ''}`);
    console.log(`\nVERDICT: ${score.verdict.toUpperCase()}   (${score.have.length} of ${score.counted} tracked ingredients on hand)\n`);
    if (score.missing.length) {
      console.log('MISSING');
      for (const m of score.missing) console.log(`  x ${m.item.padEnd(18)} <- "${m.line.trim()}"${m.reason ? `\n      ${m.reason}` : ''}`);
    }
    if (score.have.length) {
      console.log('\nHAVE');
      for (const h of score.have) console.log(`  ok ${h.item.padEnd(18)} <- "${h.line.trim()}"`);
    }
    if (score.staples.length) console.log(`\nSTAPLES assumed present: ${score.staples.map((s) => s.shown).join(', ')}`);
    if (score.unknown.length) {
      console.log('\nUNKNOWN, meaning aliases.json has a gap. NOT counted as missing.');
      for (const u of score.unknown) console.log(`  ? "${u.line.trim()}"  parsed as "${u.shown}"`);
    }
    console.log('');
  }
}
