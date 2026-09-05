#!/usr/bin/env node
/* THE NUMBERS ON /work/site, COUNTED FROM THE REPO RATHER THAN TYPED.
 *
 * G1 of the 2026-09-04 audit, and his ruling on it: the site shows a lot of live state and never
 * shows the software. A stranger arriving at hoodii.studio has no way to know the cook screen
 * exists, or that a recipe cannot ship unless every number in a step appears in the source the step
 * quotes. The strongest thing in this repo is the gates, and they are invisible.
 *
 * SO THE PAGE ABOUT THE GATES IS ITSELF GATED. Every figure it prints is counted here, from the
 * files, and `pnpm build` runs `--check` and fails if the counted answer has moved. A page boasting
 * "6 build gates" while the build has 11 would be the most embarrassing possible file in this repo,
 * and the failure mode is not hypothetical: AGENTS.md's own surfaces table lost track of five
 * routes, /reading/about printed a typed "33" while the table held 55, and this session found a
 * share card rendering in a palette deleted a month earlier. Every one was a hand-kept number.
 *
 * It is a build-time generator rather than a runtime read because `src/` does not survive into the
 * deployed bundle: the pages are compiled, so a page that counted `src/app/**` at request time
 * would count nothing in production. `content/` IS traced, which is why the answer is written
 * there. Same shape, and the same reason, as scripts/gen-tokens.mjs.
 *
 *   node scripts/gen-site-facts.mjs           # write content/work/site-facts.json
 *   node scripts/gen-site-facts.mjs --check   # exit 1 if stale. In `pnpm build`
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'content', 'work', 'site-facts.json');

/** Every file under `dir` matching `test`, recursively. */
function walk(dir, test, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, test, out);
      continue;
    }
    if (test(entry, full)) out.push(full);
  }
  return out;
}

const APP = join(ROOT, 'src', 'app');
const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, '/');

/* ---- routes -------------------------------------------------------------------------------------
 *
 * A page.tsx is a page someone can open. A route.ts is an endpoint. Counted separately because they
 * are different claims: "43 pages" and "43 things" are not the same sentence.
 *
 * The dynamic segments are counted as ONE route each, not as the number of things they render:
 * /kitchen/[id] is one route serving every dish, and calling it 40 would be counting the data. */
const pageFiles = walk(APP, (e) => e === 'page.tsx');
const routeFiles = walk(APP, (e) => e === 'route.ts');

/* An app is a top-level segment that has a layout of its own, which is what makes it a surface
 * rather than a page: the layout is where the header, the nav and the stylesheet are mounted. */
const appSegments = readdirSync(APP)
  .filter((e) => statSync(join(APP, e)).isDirectory())
  .filter((e) => !e.startsWith('(') && !e.startsWith('_') && e !== 'api')
  .filter((e) => existsSync(join(APP, e, 'layout.tsx')));

/* ---- gates ---------------------------------------------------------------------------------------
 *
 * COUNTED OUT OF THE BUILD SCRIPT ITSELF, so this cannot claim a gate that does not run. Every
 * command in `pnpm build` before `next build` is a check that can refuse a deploy. */
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const buildScript = pkg.scripts?.build ?? '';
const buildGates = buildScript
  .split('&&')
  .map((s) => s.trim())
  .filter((s) => s.startsWith('node '))
  .map((s) => s.replace(/^node\s+/, '').split(/\s+/)[0]);

/* The suites `scripts/verify.mjs` runs. Counted from the file, for the same reason: a suite that is
 * written and not wired in is not a suite, it is a file. */
const verifySrc = readFileSync(join(ROOT, 'scripts', 'verify.mjs'), 'utf8');
const testFiles = [
  ...walk(join(ROOT, 'src'), (e) => /\.test\.(ts|mjs)$/.test(e)),
  ...walk(join(ROOT, 'content'), (e) => /\.test\.(ts|mjs)$/.test(e)),
].map(rel);
const testsWired = testFiles.filter((f) => verifySrc.includes(f));

/* ---- content -------------------------------------------------------------------------------------
 *
 * The recipe count is the one number on this page a stranger can check against the running site:
 * /kitchen prints how many dishes it can make out of the corpus, and this is how many are written
 * out step by step with a source behind every quantity. */
const recipeDir = join(ROOT, 'content', 'kitchen', 'recipes');
const recipes = walk(recipeDir, (e) => e.endsWith('.json')).length;

/* AGENTS.md is the reason this repo behaves the way it does, and its size is the honest way to say
 * "the decisions are written down" without asking anyone to take that on trust. */
const agentsLines = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8').split(/\r?\n/).length;

const facts = {
  $comment:
    'GENERATED by scripts/gen-site-facts.mjs. Do not edit. pnpm build runs --check and fails if this is stale.',
  pages: pageFiles.length,
  endpoints: routeFiles.length,
  apps: appSegments.length,
  appNames: appSegments.sort(),
  buildGates: buildGates.length,
  buildGateNames: buildGates,
  testSuites: testFiles.length,
  testSuitesWiredIntoVerify: testsWired.length,
  recipes,
  agentsLines,
};

const body = JSON.stringify(facts, null, 2) + '\n';

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) {
    console.error(`FAIL  ${rel(OUT)} does not exist. Run: node scripts/gen-site-facts.mjs`);
    process.exit(1);
  }
  if (readFileSync(OUT, 'utf8') !== body) {
    console.error('-'.repeat(70));
    console.error('FAIL  content/work/site-facts.json is stale against the repo.');
    console.error('      /work/site prints these numbers. A page about this repo\'s gates that');
    console.error('      miscounts them is the worst file here. Run: node scripts/gen-site-facts.mjs');
    process.exit(1);
  }
  console.log(
    `site-facts.json is current: ${facts.pages} pages, ${facts.apps} apps, ${facts.buildGates} build gates, ${facts.testSuites} suites.`,
  );
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body);
console.log('-'.repeat(70));
console.log(`Wrote ${rel(OUT)}`);
console.log(`  ${facts.pages} pages, ${facts.endpoints} endpoints, ${facts.apps} apps`);
console.log(`  ${facts.buildGates} build gates: ${facts.buildGateNames.join(', ')}`);
console.log(`  ${facts.testSuites} test suites, ${facts.testSuitesWiredIntoVerify} wired into verify.mjs`);
console.log(`  ${facts.recipes} recipes, AGENTS.md is ${facts.agentsLines} lines`);
