#!/usr/bin/env node
/* Every alias phrase must resolve to the row that declares it.
 *
 * THIS FILE EXISTS BECAUSE PROSE DID NOT WORK. `.agents/ENGINEERING.md` Law 1 says eliminate the class
 * rather than validate instances, and its meta-law says a rule that does not execute is decoration. The
 * ginger self-veto was found, fixed, and written up in a comment in `match.mjs` on 2026-08-12. On
 * 2026-08-13 an agent told to find where the matcher lies found the SAME CLASS live on two more rows,
 * and the comment had been sitting directly above the code the whole time.
 *
 * Two failures, both of which mean an alias phrase does not do what its author believed:
 *
 *   SELF-VETO. A row lists a phrase and also vetoes a word inside it, so the phrase can never match.
 *     `map.beef`     = ["cooked ground beef", "browned ground beef", "cooked beef mince"]
 *     `_vetoes.beef` = [..., "raw", "mince", "ground"]
 *   Every alias on that row contained a word that killed it. Reach over 2,586 dishes: zero. The bag of
 *   browned beef in his freezer was unmatchable by anything, forever.
 *
 *   SHADOWING. Two rows claim the same phrase. matchToItem returns the first hit, so the loser is never
 *   credited and every surface that asks "is anything using this" answers no. `map.pasta` claimed
 *   "rotini", so the live shop page printed "Barilla Rotini, 410 g" under "Already here, and nothing is
 *   using it" while 570 dishes matched that box of pasta.
 *
 * And one asymmetric check on gaps. A gap phrase that resolves to a stock ITEM means the same food is
 * modelled twice, once as something he lacks and once as something he owns, and the item wins. That
 * direction produces a false "you have this", which silently makes a wrong dish. The reverse only costs
 * a shop, so gap-resolves-to-another-gap is a warning: the dish is still correctly reported missing, the
 * REASON he reads is just about the wrong ingredient.
 *
 * Run standalone, or via `pnpm validate:kitchen`. Exits 1 on any failure, which is what makes it a
 * mechanism instead of a document.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchToItem, parseIngredient, isOptionalLine, splitPaste } from './match.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const A = JSON.parse(readFileSync(join(HERE, 'stock', 'aliases.json'), 'utf8'));

const fails = [];
const warns = [];
const STAPLES = new Set(A.staples || []);

/* ---- 1. every item phrase must resolve to its own item ---- */
for (const [id, phrases] of Object.entries(A.map)) {
  if (!Array.isArray(phrases)) continue;
  for (const p of phrases) {
    const got = matchToItem(parseIngredient(p), p);
    if (got === id) continue;
    if (got === null) {
      fails.push([
        'self-veto',
        `map.${id} declares "${p}" and nothing matches it`,
        `A word inside "${p}" is in _vetoes.${id}, so this row vetoes its own alias. Either drop that veto word or drop this phrase.`,
      ]);
    } else {
      fails.push([
        'shadowed',
        `map.${id} declares "${p}" but it resolves to ${got}`,
        `Two rows claim this phrase and ${got} wins, so ${id} can never be credited for it. Make the phrase exclusive to whichever row IS that thing.`,
      ]);
    }
  }
}

/* ---- 2. a gap phrase must never resolve to a stock item ---- */
for (const [gap, phrases] of Object.entries(A._gapAliases || {})) {
  if (!Array.isArray(phrases)) continue;
  for (const p of phrases) {
    const got = matchToItem(parseIngredient(p), p);
    const want = `__GAP__${gap}`;
    if (got === want) continue;
    if (got && !got.startsWith('__')) {
      fails.push([
        'gap-is-also-an-item',
        `_gapAliases["${gap}"] declares "${p}" but it resolves to the stock item ${got}`,
        `The same food is modelled as both a gap and a stock row, and the row wins, so a recipe asking for "${p}" is told he has it. Delete whichever of the two is wrong.`,
      ]);
    } else if (got === '__STAPLE__') {
      warns.push([
        'gap-vs-staple',
        `_gapAliases["${gap}"] declares "${p}" but the staples list claims it`,
        `The staples list overrides the gap, so this reads as always-present. That contradiction propped up 35 false "ready" dishes when it was oregano.`,
      ]);
    } else if (got === null) {
      warns.push([
        'gap-unreachable',
        `_gapAliases["${gap}"] declares "${p}" and nothing matches it`,
        `A recipe naming "${p}" comes back UNKNOWN rather than missing-with-a-reason. Usually a veto on another row.`,
      ]);
    } else {
      warns.push([
        'gap-crosstalk',
        `_gapAliases["${gap}"] declares "${p}" but it resolves to ${got}`,
        `Still correctly reported as missing, so nothing is claimed falsely, but the REASON he reads will describe ${got.slice(7)} instead of ${gap}.`,
      ]);
    }
  }
}

/* ---- 3. a staple must not also be a stock item, for the same reason ---- */
for (const s of STAPLES) {
  const got = matchToItem(parseIngredient(s), s);
  if (got !== '__STAPLE__' && got && !got.startsWith('__')) {
    warns.push([
      'staple-vs-item',
      `staples has "${s}" but it resolves to the stock item ${got}`,
      'Harmless today because both mean he has it, but it makes the item look unused on the shop page.',
    ]);
  }
}

/* ---- 4. `isOptionalLine` must agree with what the published line actually says ---- *
 *
 * Added 2026-08-17. That function decides whether a recipe line can be ignored, so a wrong `true` is a
 * dish reported cookable with an ingredient missing and NO gap named anywhere on the screen. It went
 * wrong on "1 red chilli deseeded and finely chopped, plus extra to serve (optional)", where the marker
 * belongs to the extra and the chilli is required: Tuna, caper & chilli spaghetti read "you can make
 * this now" in a kitchen with no fresh chilli.
 *
 * Both directions are pinned here, and the wrong-direction ones (`false` where the source did mark it
 * optional) matter too: that is the app arguing with a source about its own garnish, which is what the
 * 2026-08-12 gyudon fix was for. The reasoning lives in `match.mjs`; this table is what makes it hold.
 */
const OPTIONAL_CASES = [
  // The marker sits in a "plus extra" tail, so the quantified ingredient itself is required.
  ['1 red chilli deseeded and finely chopped, plus extra to serve (optional)', false],
  ['½ tsp chilli flakes plus extra to serve (optional)', false],
  ['50g parmesan grated, plus extra to serve (optional)', false],
  ['2 tsp  garam masala plus a little extra to serve (optional)', false],
  ['4 tbsp Greek yogurt plus more for the top if you like', false],
  // No amount anywhere on the line, so the whole line is a topping suggestion.
  ['jar of pesto canned tuna, shredded ham, shredded cooked chicken and more grated Parmesan, to serve (optional)', true],
  // The marker sits on the ingredient, wherever else the line goes afterwards.
  ['Japanese red pickled ginger (benishoga) (optional), to serve', true],
  ['1 tbsp pesto (optional), plus extra to serve', true],
  ['⅛ tsp cayenne pepper, optional', true],
  ['1 tsp vanilla extract (optional)', true],
  // "to serve" with no amount is a serving suggestion; with an amount it is the dish.
  ['green vegetables to serve', true],
  ['crusty bread to serve', true],
  ['4 cups short-grain white rice, to serve', false],
];
for (const [line, want] of OPTIONAL_CASES) {
  const got = isOptionalLine(line);
  if (got === want) continue;
  fails.push([
    'optional-verdict',
    `isOptionalLine returned ${got} for "${line}"`,
    want === false
      ? 'The source asks for this ingredient, so a true here makes a dish read as cookable with nothing named as short. Fix `isOptionalLine`, not this table.'
      : 'The source itself calls this optional, so a false here blocks a dish over a garnish. Fix `isOptionalLine`, not this table.',
  ]);
}

/* ---- 5. `splitPaste` must partition, never infer ----
 *
 * Added 2026-08-17 with the paste path. This is the function that turns text he copied off a page
 * into ingredients and a method, and it has two callers with different strictness: `import.mjs`
 * refuses a paste with no method heading, the web paste box does not. Both read the same partition,
 * so a change here moves both at once, which is the point of it being one function and the reason it
 * needs a gate.
 *
 * The load-bearing case is the last one. Given text with no headings it must return NO instructions
 * and say so, rather than deciding that some of those lines look like steps. Every failure this
 * kitchen has had at the stove came from a gap between the numbers rather than a wrong number, and a
 * step inferred out of a blog paragraph is that gap with extra confidence on top.
 */
const PASTE_CASES = [
  {
    what: 'headings, bullets, step numbers and a trailing notes block',
    text: 'Skillet Thighs\nPrep time: 10 minutes\nServes 4\n\nIngredients\n- 8 chicken thighs\n* 1 tbsp olive oil\n1 lemon, halved\n\nMethod\n1. Pat the thighs dry.\nStep 2. Sear 12 minutes.\n\nNotes\nKeeps 3 days.',
    name: 'Skillet Thighs',
    ingredients: ['8 chicken thighs', '1 tbsp olive oil', '1 lemon, halved'],
    instructions: ['Pat the thighs dry.', 'Sear 12 minutes.'],
  },
  {
    what: 'no headings at all',
    text: 'my grandmother used to make this\n8 chicken thighs\n2 tsp salt\nCook them until done.',
    name: null,
    // Every line is offered as a candidate ingredient and NOTHING is called a step.
    ingredients: ['my grandmother used to make this', '8 chicken thighs', '2 tsp salt', 'Cook them until done.'],
    instructions: [],
  },
];
for (const c of PASTE_CASES) {
  const got = splitPaste(c.text);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!eq(got.ingredients, c.ingredients)) {
    fails.push(['paste-split', `splitPaste ingredients wrong for ${c.what}`,
      `expected ${JSON.stringify(c.ingredients)}, got ${JSON.stringify(got.ingredients)}`]);
  }
  if (!eq(got.instructions, c.instructions)) {
    fails.push(['paste-split', `splitPaste instructions wrong for ${c.what}`,
      `expected ${JSON.stringify(c.instructions)}, got ${JSON.stringify(got.instructions)}. `
      + 'Inferring a step nobody labelled is how a step goes missing, and a missing step is the defect '
      + 'class schema/SOURCING.md exists for.']);
  }
  if (got.name !== c.name) {
    fails.push(['paste-split', `splitPaste name wrong for ${c.what}`,
      `expected ${JSON.stringify(c.name)}, got ${JSON.stringify(got.name)}`]);
  }
}

for (const [rule, msg, hint] of warns) {
  console.log(`!  [${rule}] ${msg}`);
  console.log(`      -> ${hint}`);
}
for (const [rule, msg, hint] of fails) {
  console.log(`x  [${rule}] ${msg}`);
  console.log(`      -> ${hint}`);
}

const phrases = Object.values(A.map).flat().length
  + Object.values(A._gapAliases || {}).filter(Array.isArray).flat().length
  + STAPLES.size;
console.log(`${'-'.repeat(70)}`);
console.log(`${phrases} alias phrases checked, ${fails.length} failures, ${warns.length} warnings`);
process.exit(fails.length ? 1 : 0);
