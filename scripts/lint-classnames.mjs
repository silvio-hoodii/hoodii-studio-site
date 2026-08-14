#!/usr/bin/env node
/* Refuse to build when a hand-written class name collides with a Tailwind utility that changes
 * whether or where an element renders.
 *
 * The incident, 2026-08-14. /gym had a ~650px blank gap that Silvio saw on his own phone and a full
 * audit could not explain from the code. The warmup, cooldown and RIR blocks were `<details
 * className="collapse">`, a name chosen to mean "this folds". Tailwind ships `.collapse` as
 * `visibility: collapse`, which on a non-table element hides the subtree while it keeps its space.
 * Three blocks were invisible and reserving 823px between them.
 *
 * It had already been misdiagnosed once. On 2026-08-11 the warmup and cooldown were reported
 * missing, and the fix was to add `open` to the disclosures, whose own commit note says they "were
 * present the whole time". They were. They were also invisible, and the second half went unnoticed
 * for three more days, because everything about the markup, the CSS and the DOM measurements looks
 * correct: the text is there, the height is there, and only a screenshot shows nothing.
 *
 * A prose rule saying "do not name a class after a Tailwind utility" would not have caught it. This
 * runs on every build. See HOODII/.agents/ENGINEERING.md law 1: eliminate the class of error.
 *
 * The list below is deliberately narrow: utilities that set display, visibility, position, float or
 * overflow, which are the ones that fail SILENTLY and look like a layout bug rather than a naming
 * bug. Colour and spacing collisions are visible the moment you look at the page.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = new Set([
  // visibility
  'collapse', 'invisible', 'visible',
  // display
  'hidden', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid',
  'table', 'inline-table', 'table-row', 'table-cell', 'table-caption', 'contents', 'flow-root',
  'list-item',
  // position
  'static', 'fixed', 'absolute', 'relative', 'sticky', 'isolate',
  // float / clear / overflow
  'float-left', 'float-right', 'float-none', 'clear-both', 'overflow-hidden', 'overflow-auto',
  'overflow-scroll', 'overflow-visible',
  // content-clipping utilities that swallow text
  'truncate', 'sr-only', 'not-sr-only',
]);

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(p)) files.push(p);
  }
})('src');

/* Only what is actually written as text becomes a class name, so the check reads the string
 * LITERALS in a className and nothing else. Taking every identifier instead reports `block.type`
 * inside `className={`exgroup${block.type === ...}`}` as a class named "block", which is how the
 * first version of this file failed: a linter that cries wolf gets switched off, and then it is
 * decoration.
 *
 * Covers all three spellings in this codebase: className="a b", className={`a ${x ? 'b' : ''}`},
 * and className={cn('a', b)}. Anything a value carries at runtime is out of reach of any linter,
 * which is a reason to keep class names literal in JSX. */
function literalTokens(fragment) {
  const literals = fragment.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? [];
  const words = [];
  for (const lit of literals) {
    // Inside a template literal the ${...} parts are expressions; their own quoted strings were
    // already picked up by the match above, so dropping the interpolations here loses nothing.
    const text = lit.slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
    words.push(...text.split(/[^a-zA-Z0-9_-]+/).filter(Boolean));
  }
  return words;
}

const problems = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const matches = line.match(/className=(?:"[^"]*"|\{[^\n]*)/g);
    if (!matches) return;
    const seen = new Set();
    for (const raw of matches) {
      for (const token of literalTokens(raw)) {
        if (FORBIDDEN.has(token) && !seen.has(token)) {
          seen.add(token);
          problems.push(`${file}:${i + 1}  class "${token}" is a Tailwind utility\n    ${line.trim()}`);
        }
      }
    }
  });
}

if (problems.length) {
  console.error(`\nclassname lint: ${problems.length} collision${problems.length === 1 ? '' : 's'} with a Tailwind utility.\n`);
  for (const p of problems) console.error('  ' + p + '\n');
  console.error('These names silently change display, visibility or position. Rename the class.');
  console.error('Precedent: "collapse" hid three blocks on /gym for days while measuring correctly.\n');
  process.exit(1);
}

console.log(`${files.length} components checked, no class name collides with a Tailwind utility`);
