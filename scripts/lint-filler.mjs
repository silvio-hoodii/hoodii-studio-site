#!/usr/bin/env node
/* CAPTIONS THAT DESCRIBE THE DATA INSTEAD OF SAYING SOMETHING ABOUT HIM.
 *
 * HIS RULING, 2026-09-09, reading the Weight tab: "Both readings are watch readings, or both
 * figures come from the same reading, or phrases like neither line is measured directly, small
 * current, whatever ... you're saying this is recorded from the watch. Okay, good to know. That's
 * not an insight. That's just blur that doesn't help me in any way. ... This happens across the
 * whole app, probably not only on body. It's also probably on lifting and on everything: text that
 * serves no purpose at all, because I want insights ... So that's a thing that should be taken care
 * of in every single page, every single section of the app."
 *
 * WHAT IT LOOKS FOR. The three sentences he named share one property: they describe where a number
 * came from and they contain NO NUMBER. So this reports caption-class elements whose rendered text
 * runs past a threshold while containing no JSX expression at all: prose on a data surface that
 * derives nothing. That is not a proof of filler, but it is where filler lives, and it is
 * mechanical rather than a matter of taste.
 *
 * A REPORT, NOT A GATE, and deliberately. Every gate in this repo judges something decidable: an
 * exit code, a row count, a digit in a text node. This one judges prose, and a checker that is
 * wrong on its first findings is a checker nobody runs again, which this repo has written down
 * twice. Exit code is always 0 unless --gate is passed.
 *
 *   node scripts/lint-filler.mjs              report every page, worst first
 *   node scripts/lint-filler.mjs --page /health
 *   node scripts/lint-filler.mjs --min 200    only the long ones
 *
 * The full ruling, including why these sentences were written and where they should live instead,
 * is HealthOS/knowledge/fanout-2026-09/00b-no-filler-ruling.md.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const MIN = Number(flag('--min', '110'));
const only = flag('--page', null);

/* The classes this site uses for a caption under or beside a figure. `.ex-cue` is the workhorse;
 * `.chart-cap` labels a chart; `.rules` is the limits list; `.caption` and `.quiet` appear on the
 * reading and kitchen surfaces. Headings and links are not captions and are not looked at. */
const CAPTION = /\b(ex-cue|chart-cap|caption|rules|lede|quiet|note)\b/;

function classOf(el) {
  const attrs = el.attributes?.properties ?? [];
  for (const a of attrs) {
    if (ts.isJsxAttribute(a) && a.name.getText() === 'className' && a.initializer) {
      if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
    }
  }
  return '';
}

/** Text a caption renders, and whether any of it is derived. */
function captionText(node) {
  let text = '';
  let expressions = 0;
  const walk = (n) => {
    if (ts.isJsxText(n)) text += n.text;
    else if (ts.isJsxExpression(n)) {
      /* `{' '}` and `{' '}` are spacing, not derivation. A caption whose only expressions are
         whitespace is exactly as undereived as one with none, and the first draft scored those as
         clean, which would have hidden the longest offenders. */
      const inner = n.expression;
      const isSpacer = inner && (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner))
        && !inner.text.trim();
      if (isSpacer) { text += ' '; return; }
      if (inner) expressions++;
      return;
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(node, walk);
  return { text: text.replace(/\s+/g, ' ').trim(), expressions };
}

const files = execSync('git ls-files "src/app/**/*.tsx"', { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .filter((f) => !only || f.includes(only.replace(/^\//, '')));

const findings = [];
for (const f of files) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const walk = (n) => {
    if (ts.isJsxElement(n) && CAPTION.test(classOf(n.openingElement))) {
      const { text, expressions } = captionText(n);
      if (expressions === 0 && text.length >= MIN) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        findings.push({ file: f, line: line + 1, chars: text.length, text });
      }
      return; // do not descend into a caption we already scored
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}

findings.sort((a, b) => b.chars - a.chars);
const byFile = new Map();
for (const x of findings) byFile.set(x.file, (byFile.get(x.file) ?? 0) + x.chars);

console.log(`${findings.length} caption(s) of ${MIN}+ characters deriving nothing, across ${byFile.size} file(s).\n`);
console.log('worst files, by characters of underived caption:');
for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(5)}  ${f}`);
}
console.log('\nlongest individual captions:');
for (const x of findings.slice(0, 15)) {
  console.log(`\n  ${x.file}:${x.line}  (${x.chars} chars)`);
  console.log(`    ${x.text.slice(0, 190)}${x.text.length > 190 ? '...' : ''}`);
}
console.log(`\nTOTAL: ${findings.reduce((s, x) => s + x.chars, 0)} characters of caption that derive nothing.`);
console.log('Deletion is the default. A caveat that changes how a figure is read gets folded INTO');
console.log('that figure\'s sentence; provenance goes in the source comment. See');
console.log('HealthOS/knowledge/fanout-2026-09/00b-no-filler-ruling.md');

if (argv.includes('--gate') && findings.length) process.exit(1);
