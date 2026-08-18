#!/usr/bin/env node
/* No em dashes. Enforced by the build, because enforced by prose did not work.
 *
 * AGENTS.md has carried "No em dashes. Zero tolerance" since this repo started, and HOODII's CLAUDE.md
 * carries it for every project. It is violated constantly, and the reason is instructive: the rule's
 * only enforcement was "grep for it before you call it done", typed by hand each time.
 *
 * On 2026-08-13 an agent doing exactly that reported the repo clean. Its `grep -P` had failed with
 * "supports only unibyte and UTF-8 locales", printed nothing, and exited in a way that read as a pass.
 * A byte-exact re-run found 118 lines. So the rule failed INSIDE the review whose job was to check it,
 * which is `.agents/ENGINEERING.md`'s meta-law in one incident: a rule that does not execute is
 * decoration, and a grep an agent has to remember to type does not execute.
 *
 * Three characters, all of which read as an em dash in a sentence and none of which he wants:
 *   U+2014 EM DASH, U+2013 EN DASH used as one, and the HTML entities for both.
 *
 * ALLOWED, on one line and marked: code that exists to REMOVE these characters from scraped text needs
 * to contain them. `match.mjs` strips them out of published ingredient lines. Put `lint-prose-allow` in
 * a comment on the same line and it is skipped, so the exception is visible in a diff rather than
 * living in this file as a path nobody rereads.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const ROOTS = ['src', 'content', 'scripts'];
const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'corpus', 'imported']);
const EXT = /\.(tsx?|jsx?|mjs|cjs|css|md|json|sql|html)$/;

/* corpus/ is skipped: it is scraped data, not prose we wrote, and BBC Good Food uses em dashes in its
 * own ingredient names. Rewriting a source's text would be a provenance violation, which matters more
 * than a punctuation rule about OUR writing. The stripping happens at render time instead.
 *
 * imported/ is skipped for the same reason and a sharper one. Those files are captures written by
 * `content/kitchen/import.mjs`: one publisher's ingredient lines and method, fetched, stamped and
 * HASHED, and `validate.mjs` checks every quote on a cook card against them. Editing a captured
 * sentence to satisfy a punctuation rule would break the hash, and it would corrupt the one artefact
 * in this repo whose entire value is being exactly what the page said. BBC Good Food's tuna spaghetti
 * is the live example: "Don't stir too vigorously" is followed by an en dash on her own page.
 *
 * Neither directory reaches a screen unaltered. The dash stripping happens at render time, which is
 * where a rule about what HE reads belongs. */

const EM = '\u2014';   // from escapes, so this detector cannot trip over itself
const EN = '\u2013';
const bad = [];

function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIR.has(e)) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (!EXT.test(e)) continue;
    const lines = readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.includes('lint-prose-allow')) return;
      const hits = [];
      if (line.includes(EM)) hits.push('U+2014 em dash');
      if (line.includes(EN)) hits.push('U+2013 en dash');
      if (/&mdash;|&#8212;|&ndash;|&#8211;/.test(line)) hits.push('em/en dash HTML entity');   // lint-prose-allow
      if (hits.length) bad.push({ file: relative(ROOT, full), line: i + 1, what: hits.join(' + '), text: line.trim().slice(0, 100) });
    });
  }
}

for (const r of ROOTS) {
  try { walk(join(ROOT, r)); } catch { /* a root that does not exist is not a failure */ }
}

for (const b of bad) {
  console.log(`x  ${b.file}:${b.line}  ${b.what}`);
  console.log(`      ${b.text}`);
}

console.log('-'.repeat(70));
if (bad.length) {
  console.log(`${bad.length} lines contain a dash character that is not allowed in this repo.`);
  console.log('Use a comma, a period, a colon, or parentheses. If the line exists to STRIP these');
  console.log('characters, add the marker lint-prose-allow in a comment on that same line.');
  process.exit(1);
}
console.log('No em dashes, no en dashes, no dash entities.');
