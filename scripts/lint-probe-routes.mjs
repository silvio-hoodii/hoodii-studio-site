#!/usr/bin/env node
/**
 * Every POST route under /gym/api or /swim/api must be stubbed by scripts/probe-gym.js.
 *
 * WHY THIS EXISTS. probe-gym.js patches window.fetch so that no test can write to the real Neon
 * store, which holds his actual training log. There is no development database. The patch works off
 * a hardcoded list, WRITE_ROUTES, and the safety property is only as good as that list is complete.
 *
 * On 2026-08-16 /gym/api/note was added to the app and not to the list. The first probe of the note
 * box posted to the real route. It was refused, but only because that browser happened to have no
 * unlock cookie. With one, a test would have written a fake note into his log, which is the exact
 * outcome the whole harness is built to make impossible.
 *
 * A comment saying "remember to add it" is decoration. This is the mechanism.
 *
 * ON 2026-08-26 THIS FILE'S SCOPE WAS THE BUG WAITING TO HAPPEN. It hardcoded one directory,
 * and the swim migration moved /gym/api/swim-baseline to /swim/api/baseline: a live POST into the
 * real Neon store, sitting outside the only mechanism that checks the probe stubs it. The scope is
 * a list now. Adding an API root under a new route means adding it here, and the failure mode if
 * you forget is silent, which is precisely why the list is short and the note is loud.
 *
 * Run: node scripts/lint-probe-routes.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOTS = [
  { dir: join(process.cwd(), 'src', 'app', 'gym', 'api'), url: '/gym/api' },
  { dir: join(process.cwd(), 'src', 'app', 'swim', 'api'), url: '/swim/api' },
];
const PROBE = join(process.cwd(), 'scripts', 'probe-gym.js');

/* Read but deliberately not stubbed: both are shaped as POSTs because they take a body the URL
 * cannot carry, but both only READ. src/proxy.ts lets them through the cookie gate for the same
 * reason. Listed here explicitly so "not stubbed" is a decision on the record rather than an
 * omission nobody noticed. */
const READ_ONLY_POSTS = new Set([
  '/gym/api/plan',
  '/gym/api/session',
  /* Reads too: it just calls computeNextUp. Found by this linter on the run that introduced it, and
   * worth knowing that NOTHING CALLS IT: computeNextUp is invoked server-side in page.tsx and by the
   * hub, so this route is dead. It is also the one read-shaped POST that src/proxy.ts does NOT let
   * through the cookie gate, so if anything ever did call it from the client it would 401. Left in
   * place rather than deleted as part of a change about note-taking; a candidate for removal. */
  '/gym/api/next',
]);

const probeSrc = readFileSync(PROBE, 'utf8');
const listMatch = probeSrc.match(/const WRITE_ROUTES = \[([^\]]*)\]/);
if (!listMatch) {
  console.error('FAIL  could not find `const WRITE_ROUTES = [...]` in scripts/probe-gym.js');
  process.exit(1);
}
const stubbed = new Set([...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));

const routes = [];
function walk(dir, urlPath) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, `${urlPath}/${entry}`);
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      const src = readFileSync(full, 'utf8');
      if (/export\s+async\s+function\s+POST|export\s+const\s+POST/.test(src)) routes.push(urlPath);
    }
  }
}
for (const root of API_ROOTS) {
  /* A declared root that does not exist yet is a failure, not a skip. Silently walking nothing is
     how this check would report "all clear" for a directory somebody renamed. */
  walk(root.dir, root.url);
}

let fail = 0;
for (const r of routes.sort()) {
  if (READ_ONLY_POSTS.has(r)) continue;
  if (!stubbed.has(r)) {
    console.error(`FAIL  ${r} accepts POST but is not in WRITE_ROUTES in scripts/probe-gym.js.`);
    console.error('      An unstubbed write route means the probe posts to the real training log.');
    console.error('      Add it to WRITE_ROUTES, or to READ_ONLY_POSTS here if it genuinely only reads.');
    fail++;
  }
}
for (const s of stubbed) {
  if (!routes.includes(s)) {
    console.error(`FAIL  WRITE_ROUTES lists ${s}, which has no POST route under any of ${API_ROOTS.map((r) => r.url).join(', ')}.`);
    console.error('      A stale entry stubs nothing and hides that the real route moved.');
    fail++;
  }
}

console.log('-'.repeat(70));
console.log(
  `${routes.length} POST route(s) under ${API_ROOTS.map((r) => r.url).join(' + ')}, ${stubbed.size} stubbed, ` +
    `${READ_ONLY_POSTS.size} read-only by declaration, ${fail} failures`,
);
process.exit(fail ? 1 : 0);
