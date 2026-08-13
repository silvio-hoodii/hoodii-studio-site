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
import { matchToItem, parseIngredient } from './match.mjs';

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
