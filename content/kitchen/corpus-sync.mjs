#!/usr/bin/env node
/**
 * Pull TheMealDB into a local corpus so the kitchen has something to BROWSE.
 *
 *   node content/kitchen/corpus-sync.mjs            # savoury only, the default
 *   node content/kitchen/corpus-sync.mjs --all      # include the 167 desserts
 *
 * Why a corpus at all. Until now `match.mjs` could score one URL that somebody handed it, which
 * means an agent had to be in the loop for every single dish. Silvio, 2026-08-12, describing what he
 * actually wants: five options, a picture and a name, tagged by how close he is to making it, and he
 * picks. That needs a list. This makes the list.
 *
 * Why TheMealDB and not Spoonacular. No key, no signup, no daily cap, and 792 meals reachable on the
 * public test key. Spoonacular has 365k but wants an account and rate-limits the free tier. And the
 * decisive feature is not the count: TheMealDB gives ingredients ALREADY ATOMISED into
 * strIngredient1..20 with matching strMeasure fields, so the hardest part of matching, parsing
 * "1 small onion (about 2 to 3 ounces), sliced thinly", does not need doing at all.
 *
 * WHAT IS DELIBERATELY NOT STORED: the instructions. Two reasons and they agree.
 *   1. We never cook from these. Every entry carries `source`, the original published URL, and that
 *      is where a real recipe card comes from. TheMealDB's instructions are condensed retellings.
 *   2. An ingredient list is a list of facts. Instruction prose is the creative, copyrightable part.
 *      Caching 792 of those locally is a thing we do not need to do, so we do not do it.
 *
 * So this corpus answers "what could I make", never "how do I make it". The second question is
 * answered by fetching the source and following it verbatim, which is the whole SOURCING.md model.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'corpus');
const API = 'https://www.themealdb.com/api/json/v1/1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'hoodii-kitchen/1.0 (personal use)' } });
      if (!res.ok) throw new Error(`http ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(400 * (i + 1));
    }
  }
}

/** strIngredient1..20 + strMeasure1..20 -> [{name, measure}] */
function ingredientsOf(m) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] || '').trim();
    if (!name) continue;
    out.push({ name, measure: (m[`strMeasure${i}`] || '').trim() });
  }
  return out;
}

const wantAll = process.argv.includes('--all');

const cats = (await getJSON(`${API}/list.php?c=list`)).meals.map((c) => c.strCategory);
// Desserts are 167 of the 792 and he has never once asked for one. Off by default rather than
// filtered later, so the corpus stays about dinner.
const use = wantAll ? cats : cats.filter((c) => c !== 'Dessert');
console.log(`categories: ${use.length}${wantAll ? '' : ' (Dessert excluded, pass --all to include)'}`);

const ids = new Map();
for (const c of use) {
  const d = await getJSON(`${API}/filter.php?c=${encodeURIComponent(c)}`);
  for (const m of d.meals || []) if (!ids.has(m.idMeal)) ids.set(m.idMeal, c);
  process.stdout.write(`  ${c}: ${(d.meals || []).length}\n`);
  await sleep(120);
}
console.log(`\n${ids.size} unique meals to fetch`);

const meals = [];
let n = 0, failed = 0;
for (const [id, cat] of ids) {
  try {
    const d = await getJSON(`${API}/lookup.php?i=${id}`);
    const m = (d.meals || [])[0];
    if (!m) { failed++; continue; }
    meals.push({
      id: m.idMeal,
      name: m.strMeal,
      category: m.strCategory || cat,
      area: m.strArea || null,
      image: m.strMealThumb || null,
      source: m.strSource || null,
      youtube: m.strYoutube || null,
      tags: (m.strTags || '').split(',').map((t) => t.trim()).filter(Boolean),
      ingredients: ingredientsOf(m),
    });
  } catch {
    failed++;
  }
  if (++n % 50 === 0) process.stdout.write(`  fetched ${n}/${ids.size}\n`);
  await sleep(90);   // deliberate politeness. This is somebody's free API.
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  _: 'Discovery corpus. Ingredient lists and photos for browsing, NOT instructions: every entry '
     + 'carries `source`, the original published recipe, and that is what a cook card is built from. '
     + 'Regenerate with: node content/kitchen/corpus-sync.mjs',
  provider: 'TheMealDB',
  providerUrl: 'https://www.themealdb.com/api.php',
  fetchedCount: meals.length,
  withSource: meals.filter((m) => m.source).length,
  meals: meals.sort((a, b) => a.name.localeCompare(b.name)),
};
writeFileSync(join(OUT_DIR, 'themealdb.json'), JSON.stringify(payload, null, 1) + '\n');

console.log(`\nwrote ${meals.length} meals (${failed} failed)`);
console.log(`${payload.withSource} of them carry an original source URL, which is what a real recipe card needs`);
