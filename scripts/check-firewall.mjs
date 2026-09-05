#!/usr/bin/env node
/* DOES `src/lib/walled.ts` STILL MATCH THE REAL FIREWALL?
 *
 *   node scripts/check-firewall.mjs
 *
 * WHY THIS EXISTS, and it is the shortest possible case for a mechanism. `WALLED_PATHS` is a copy
 * of configuration that lives in Vercel and not in this repo. Its own header said so, at length,
 * and argued the copy was worth having because the alternative was no mechanism at all.
 *
 * THE COPY WAS WRONG WITHIN HOURS OF BEING WRITTEN. It shipped on 2026-09-04 with three paths,
 * copied from that day's audit, which had copied them from AGENTS.md's firewall table. The live
 * rule has FOUR:
 *
 *     path re "^/(reading/(shelf|want)|kitchen/(find|want))"
 *
 * `/kitchen/want` was challenged the whole time and appeared in none of the three documents, so six
 * <Link> elements kept prefetching a 429, including "check it against the kitchen" on every
 * external row of /kitchen. It was found by sweeping the live site and getting a 429 on a path all
 * three documents said was fine. Three copies of a fact, all wrong together, which is what copies
 * do.
 *
 * NOT A BUILD GATE, and that is deliberate. It needs the network and a logged-in Vercel CLI, and
 * `pnpm build` runs on a machine that has neither. A gate that cannot run in the place it is wired
 * into is worse than no gate: it either fails every build or gets an exception that swallows it.
 * So this is the thing a person runs when touching the firewall or the walled list, and the header
 * of `src/lib/walled.ts` points at it by name.
 *
 * It exits 1 on a mismatch so it can be added to a scheduled check later if that is ever wanted.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const WALLED_LIB = join(process.cwd(), 'src', 'lib', 'walled.ts');

/* ---- what the repo believes ------------------------------------------------------------------ */

const src = readFileSync(WALLED_LIB, 'utf8');
const m = src.match(/export const WALLED_PATHS = \[([^\]]*)\]/);
if (!m) {
  console.error('FAIL  could not find WALLED_PATHS in src/lib/walled.ts.');
  process.exit(1);
}
const declared = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();

/* ---- what Vercel is actually enforcing -------------------------------------------------------- */

function vercel(path) {
  /* MSYS_NO_PATHCONV so Git Bash does not rewrite the leading slash of the API path into a Windows
     path, which AGENTS.md records as the way this call fails on this machine. */
  return execFileSync('npx', ['vercel', 'api', path], {
    encoding: 'utf8',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

let config;
try {
  const projectId = JSON.parse(vercel('/v9/projects/hoodii-studio-site')).id;
  config = JSON.parse(vercel(`/v1/security/firewall/config/active?projectId=${projectId}`));
} catch (e) {
  console.error('FAIL  could not read the live firewall config.');
  console.error('      This needs a logged-in Vercel CLI and a network. `npx vercel login` first.');
  console.error(`      ${String((e && e.message) || e).split('\n')[0]}`);
  process.exit(1);
}

/* The challenge rule is identified by its ACTION, not by its name. A rule can be renamed in the
 * dashboard and a check keyed on "Filter surface cost gate" would then silently find nothing and
 * report agreement, which is the same shape of false pass this whole file is about. */
const challengeRules = (config.rules || []).filter(
  (r) => r.active !== false && r.action?.mitigate?.action === 'challenge',
);

if (!challengeRules.length) {
  console.error('FAIL  no enabled challenge rule found in the live firewall.');
  console.error('      Either rule 3 was removed, in which case delete WalledLink and its two lint');
  console.error('      rules along with it, or this script is looking in the wrong place.');
  process.exit(1);
}

/* Pull the path patterns out of every challenge rule's conditions and turn each into the set of
 * literal prefixes it covers. The live value is a regex alternation, so it is expanded rather than
 * compared as a string: `^/(reading/(shelf|want)|kitchen/(find|want))` and a four-entry array are
 * the same statement written two ways, and comparing them textually would never agree. */
const livePaths = new Set();
for (const rule of challengeRules) {
  for (const group of rule.conditionGroup || []) {
    for (const cond of group.conditions || []) {
      if (cond.type !== 'path') continue;
      for (const p of expand(String(cond.value))) livePaths.add(p);
    }
  }
}

/** Expand a simple anchored alternation regex into the literal prefixes it matches.
 *
 *  Handles the one shape this firewall uses: `^/(a/(b|c)|d/(e|f))`. Anything it cannot expand is
 *  reported rather than guessed at, because a silently mis-expanded pattern is exactly the failure
 *  this script exists to catch. */
function expand(pattern) {
  let p = pattern.trim().replace(/^\^/, '').replace(/\$$/, '');
  const out = [];
  const walk = (prefix, rest) => {
    const open = rest.indexOf('(');
    if (open === -1) {
      out.push(prefix + rest);
      return;
    }
    let depth = 0;
    let close = -1;
    for (let i = open; i < rest.length; i++) {
      if (rest[i] === '(') depth++;
      else if (rest[i] === ')') {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) throw new Error(`unbalanced parentheses in ${pattern}`);
    const head = prefix + rest.slice(0, open);
    const tail = rest.slice(close + 1);
    /* Split the group on top-level pipes only. */
    const body = rest.slice(open + 1, close);
    const alts = [];
    let d = 0;
    let last = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '(') d++;
      else if (body[i] === ')') d--;
      else if (body[i] === '|' && d === 0) {
        alts.push(body.slice(last, i));
        last = i + 1;
      }
    }
    alts.push(body.slice(last));
    for (const a of alts) walk(head, a + tail);
  };
  walk('', p);
  if (out.some((x) => /[[\]?*+{}\\]/.test(x))) {
    throw new Error(`pattern has regex syntax this script cannot expand literally: ${pattern}`);
  }
  return out;
}

const live = [...livePaths].sort();

/* ---- compare ---------------------------------------------------------------------------------- */

const missing = live.filter((p) => !declared.includes(p));
const extra = declared.filter((p) => !live.includes(p));

console.log('-'.repeat(70));
console.log('live firewall challenges :', live.join(', ') || '(none)');
console.log('src/lib/walled.ts says   :', declared.join(', ') || '(none)');
console.log('-'.repeat(70));

if (!missing.length && !extra.length) {
  console.log(`They agree. ${live.length} path(s).`);
  process.exit(0);
}

if (missing.length) {
  console.error(`FAIL  challenged live but NOT in WALLED_PATHS: ${missing.join(', ')}`);
  console.error('      Links to these prefetch a 429 on every visit, and neither lint rule can see');
  console.error('      them because both read that list. Add them to src/lib/walled.ts.');
}
if (extra.length) {
  console.error(`FAIL  in WALLED_PATHS but NOT challenged live: ${extra.join(', ')}`);
  console.error('      Harmless to visitors, but it suppresses prefetching on a page that would');
  console.error('      benefit from it, and it makes the list untrustworthy in the other direction.');
}
process.exit(1);
