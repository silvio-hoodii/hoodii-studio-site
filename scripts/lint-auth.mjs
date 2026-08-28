#!/usr/bin/env node
/**
 * THE AUTH GATE MAY ONLY BE WRITTEN ONCE.
 *
 * WHY THIS EXISTS. On 2026-08-26 a security audit read `src/proxy.ts` line 44:
 *
 *     const authed = req.cookies.get('kos')?.value === process.env.KITCHEN_SESSION_SECRET;
 *
 * With `KITCHEN_SESSION_SECRET` unset that is `undefined === undefined`, so a request carrying no
 * cookie authenticated as Silvio and the entire write surface (stock ledger, cook log, training log,
 * French cards, want list, swim baseline) opened to the public internet, on a repo whose route list
 * is public on GitHub. The one gate that must not fail open was the only one that did: every DB
 * module throws on a missing connection string.
 *
 * Fixing that line is not the fix. The fix is that the comparison exists in ONE place
 * (`src/lib/auth.ts`, fail-closed), the cookie is SET in one place (`src/lib/login-server.ts` plus
 * the unlock route, which answers JSON mid-cook rather than redirecting a form), and this script
 * refuses the build on a second copy of either. Before it, there were five copies of the
 * cookie-setting block and two of the comparison, and the audit found the defect in the one nobody
 * had read in a while.
 *
 * Law 1 in `.agents/ENGINEERING.md`: eliminate the class, do not validate instances. Law meta: a
 * rule that does not execute is decoration. This is the mechanism for both.
 *
 * Run: node scripts/lint-auth.mjs   (wired into `pnpm build` and scripts/verify.mjs)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** Posix-style repo-relative path, so the allowlists below read the same on Windows. */
const rel = (p) => relative(ROOT, p).split(sep).join('/');

/* The three files allowed to name the secret, and why each one is allowed.
 *
 * Adding a path here is a decision about the security model, not a formality. If a new file needs
 * to know whether the caller is authorised, it imports `cookieAuthorises` or `isAuthed`; it does not
 * join this list. */
const MAY_READ_SECRET = new Map([
  ['src/lib/auth.ts', 'the one comparison, fail-closed'],
  ['src/lib/login-server.ts', 'the one place a login form sets the cookie'],
  ['src/app/kitchen/api/unlock/route.ts', 'the inline unlock: answers JSON to a fetch mid-cook'],
]);

/* Same list, for the cookie NAME. `AUTH_COOKIE` is exported from src/lib/auth.ts so nothing else
 * spells it. A misspelled literal in a new gate reads as a gate and is none. */
const MAY_NAME_COOKIE = new Set([...MAY_READ_SECRET.keys()]);

const SECRET_ENVS = ['KITCHEN_SESSION_SECRET', 'KITCHEN_PASSWORD'];

/* Comments are stripped before scanning, and that is not laziness.
 *
 * Every file this check protects EXPLAINS the gate in prose, including proxy.ts, which has to name
 * the exact line it used to carry so the next reader knows what was wrong with it. A checker that
 * flags its own documentation gets three false positives out of three on its first run and teaches
 * whoever reads the output to dismiss it. That happened to the bare-path hook in this workspace on
 * 2026-08-26 and the lesson was written down: precision matters more than recall, because a
 * checker whose first real finding is wrong is a checker nobody runs.
 *
 * A copy of the comparison is code. Prose about the comparison is the reason the copy is gone. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx|mts)$/.test(entry)) files.push(full);
  }
})(SRC);

let fail = 0;
let checked = 0;

for (const full of files) {
  const path = rel(full);
  const src = stripComments(readFileSync(full, 'utf8'));
  checked++;

  for (const env of SECRET_ENVS) {
    if (!src.includes(env)) continue;
    if (MAY_READ_SECRET.has(path)) continue;
    console.error(`FAIL  ${path} reads process.env.${env}.`);
    console.error(`      The comparison lives in src/lib/auth.ts and nowhere else. Import`);
    console.error(`      \`cookieAuthorises\` (edge-safe) or \`isAuthed\` from src/lib/auth-server.ts.`);
    console.error(`      A second copy is a second chance to write \`undefined === undefined\`.`);
    fail++;
  }

  /* The cookie name as a bare literal, and only where it is being READ OR SET.
   *
   * `src/app/kitchen/layout.tsx` carries `className="kos"`, the surface's root class, which was this
   * check's first false positive. A rule that flags every occurrence of three letters flags a
   * stylesheet hook; requiring `get(` or `set(` on the same line flags a cookie access, which is
   * the thing that must not be written twice. */
  const cookieLiteral = src
    .split('\n')
    .find((line) => /(['"])kos\1/.test(line) && /\b(get|set)\s*\(/.test(line));
  if (cookieLiteral && !MAY_NAME_COOKIE.has(path)) {
    console.error(`FAIL  ${path} reads or sets the auth cookie by literal name:`);
    console.error(`        ${cookieLiteral.trim()}`);
    console.error(`      Import AUTH_COOKIE from src/lib/auth.ts. A typo'd literal reads as a gate`);
    console.error(`      and is none, which is the same class as the /swim matcher omission.`);
    fail++;
  }
}

/* A gate that has only ever been seen to pass has not been seen to work: assert the file it exists
 * to protect still contains the fail-closed guard, so deleting that guard cannot pass this check. */
const authSrc = readFileSync(join(SRC, 'lib', 'auth.ts'), 'utf8');
if (!/if\s*\(!secret\)\s*return\s+false/.test(authSrc)) {
  console.error('FAIL  src/lib/auth.ts no longer refuses an unset KITCHEN_SESSION_SECRET.');
  console.error('      That guard IS the finding this whole check exists for. Do not remove it.');
  fail++;
}

console.log('-'.repeat(70));
console.log(
  `${checked} source file(s) checked, ${MAY_READ_SECRET.size} allowed to name the secret, ${fail} failures`,
);
process.exit(fail ? 1 : 0);
