#!/usr/bin/env node
/**
 * Every POST route under /gym/api, /swim/api or /bike/api must be stubbed by scripts/probe-gym.js.
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
import { join, relative, sep } from 'node:path';

const API_ROOTS = [
  { dir: join(process.cwd(), 'src', 'app', 'gym', 'api'), url: '/gym/api' },
  { dir: join(process.cwd(), 'src', 'app', 'swim', 'api'), url: '/swim/api' },
  /* Added 2026-08-27 with POST /bike/api/ride, in the same commit as the route. /bike has no page
     yet, so nothing on the site calls this route and no probe touches it today. That is exactly
     when a write route escapes a harness: when adding it to the list feels like paperwork. */
  { dir: join(process.cwd(), 'src', 'app', 'bike', 'api'), url: '/bike/api' },
];
const PROBE = join(process.cwd(), 'scripts', 'probe-gym.js');

/* Read but deliberately not stubbed: both are shaped as POSTs because they take a body the URL
 * cannot carry, but both only READ. src/proxy.ts lets them through the cookie gate for the same
 * reason. Listed here explicitly so "not stubbed" is a decision on the record rather than an
 * omission nobody noticed. */
const READ_ONLY_POSTS = new Set([
  '/gym/api/plan',
  '/gym/api/session',
]);

/* ---------------------------------------------------------------------------------------------
 * SERVER ACTIONS ARE A WRITE CHANNEL AND NO GATE WATCHED THEM. Added 2026-08-28 per audit theme T9.
 *
 * This file's whole subject is "every route that can change state is inside a harness". It walked
 * `route.ts` files under three API roots and nothing else, and `'use server'` is a second, entirely
 * separate way to POST into this app: `src/app/kitchen/want/actions.ts` exists, takes a form
 * submission, and is reached by no matcher, no prefix check and no probe stub. It happens to be
 * read-only, which is luck rather than a property anything enforces.
 *
 * `src/proxy.ts` cannot cover it: the proxy gates paths, and a server action posts to the page's own
 * URL. So the only mechanism available is an INVENTORY, and an inventory that is not compared against
 * anything is a comment. Each action file is declared here as read-only or gated, and a NEW one fails
 * the build until somebody says which it is. That is the cheap half of the problem: the expensive half
 * is nobody noticing the file exists.
 *
 * The login page's `signIn` action is here for completeness rather than as an exemption. It sets the
 * cookie, which is how a device becomes authorised, so it cannot require being authorised;
 * `src/lib/login-server.ts` is the one place that happens and `scripts/lint-auth.mjs` gates it.
 *
 * THERE WAS ONE ENTRY PER APP HERE UNTIL 2026-09-04: /kitchen/login, /gym/login, /health/login and
 * /french/login were four near-identical forms for one cookie and one password, and their per-app
 * redirect guards were A3 of that day's audit. One route, one entry. Note that this inventory is
 * what caught the consolidation: deleting the four files failed this gate until the map was
 * updated, which is the inventory doing exactly its job.
 * ------------------------------------------------------------------------------------------- */
const SERVER_ACTION_FILES = new Map([
  ['src/app/kitchen/want/actions.ts', 'READ ONLY: scores a pasted ingredient list, returns strings, writes nothing'],
  ['src/app/login/page.tsx', 'PUBLIC BY NECESSITY: signIn, the gate itself. See src/lib/login-server.ts'],
]);

function auditServerActions() {
  const SRC = join(process.cwd(), 'src');
  const found = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const src = readFileSync(full, 'utf8');
      /* The directive, at the top of a file or inside a function body, which are the two forms
       * Next accepts. Quoted either way. */
      if (/(['"])use server\1/.test(src)) {
        found.push(relative(process.cwd(), full).split(sep).join('/'));
      }
    }
  })(SRC);

  let bad = 0;
  for (const f of found) {
    if (SERVER_ACTION_FILES.has(f)) continue;
    console.error(`FAIL  ${f} declares "use server" and is not in SERVER_ACTION_FILES.`);
    console.error('      A server action is a POST that no matcher and no probe can see. Decide what it');
    console.error('      is and record it here: read-only, or a write that must check `isAuthed()` from');
    console.error('      src/lib/auth-server.ts itself, because src/proxy.ts cannot gate it.');
    bad++;
  }
  for (const f of SERVER_ACTION_FILES.keys()) {
    if (found.includes(f)) continue;
    console.error(`FAIL  SERVER_ACTION_FILES lists ${f}, which no longer declares "use server".`);
    console.error('      A stale entry describes a channel that moved, which is how the /swim matcher');
    console.error('      omission happened: a list that reads correct and covers nothing.');
    bad++;
  }
  return { found: found.length, bad };
}

const actions = auditServerActions();

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

let fail = actions.bad;
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

/* ---- no plain <Link> to a firewall-challenged path. A7 of the 2026-09-04 audit ----------------
 *
 * Rule 3 of the off-repo Vercel firewall puts an edge challenge on /kitchen/find, /reading/shelf
 * and /reading/want. Next prefetches a `<Link>` when it scrolls into view, so eighteen plain Links
 * to those three paths meant every load of /kitchen fired four 429s, each one a counted request
 * against the same 150-per-minute rule that protects the site, spent on a request the edge is
 * configured to refuse.
 *
 * `src/components/WalledLink.tsx` sets `prefetch={false}` for a walled href and behaves like a
 * normal Link otherwise. This is the part that makes it stick: the nineteenth link cannot forget,
 * because the build refuses it. Without this, the component is just a suggestion, and AGENTS.md's
 * own conclusion about this exact firewall rule is that "naming paths one at a time loses".
 *
 * It lives in THIS script rather than a new one because this file already owns the relationship
 * between route shapes and off-repo configuration, and a fifth lint script is a fifth thing to
 * remember to wire into the build.
 */
const WALLED_LIB = join(process.cwd(), 'src', 'lib', 'walled.ts');
const walledSrc = readFileSync(WALLED_LIB, 'utf8');
const walledMatch = walledSrc.match(/export const WALLED_PATHS = \[([^\]]*)\]/);
if (!walledMatch) {
  console.error('FAIL  could not find WALLED_PATHS in src/lib/walled.ts. Did it move or get renamed?');
  process.exit(1);
}
const walled = [...walledMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (!walled.length) {
  console.error('FAIL  WALLED_PATHS in src/lib/walled.ts is empty. If rule 3 was removed, delete the');
  console.error('      component and this check together rather than leaving both pointing at nothing.');
  process.exit(1);
}

let walledChecked = 0;
(function walkSrc(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { walkSrc(full); continue; }
    if (!/\.tsx$/.test(entry)) continue;
    /* The component itself legitimately mentions every walled path in its own prose, and so does
       the library. Skip both by path: they are the definition, not a call site. */
    const rel = full.replace(process.cwd(), '').replace(/\\/g, '/');
    if (rel.endsWith('/src/components/WalledLink.tsx')) continue;
    walledChecked++;
    const src = readFileSync(full, 'utf8');

    /* ---- the rule that catches a href nobody wrote as a literal ----------------------------
     *
     * THE LITERAL CHECK BELOW IS NOT ENOUGH, and finding that out is worth the paragraph. It
     * passed with 0 failures while /kitchen/find fired 58 prefetches at walled URLs and
     * /reading/shelf fired 54, because those pages link to THEMSELVES through a helper:
     *
     *     href={shelfHref(filters, { letter: L })}   ->  /reading/shelf?letter=Z
     *     href={href(filters, { uses: i.id })}       ->  /kitchen/find?uses=chickenthighs
     *
     * There is no walled path in the source of those lines at all, so no string check can see
     * them. And they are the expensive ones: the shelf's 27-letter rail alone is 27 prefetches
     * of the page that took 178,000 invocations in twelve hours on 2026-08-24, which is the
     * incident firewall rule 3 exists because of.
     *
     * So the rule is structural rather than textual. A .tsx file inside a walled route's own
     * directory links to that route constantly, by construction: filter chips, sort options, a
     * letter rail, a "clear all" reset. Such a file may not import `next/link` at all. It uses
     * WalledLink, which is a plain Link for any href that is not walled, so this costs nothing
     * on the ordinary links in the same file and needs nobody to work out which is which.
     *
     * This is the difference between checking instances and removing the class: the literal
     * check tells you about the link you wrote, and this one is true of the link you have not
     * written yet. */
    const inWalledDir = walled.some((p) => rel.startsWith(`/src/app${p}/`));
    if (inWalledDir && src.includes("from 'next/link'")) {
      const line = src.slice(0, src.indexOf("from 'next/link'")).split(/\r?\n/).length;
      console.error(`FAIL  ${rel}:${line}  imports next/link inside a firewall-challenged route.`);
      console.error('      A page in this directory links to itself with a built href, which no');
      console.error('      string check can see, and every such Link prefetches a 429.');
      console.error('      Use WalledLink from @/components/WalledLink for every link in this file.');
      fail++;
    }

    /* An opening <Link tag, with its attributes, up to the closing angle bracket. Deliberately not
       trying to parse JSX: the question is only whether a tag named Link carries a walled href and
       lacks prefetch={false}, and both halves are visible in the opening tag. */
    for (const m of src.matchAll(/<Link\b([^>]*)>/g)) {
      const attrs = m[1];
      const hit = walled.find((p) => attrs.includes(`"${p}`) || attrs.includes('`' + p));
      if (!hit) continue;
      if (/prefetch=\{false\}/.test(attrs)) continue;
      const line = src.slice(0, m.index).split(/\r?\n/).length;
      console.error(`FAIL  ${rel}:${line}  plain <Link> to ${hit}, which the edge challenges.`);
      console.error('      Next prefetches this on viewport entry and the firewall answers 429.');
      console.error('      Use WalledLink from @/components/WalledLink, or prefetch={false}.');
      fail++;
    }
  }
})(join(process.cwd(), 'src'));

console.log('-'.repeat(70));
console.log(
  `${routes.length} POST route(s) under ${API_ROOTS.map((r) => r.url).join(' + ')}, ${stubbed.size} stubbed, ` +
    `${READ_ONLY_POSTS.size} read-only by declaration, ${actions.found} server-action file(s) declared, ` +
    `${walledChecked} tsx file(s) checked against ${walled.length} walled path(s), ` +
    `${fail} failures`,
);
process.exit(fail ? 1 : 0);
