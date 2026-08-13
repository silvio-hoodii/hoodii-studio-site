#!/usr/bin/env node
/**
 * Build a corpus straight from a real recipe site, via its own published sitemap.
 *
 *   node content/kitchen/corpus-ingest.mjs bbcgoodfood --limit 2000
 *   node content/kitchen/corpus-ingest.mjs bbcgoodfood --limit 50 --match bolognese,stroganoff
 *
 * Why this replaces leaning on TheMealDB. Silvio, 2026-08-13: "why are we trusting this purpose that
 * apparently has the randomest recipes in the world when we could have gone straight to BBC Good Food
 * and whatever other prestigious sites... why is there no pasta here?" He was right. TheMealDB is
 * community-contributed, so its shape follows whoever felt like submitting: 167 desserts, 100
 * vegetarian, and TWELVE pasta dishes. Its one bolognese was missing two ingredients and had no
 * source URL at all. BBC Good Food's sitemap alone lists 18,194 recipes, 36 of them bolognese and 21
 * stroganoff, and its 228 entries in the old corpus verified 228 for 228.
 *
 * THE PERMISSION RULE, and it is not negotiable. A site goes in ALLOWED below only after its
 * robots.txt was read and found not to exclude AI crawlers. Checked 2026-08-13:
 *
 *   permitted   bbcgoodfood.com, leitesculinaria.com, budgetbytes.com, taste.com.au,
 *               deliciousmagazine.co.uk, greatbritishchefs.com
 *   REFUSED     maangchi.com and thewoksoflife.com (User-agent: anthropic-ai / Claude-Web
 *               Disallow: /), justonecookbook.com (ClaudeBot Disallow, ai-train=no),
 *               recipetineats.com, olivemagazine.com, jamieoliver.com, food.com (block AI crawlers)
 *
 * He asked whether driving a real browser over CDP would settle it, since it is the same as him
 * browsing. It is not. robots.txt is not a lock being picked, it is the site saying no in the one
 * place crawlers are meant to look, and routing around it with a real browser does not make it
 * consented, only undetectable. Fetching ONE page he explicitly asks for, to build one card, is him
 * using an agent as a browser and stays fine. Harvesting a catalogue is crawling. The argument for
 * crossing that line is weak anyway: 18,194 permitted recipes is more than he will cook in a life.
 *
 * INSTRUCTIONS ARE NOT STORED, same as the TheMealDB corpus. Ingredient lists are facts and the
 * corpus needs them to match; instruction prose is the creative, copyrightable part and we never cook
 * from a cached copy. Every entry keeps its source URL, which is the only thing a card is built from.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractRecipe } from './match.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'corpus');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const ALLOWED = {
  bbcgoodfood: {
    host: 'www.bbcgoodfood.com',
    sitemap: 'https://www.bbcgoodfood.com/sitemap.xml',
    childMatch: '-recipe.xml',
    robotsCheckedAt: '2026-08-13',
    robotsNote: 'User-agent: * disallows only /wp-admin/ and account paths. No AI-crawler exclusions. Sitemaps published in robots.txt.',
    units: 'metric',
  },
  budgetbytes: {
    host: 'www.budgetbytes.com',
    sitemap: 'https://www.budgetbytes.com/sitemap_index.xml',
    childMatch: 'post-sitemap',
    robotsCheckedAt: '2026-08-13',
    robotsNote: 'User-agent: * disallows only /wp-admin/. No AI-crawler exclusions.',
    units: 'us',
  },
  leitesculinaria: {
    host: 'leitesculinaria.com',
    sitemap: 'https://leitesculinaria.com/sitemap_index.xml',
    childMatch: 'post-sitemap',
    robotsCheckedAt: '2026-08-13',
    robotsNote: 'User-agent: * disallows only /cdn-cgi/ and /wp-admin/. No AI-crawler exclusions.',
    units: 'us',
  },
  tasteofhome: {
    host: 'www.tasteofhome.com',
    sitemap: 'https://www.tasteofhome.com/sitemap_index.xml',
    childMatch: 'recipe',
    robotsCheckedAt: '2026-08-13',
    robotsNote: 'No AI-crawler exclusions. Verified extraction against their Beef Stroganoff page.',
    units: 'us',
    /* Their sitemaps mix recipes with collections and articles, and the word "recipe" appears in all
     * three. Without this, 737 of 800 fetches landed on listicles with no recipe markup: a 92 percent
     * miss rate and a lot of pointless load on their servers. */
    pathMustInclude: '/recipes/',
  },
};

/* UNITS ARE NOT A SELECTION CRITERION, and treating them as one was a mistake worth recording.
 *
 * Earlier passes weighted metric sites because, under the original verbatim-only rule, a recipe
 * calling for 1 lb against his 500 g freezer bag counted as a deviation and so could not be offered.
 * That rule was amended on 2026-08-12: he can accept a 10 percent difference himself. He called this
 * out directly: "Do you care about something being metric or not? You can do the conversion... The
 * only thing that works on metric here is me storing my ground beef."
 *
 * He is right. Converting a recipe's units is arithmetic and it is reliable. The rice cooker disaster
 * was a different animal entirely: that was converting an APPLIANCE'S OWN CALIBRATED MEASURE into
 * another scale, which put four numbers in front of a cook holding one cup. "1 lb of beef, use one
 * 500 g bag" has none of that hazard. `units` is kept as information a card can state, never as a
 * filter. Sites are chosen on permission and quality. */

/* Slug keywords worth ingesting first. Not a filter on quality, a filter on RELEVANCE: this kitchen
 * has 4.5 kg of mince, 1.6 kg of chicken thighs, wings, tilapia, 27 eggs, four boxes of pasta, rice,
 * fresh tomatoes and basil. A crawl weighted to those is both more useful and a smaller ask of
 * somebody else's servers than taking all 18,194. */
const RELEVANT = [
  'bolognese', 'stroganoff', 'pasta', 'spaghetti', 'lasagne', 'macaroni', 'penne', 'noodle',
  'meatball', 'mince', 'burger', 'chilli', 'chili', 'cottage-pie', 'shepherd', 'ragu',
  'chicken', 'thigh', 'wing', 'drumstick', 'roast-chicken',
  'beef', 'steak', 'stew', 'casserole', 'curry', 'stir-fry', 'fried-rice', 'risotto',
  'egg', 'omelette', 'frittata', 'shakshuka', 'scrambled',
  'tilapia', 'fish', 'tomato', 'soup', 'traybake', 'one-pot', 'one-pan', 'quick', 'easy',
];

const args = process.argv.slice(2);
const site = args.find((a) => !a.startsWith('-'));
const cfg = ALLOWED[site];
if (!cfg) {
  console.error(`Unknown or not-permitted site: ${site ?? '(none given)'}`);
  console.error(`Permitted: ${Object.keys(ALLOWED).join(', ')}`);
  console.error('A site is added only after reading its robots.txt. See the header of this file.');
  process.exit(2);
}
const limit = Number(args[args.indexOf('--limit') + 1]) || 1200;
const matchArg = args.includes('--match') ? args[args.indexOf('--match') + 1].split(',') : null;
const keywords = matchArg ?? RELEVANT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function text(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(600);
    }
  }
}

const locs = (xml) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());

console.log(`site: ${site} (${cfg.host}), units ${cfg.units}`);
console.log(`robots.txt read ${cfg.robotsCheckedAt}: ${cfg.robotsNote}\n`);

const index = await text(cfg.sitemap);
const children = locs(index).filter((l) => l.includes(cfg.childMatch));
console.log(`${children.length} recipe sitemaps`);

let urls = [];
for (const c of children) {
  try { urls.push(...locs(await text(c))); } catch (e) { console.log(`  skip ${c}: ${e.message}`); }
  await sleep(80);
}
urls = [...new Set(urls)];
if (cfg.pathMustInclude) {
  const before = urls.length;
  urls = urls.filter((u) => u.includes(cfg.pathMustInclude));
  console.log(`${before - urls.length} URLs dropped: not under ${cfg.pathMustInclude}`);
}
console.log(`${urls.length} recipe URLs listed`);

const scored = urls
  .map((u) => ({ u, hits: keywords.filter((k) => u.includes(k)).length }))
  .filter((x) => x.hits > 0)
  .sort((a, b) => b.hits - a.hits);
const take = scored.slice(0, limit).map((x) => x.u);
console.log(`${scored.length} match the relevance keywords; taking ${take.length}\n`);

const meals = [];
let n = 0, failed = 0;
const CONCURRENCY = 4;
const queue = [...take];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const u = queue.shift();
    if (!u) break;
    try {
      const r = extractRecipe(await text(u, 1));
      if (r?.ingredients?.length) {
        meals.push({
          id: `${site}:${u.split('/').filter(Boolean).pop()}`,
          name: r.name ?? u,
          category: r.category ?? null,
          area: r.cuisine ?? null,
          keywords: r.keywords ?? [],
          image: r.image ?? null,
          source: u,
          youtube: null,
          tags: [],
          ingredients: r.ingredients.map((line) => ({ name: line, measure: '' })),
          rating: r.rating ?? null,
          ratingCount: r.ratingCount ?? null,
          sourceOk: true,
          sourceIngredientCount: r.ingredients.length,
        });
      } else failed++;
    } catch { failed++; }
    if (++n % 100 === 0) process.stdout.write(`  ${n}/${take.length}  (${meals.length} ok, ${failed} no recipe)\n`);
    await sleep(150);   // per worker, so ~26 req/s across four. Deliberately unhurried.
  }
}));

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
writeFileSync(join(OUT_DIR, `${site}.json`), JSON.stringify({
  _: 'Ingredient lists and photos for matching. NO instructions: they stay at the source, which is '
     + 'the only thing a cook card may be built from.',
  provider: cfg.host,
  units: cfg.units,
  attribution: `Recipe data: ${cfg.host}. Each dish links to its original page.`,
  robotsCheckedAt: cfg.robotsCheckedAt,
  robotsNote: cfg.robotsNote,
  fetchedAt: stamp,
  sourceCheckedAt: stamp,
  fetchedCount: meals.length,
  sourceOkCount: meals.length,
  meals: meals.sort((a, b) => String(a.name).localeCompare(String(b.name))),
}, null, 1) + '\n');

console.log(`\nwrote ${meals.length} recipes to corpus/${site}.json (${failed} pages had no recipe markup)`);
