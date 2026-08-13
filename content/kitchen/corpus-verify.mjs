#!/usr/bin/env node
/**
 * Check that every corpus source URL actually leads to a recipe.
 *
 *   node content/kitchen/corpus-verify.mjs
 *
 * Why. He clicked "Pollo en Salsa" and landed on something else entirely. Its source in TheMealDB is
 * `https://www.recipesfromcostarica.com/recipes`, a category index, not a recipe page. TheMealDB's
 * data is wrong there, but the find page presented it as a recipe link, and that is ours: a link
 * offered as a recipe has to be one.
 *
 * The test is not "does the URL respond". It is "does this page carry a JSON-LD Recipe", because that
 * is the same question as "can this ever become a cook card". A 200 from an index page is a false
 * pass, and that is exactly the case that broke.
 *
 * Writes `sourceOk`, `sourceIngredientCount` and `sourceCheckedAt` onto each meal so the find page can
 * stop showing dishes it could never build a card from.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractRecipe } from './match.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, 'corpus', 'themealdb.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const corpus = JSON.parse(readFileSync(FILE, 'utf8'));
const todo = corpus.meals.filter((m) => m.source);
console.log(`${todo.length} of ${corpus.meals.length} meals have a source URL to check`);
console.log(`${corpus.meals.length - todo.length} have none and can never become a cook card\n`);

const CONCURRENCY = 6;
let done = 0, ok = 0, bad = 0;

async function check(m) {
  try {
    const ctl = AbortSignal.timeout(20000);
    const res = await fetch(m.source, { headers: { 'user-agent': UA }, signal: ctl, redirect: 'follow' });
    if (!res.ok) { m.sourceOk = false; m.sourceFail = `http ${res.status}`; return; }
    const r = extractRecipe(await res.text());
    if (!r || !r.ingredients?.length) {
      // Responds fine, but carries no recipe. This is the Pollo en Salsa case: an index page.
      m.sourceOk = false;
      m.sourceFail = r ? 'recipe with no ingredients' : 'no JSON-LD recipe on the page';
      return;
    }
    m.sourceOk = true;
    m.sourceIngredientCount = r.ingredients.length;
    delete m.sourceFail;
  } catch (e) {
    m.sourceOk = false;
    m.sourceFail = String(e?.name === 'TimeoutError' ? 'timeout' : e?.message || e).slice(0, 80);
  } finally {
    m.sourceCheckedAt = corpus.sourceCheckedAt ?? null;
    done++;
    if (m.sourceOk) ok++; else bad++;
    if (done % 50 === 0) process.stdout.write(`  checked ${done}/${todo.length}  (${ok} ok, ${bad} bad)\n`);
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const m = queue.shift();
    if (m) await check(m);
    await new Promise((r) => setTimeout(r, 60));   // politeness, spread across 6 workers
  }
}));

const stamp = new Date().toISOString().slice(0, 10);
for (const m of corpus.meals) if (m.source) m.sourceCheckedAt = stamp;
corpus.sourceCheckedAt = stamp;
corpus.sourceOkCount = corpus.meals.filter((m) => m.sourceOk).length;
writeFileSync(FILE, JSON.stringify(corpus, null, 1) + '\n');

console.log(`\n${ok} sources carry a real recipe. ${bad} do not.`);
console.log(`${corpus.sourceOkCount} of ${corpus.meals.length} meals can become a cook card.`);

const reasons = {};
for (const m of corpus.meals) if (m.sourceFail) reasons[m.sourceFail] = (reasons[m.sourceFail] || 0) + 1;
console.log('\nwhy they failed:');
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
