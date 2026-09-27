#!/usr/bin/env node
/* DOES FIREWALL RULE 3 STILL CHALLENGE A PATH THAT SERVES A PAGE?
 *
 *   node scripts/check-firewall.mjs
 *
 * Rule 3 of the off-repo Vercel firewall puts an edge challenge on a filter-surface regex. Until
 * 2026-09-27 this script diffed it against `WALLED_PATHS` in src/lib/walled.ts, the list that made
 * `WalledLink` drop prefetching on links to challenged paths (a prefetch the edge answers with 429).
 * Every walled path was then a deleted route (/kitchen/find, /kitchen/want, /reading/shelf,
 * /reading/want), the list and component had 0 importers, and both were removed.
 *
 * So the question flipped. If the live rule challenges a path that has a page under src/app again,
 * links to it will prefetch a 429 on every visit and the prefetch guard has to come back. This
 * script reads the live rule and fails in that case. When no challenged path has a route, it says
 * rule 3 protects nothing, which is a decision for a person (keep it as a bot fence on the 307s, or
 * delete it), not for this script.
 *
 * NOT A BUILD GATE, and that is deliberate. It needs the network and a logged-in Vercel CLI, and
 * `pnpm build` runs on a machine that has neither. Run it when touching the firewall or adding a
 * route whose path the rule's regex could match.
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

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
  console.log('No enabled challenge rule in the live firewall: rule 3 is gone, nothing to check.');
  process.exit(0);
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

/* ---- compare against the routes in this repo ------------------------------------------------- */

/* A challenged prefix "serves a page" when src/app holds a directory for it with a page.tsx or a
   route.ts anywhere at or under it. Route groups and dynamic segments are not in any challenged
   path today, so a literal directory walk is the whole check. */
function servesSomething(prefix) {
  const dir = join(process.cwd(), 'src', 'app', ...prefix.split('/').filter(Boolean));
  return existsSync(join(dir, 'page.tsx')) || existsSync(join(dir, 'route.ts'));
}

const serving = live.filter(servesSomething);

console.log('-'.repeat(70));
console.log('live firewall challenges :', live.join(', ') || '(none)');
console.log('of those, serving a page :', serving.join(', ') || '(none)');
console.log('-'.repeat(70));

if (!serving.length) {
  console.log(`Rule 3 protects nothing in this repo: all ${live.length} challenged path(s) are deleted routes.`);
  process.exit(0);
}

console.error(`FAIL  the edge challenges live route(s): ${serving.join(', ')}`);
console.error('      A <Link> to these prefetches a 429 on every visit. Either narrow rule 3, or give');
console.error('      those links prefetch={false} and a lint rule that keeps it (see git history for');
console.error('      src/components/WalledLink.tsx and scripts/lint-probe-routes.mjs, 2026-09-27).');
process.exit(1);
