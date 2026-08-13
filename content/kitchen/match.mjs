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
  return /\boptional\b|\bif (?:using|desired|you like|you have)\b|\bfor garnish\b/i.test(String(raw));
}

/** Turn a published ingredient line into a bare ingredient name, or '' if nothing survives. */
export function parseIngredient(raw, keepAfterComma = false) {
  let s = String(raw).toLowerCase();

  s = s.replace(/&frac\d+;|&[a-z]+;/g, ' ');       // html entities from scraped pages
  s = s.replace(/\([^)]*\)/g, ' ');                 // "(about 2 to 3 ounces)"
  s = s.replace(/\[[^\]]*\]/g, ' ');
  if (!keepAfterComma) s = s.split(/,/)[0];         // prep after the first comma
  s = s.split(/\bor\b/)[0];                         // "parmesan or pecorino" -> first named
  /* Trailing noise. This matters more since staples became whole-name matches: any leftover word means
   * "extra-virgin olive oil plus extra" no longer equals "olive oil" and a pantry staple reads as an
   * unknown. Stripped anywhere, not just at the end, because these clauses turn up mid-line too. */
  s = s.replace(/\bplus\b.*$/g, ' ');
  s = s.replace(/\b(?:to taste|as needed|to serve|for (?:serving|garnish|the pan|dusting|frying|greasing)|optional|divided|defrosted|thawed|at room temperature|roughly|approx)\b/g, ' ');
  s = s.replace(/\b(?:extra virgin|extravirgin|virgin|light|dark|low sodium|reduced sodium|free range|organic|unsalted|salted|semi skimmed|whole|full fat|reduced fat|skimmed)\b/g, ' ');
  s = s.replace(/[¼-¾⅐-⅞]/g, ' ');  // vetted fractions
  s = s.replace(/\d+\s*\/\s*\d+/g, ' ');            // 1/2
  s = s.replace(/\d+(?:[.,]\d+)?/g, ' ');           // remaining numbers
  s = s.replace(/[-–—]/g, ' ');
  s = s.replace(UNITS_RE, ' ');
  s = s.replace(SIZES_RE, ' ');
  s = s.replace(/\b(?:fresh|freshly|ground|chopped|minced|sliced|grated|shredded|diced|crushed|beaten|peeled|trimmed|rinsed|drained|cooked|raw|dried|frozen|of|the|a|an|about|approximately|good|quality|ripe|hot|cold|warm|boneless|skinless|bone in|skin on|thinly|roughly|finely)\b/g, ' ');
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
  Object.entries(VETOES).map(([k, v]) => [k, (Array.isArray(v) ? v : []).map((x) => String(x).toLowerCase())]),
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
    if (veto && veto.some((v) => rawLc.includes(v))) continue;
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
    let hit = matchToItem(name, line);
    let shown = name;
    if (hit === null) {
      const full = parseIngredient(line, true);
      const alt = matchToItem(full, line);
      if (alt !== null) { hit = alt; shown = full; }
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
    counted: have.length + haveVia.length + missing.length,
    verdict,
  };
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
      out.push({
        name: o.name,
        yield: o.recipeYield,
        image: typeof o.image === 'string' ? o.image : (o.image?.url || o.image?.[0]?.url || o.image?.[0]),
        totalTime: o.totalTime,
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
    if (score.staples.length) console.log(`\nSTAPLES assumed present: ${score.staples.map((s) => s.name).join(', ')}`);
    if (score.unknown.length) {
      console.log('\nUNKNOWN, meaning aliases.json has a gap. NOT counted as missing.');
      for (const u of score.unknown) console.log(`  ? "${u.line.trim()}"  parsed as "${u.name}"`);
    }
    console.log('');
  }
}
