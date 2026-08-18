#!/usr/bin/env node
/* Capture ONE published recipe, verbatim, as evidence a card can be built from and checked against.
 *
 * WHY THIS EXISTS, 2026-08-17. Silvio, on why every session ended at the same three dishes:
 *
 *   "Is Budget Bites going to be a good place to find actual recipes, or is it just going to be simple
 *   recipes? ... I'm not looking for simple recipes. I'm looking for normal recipes from what I have,
 *   which is the budget part. ... if it's the source then I'll personally go and open a website and
 *   copy paste all the information. I don't care. It's just that for some reason we are always circling
 *   back to main recipes, the one that we did before."
 *
 * He was right and the ceiling was structural. The corpus is four sites because four sites permit
 * crawling, and the good ones say no by name: Serious Eats, Simply Recipes, Allrecipes, Epicurious and
 * Food.com all list `ClaudeBot`, `anthropic-ai` or `Claude-User` under `Disallow: /`. That is not
 * negotiable and it is not worked around here. What it never covered is HIM opening a page and handing
 * it over, which is a person using an agent as a browser. `--paste` is that path, and it is the reason
 * this file takes text at all rather than only a URL.
 *
 * THE SECOND REASON, and it is the one that makes this a mechanism rather than a convenience.
 *
 * `schema/SOURCING.md` requires that a card follow ONE published recipe verbatim, and `validate.mjs`
 * enforces it by comparing each step's `text` against its `sourceText`. Both of those fields are typed
 * by the same agent. That check confirms an agent agrees with itself. Every one of the five defects
 * that reached the stove on 2026-08-11 would have passed it, because an agent that paraphrases a
 * sentence paraphrases it into both fields.
 *
 * A capture written here is FETCHED, stamped and hashed. `validate.mjs` then asserts that every
 * `sourceText` on a sourced card appears in the capture. "Did you invent this" stops being a promise
 * and becomes a diff against the publisher.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not write a cook card. It captures the publisher's own
 * words and stops. Mapping those into the schema is judgement work (which of his pans she means, what
 * a technique word means, an observable for the induction hob, the protein arithmetic) and that is
 * exactly the layer `SOURCING.md` says an agent may add. Captures live in `imported/`, never in
 * `recipes/`, so an unfinished one can never be offered and can never break `pnpm build`.
 *
 * USAGE
 *   node content/kitchen/import.mjs https://example.com/recipe --id mydish
 *   node content/kitchen/import.mjs --paste saved-page.html --id mydish --url https://...
 *   pbpaste | node content/kitchen/import.mjs --paste - --id mydish --url https://...
 *   node content/kitchen/import.mjs --list
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRecipe, matchToItem, parseIngredient, isOptionalLine, splitPaste } from './match.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAPTURE_DIR = join(HERE, 'imported');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** Stable over the words that matter, so an edit to either list invalidates every card built on it. */
export function captureHash(c) {
  const h = createHash('sha256');
  h.update(JSON.stringify({ i: c.ingredients, s: c.instructions }));
  return h.digest('hex').slice(0, 12);
}

export function loadCaptures(dir = CAPTURE_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

/* ---------------- pasted plain text ----------------
 *
 * PARTITION OR REFUSE. NEVER GUESS.
 *
 * The partitioning itself lives in `match.mjs` as `splitPaste`, shared with the web paste box, so the
 * two cannot drift. What belongs HERE is the strictness: a capture with no method cannot back a cook
 * card, so a missing heading is fatal on this path and merely lenient on the other one. `splitPaste`
 * reports what it found and this decides what that means.
 *
 * The refusal is the feature. Inferring which pasted lines are method is how a step goes missing, and
 * a missing step is the exact defect class `schema/SOURCING.md` was written about: not a wrong number,
 * a gap between the numbers. A refusal he can act on beats a capture that looks complete and is not.
 */

export function parsePastedText(raw) {
  const p = splitPaste(raw);
  if (!p.foundIngredientsHeading || !p.foundMethodHeading) {
    const missing = [
      !p.foundIngredientsHeading && 'an "Ingredients" heading',
      !p.foundMethodHeading && 'a "Method" / "Instructions" / "Directions" heading',
    ].filter(Boolean);
    throw new Error(
      [
        `Could not find ${missing.join(' or ')} in what was pasted.`,
        '',
        'This refuses rather than guessing which lines are which, because a step quietly dropped is',
        'the exact failure this importer exists to prevent. Paste the whole recipe section including',
        'its headings, or add the two heading lines by hand:',
        '',
        '  Ingredients',
        '  ...',
        '  Method',
        '  1. ...',
      ].join('\n'),
    );
  }
  if (!p.ingredients.length) throw new Error('Found an Ingredients heading with nothing under it.');
  if (!p.instructions.length) throw new Error('Found a Method heading with nothing under it.');
  return { name: p.name, ingredients: p.ingredients, instructions: p.instructions };
}

/* ---------------- capture assembly ---------------- */

/* A GAP AND AN UNKNOWN ARE NOT THE SAME REPORT, and collapsing them is the bug this function had in
 * its first draft. `__GAP__fresh chilli` means the kitchen's vocabulary knows the ingredient and knows
 * he lacks it, which is a shopping line. `null` means no phrase in `aliases.json` reaches this line at
 * all, which is a hole in OUR vocabulary and gets fixed in the alias table, not in a shop. Printing
 * both as "unrecognised" hands him a shopping list with our bugs mixed into it. */
function stockView(ingredients) {
  return ingredients.map((line) => {
    const hit = matchToItem(parseIngredient(line), line);
    const isMarker = typeof hit === 'string' && hit.startsWith('__');
    return {
      line,
      item: hit && !isMarker ? hit : null,
      staple: hit === '__STAPLE__',
      gap: isMarker && hit.startsWith('__GAP__') ? hit.slice('__GAP__'.length) : null,
      optional: isOptionalLine(line),
    };
  });
}

export function buildCapture({ id, via, url, provider, r, fetchedAt }) {
  const c = {
    id,
    fetchedAt,
    via,
    source: { name: r.name ?? null, url: url ?? null, provider: provider ?? null },
    /* Every field below is the publisher's, copied and not interpreted. `yield`, the times and the
     * nutrition panel are here because a card may quote them and may not compute them: her protein
     * figure is the only number on a card that is not an estimate. */
    yield: r.yield ?? null,
    totalTime: r.totalTime ?? null,
    prepTime: r.prepTime ?? null,
    cookTime: r.cookTime ?? null,
    nutrition: r.nutrition ?? null,
    rating: r.rating ?? null,
    ratingCount: r.ratingCount ?? null,
    image: r.image ?? null,
    cuisine: r.cuisine ?? null,
    category: r.category ?? null,
    ingredients: r.ingredients,
    instructions: r.instructions,
    /* NOT evidence, and labelled so. A convenience read of the kitchen at capture time, which goes
     * stale the moment he shops. Anything deciding whether a dish is cookable reads the live fold. */
    _stockAtCapture: stockView(r.ingredients),
  };
  c.captureHash = captureHash(c);
  return c;
}

/* ---------------- CLI ---------------- */

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/').replace(/^([a-z]):/i, (m, d) => `${d.toUpperCase()}:`);

if (isEntry || process.argv[1]?.endsWith('import.mjs')) {
  const argv = process.argv.slice(2);
  const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? ''; };
  const has = (n) => argv.includes(n);

  if (has('--list')) {
    const caps = loadCaptures();
    if (!caps.length) { console.log('No captures yet.'); process.exit(0); }
    console.log(`${caps.length} captured recipe(s):\n`);
    for (const c of caps.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      console.log(`  ${String(c.id).padEnd(22)} ${String(c.source?.provider ?? '?').padEnd(22)} ${c.ingredients.length} ing, ${c.instructions.length} steps   ${c.fetchedAt}`);
      console.log(`  ${' '.repeat(22)} ${c.source?.name ?? ''}`);
    }
    process.exit(0);
  }

  const id = flag('--id');
  const pasteArg = flag('--paste');
  const url = flag('--url') ?? argv.find((a) => a.startsWith('http')) ?? null;

  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    console.error('usage: node content/kitchen/import.mjs <url> --id <id>');
    console.error('       node content/kitchen/import.mjs --paste <file|-> --id <id> [--url <url>]');
    console.error('       node content/kitchen/import.mjs --list');
    console.error('\n--id is required and must be lowercase letters, digits and hyphens.');
    process.exit(2);
  }

  let r = null;
  let via = null;

  if (pasteArg !== null) {
    via = 'paste';
    const raw = pasteArg === '-' ? readFileSync(0, 'utf8') : readFileSync(pasteArg, 'utf8');
    if (/<script[^>]*application\/ld\+json/i.test(raw)) {
      // A saved page. Same path as a fetch, so a site that refuses our request still works if he saves it.
      r = extractRecipe(raw);
      if (!r) { console.error('That file carries no machine-readable recipe. Paste the text of the recipe instead.'); process.exit(1); }
      console.log('Read the saved page\'s own recipe markup.');
    } else {
      try {
        const p = parsePastedText(raw);
        r = { ...p, yield: null, totalTime: null, prepTime: null, cookTime: null, nutrition: null, image: null, cuisine: null, category: null, rating: null, ratingCount: null };
        console.log('Partitioned the pasted text on its own headings. Read the capture and check the split.');
      } catch (e) { console.error(e.message); process.exit(1); }
    }
  } else if (url) {
    via = 'url';
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.error(`That page answered ${res.status}.`);
      console.error('If it opens fine in your browser, copy the recipe and run this again with --paste.');
      process.exit(1);
    }
    r = extractRecipe(await res.text());
    if (!r) {
      console.error('That page loaded but carries no machine-readable recipe.');
      console.error('Copy the recipe from the page and run this again with --paste.');
      process.exit(1);
    }
  } else {
    console.error('Give a URL, or --paste with a file or - for standard input.');
    process.exit(2);
  }

  if (!r.ingredients?.length) { console.error('No ingredients found. Nothing worth capturing.'); process.exit(1); }
  if (!r.instructions?.length) {
    console.error('No METHOD found, only ingredients.');
    console.error('A capture with no instructions cannot back a cook card, which is the whole point of one.');
    console.error('Copy the method from the page and run again with --paste.');
    process.exit(1);
  }

  const provider = url ? new URL(url).hostname.replace(/^www\./, '') : null;
  // Passed in rather than read from the clock, so the same input always produces the same file.
  const fetchedAt = (flag('--date') || new Date().toISOString().slice(0, 10));
  const cap = buildCapture({ id, via, url, provider, r, fetchedAt });

  mkdirSync(CAPTURE_DIR, { recursive: true });
  const path = join(CAPTURE_DIR, `${id}.json`);
  if (existsSync(path) && !has('--force')) {
    const old = JSON.parse(readFileSync(path, 'utf8'));
    if (old.captureHash === cap.captureHash) {
      console.log(`\nAlready captured and unchanged: ${path}`);
      process.exit(0);
    }
    console.error(`\n${path} exists and the source has CHANGED since it was captured.`);
    console.error(`  was ${old.captureHash} (${old.fetchedAt}), now ${cap.captureHash}`);
    console.error('Any card built on the old capture is now quoting a page that no longer says that.');
    console.error('Re-run with --force once you have decided what to do about the cards using it.');
    process.exit(1);
  }
  writeFileSync(path, `${JSON.stringify(cap, null, 2)}\n`);

  const known = cap._stockAtCapture.filter((x) => x.item).length;
  const staples = cap._stockAtCapture.filter((x) => x.staple).length;
  const gaps = cap._stockAtCapture.filter((x) => x.gap);
  const unknown = cap._stockAtCapture.filter((x) => !x.item && !x.staple && !x.gap);
  console.log(`\n${cap.source.name ?? id}`);
  console.log(`  ${cap.source.url ?? '(pasted, no url)'}`);
  console.log(`  ${cap.ingredients.length} ingredients, ${cap.instructions.length} steps, hash ${cap.captureHash}`);
  if (cap.nutrition?.proteinContent) console.log(`  protein, her figure: ${cap.nutrition.proteinContent} per ${cap.yield ?? '?'} serving(s)`);
  else console.log('  NO nutrition panel on the page, so any protein figure on the card will be an estimate and has to say so.');
  console.log(`  ingredient lines resolving to stock: ${known}, staples: ${staples}, known gaps: ${gaps.length}, unrecognised: ${unknown.length}`);
  for (const g of gaps) console.log(`     shop  ${g.line}   (${g.gap})`);
  // These are ours to fix, in stock/aliases.json, and they are why a dish can read "unsure" forever.
  for (const u of unknown) console.log(`     ???   ${u.line}`);
  console.log(`\nwritten: ${path}`);
  console.log('\nNext: build the card in content/kitchen/recipes/, quoting these instructions as sourceText.');
  console.log('validate.mjs will check every sourceText against this file, so paraphrasing one now fails the build.');
}
