#!/usr/bin/env node
/* NO FIGURE TYPED INTO PROSE ON A PAGE THAT CLAIMS ITS FIGURES ARE DERIVED.
 *
 * WHY THIS EXISTS. /health/day shipped on 2026-09-09 with a header comment reading "NOTHING BELOW
 * IS TYPED" and seven typed figures under it, six of them in the Limits section, whose entire
 * subject is that an undeclared number goes wrong quietly. One had already gone wrong: the bullet
 * about Samsung's daily score quoted the current year as paying 77 for a median 13,261 steps, which
 * is the 2024 pair. The current year reads lower on both. Typecheck, lint, build, a fifteen-gate
 * verify run and a full rendered text dump all passed with it in place, because none of them
 * compares a sentence against the data beside it.
 *
 * A prose claim about typed figures is decoration. This is the mechanism, per the meta-law in
 * .agents/ENGINEERING.md.
 *
 * WHAT IT CHECKS. The TypeScript parser, not a regex over the file: every JSX TEXT node (the
 * characters that actually render) and every string or template literal sitting inside a JSX
 * expression (the `{'43 to 372'}` shape). Anything with a run of two or more digits fails.
 *
 * WHY TWO DIGITS AND NOT ONE. "five separate hours" and "one calorie" are English; 2,592 and 0.996
 * and "October 2024" are data. A single digit in prose is almost always a word ("a 30 min stretch",
 * "1 in 10"), and a gate whose first live finding is a false positive teaches people to dismiss it,
 * which is the lesson already written into HOODII/CLAUDE.md about the bare-path hook.
 *
 * WHAT IT DOES NOT CATCH, stated so nobody reads a pass as more than it is: a number spelled as a
 * word, and a number computed in the page from two derived ones. Both are real; neither is the
 * class that shipped.
 *
 * TO ADD A PAGE: put it in PAGES with the reason it belongs there. Per the handoff of 2026-09-09,
 * every page built in the health fan-out lands here as it ships.
 *
 * Run: node scripts/lint-typed-figures.mjs           (checks PAGES)
 *      node scripts/lint-typed-figures.mjs --selftest (proves it refuses; runs first, always)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The pages whose prose must be derived, each with the reason it is here. */
const PAGES = [
  ['src/app/health/day/page.tsx', 'every figure comes from src/lib/health/daily.ts; its own header says so'],
];

/* THE ALLOWLIST IS EMPTY AND SHOULD STAY THAT WAY. An entry needs `why`, and "it is fine" is not a
 * why: say what the number is and why no query can return it. An entry with no `why` is refused by
 * the gate itself, so the list cannot quietly grow into a list of exceptions nobody reads. */
const ALLOW = [
  // { file: 'src/app/health/day/page.tsx', text: '390px', why: '...' },
];

const DIGITS = /\d{2,}/;

/** Every rendered string in a TSX source, with its position. The parser decides what renders, not a
 *  regex: a `>` in `(a, b) => a > b` and a `<` in `Record<string, unknown>` both look like tags. */
export function renderedStrings(fileName, source) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const push = (node, text) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ text, line: line + 1, col: character + 1 });
  };
  const inJsxExpression = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isJsxExpression(p)) return true;
      /* A function declared inside a JSX expression is code again, not prose: the callback in
         `{rows.map((r) => fmt(r, '2026'))}` is not a rendered sentence. */
      if (ts.isFunctionLike(p)) return false;
    }
    return false;
  };
  const walk = (node) => {
    if (ts.isJsxText(node)) {
      if (node.text.trim()) push(node, node.text);
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
        || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
      && inJsxExpression(node)
    ) {
      if (node.text.trim()) push(node, node.text);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return out;
}

/** The findings for one file. */
export function scan(file, source) {
  const allowed = ALLOW.filter((a) => a.file === file);
  const bad = allowed.filter((a) => !a.why || !a.why.trim());
  if (bad.length) {
    return [{ line: 0, col: 0, text: '', note: `ALLOW entry with no reason: ${JSON.stringify(bad[0])}` }];
  }
  return renderedStrings(file, source)
    .filter((s) => DIGITS.test(s.text))
    .filter((s) => !allowed.some((a) => s.text.includes(a.text)))
    .map((s) => ({ ...s, note: s.text.replace(/\s+/g, ' ').trim() }));
}

/* ---- the self-test, which runs on every invocation ------------------------------------------
 *
 * A gate that has only ever been seen to pass has not been seen to work. Half of these are cases it
 * must NOT flag, because that half is what a checker gets wrong: the `>` and `<` that are operators
 * and generics, and the digits inside an expression that IS the derivation.
 */
const CASES = [
  ['a typed year in prose', 'const A = () => <p>It starts in 2022 because.</p>;', true],
  ['a typed figure with a comma', 'const A = () => <p>all 296 days and 2,592 rows</p>;', true],
  ['a typed month and year', 'const A = () => <p>stopped being written in October 2024</p>;', true],
  ['a typed string inside a JSX expression', "const A = () => <p>{'43 to 372'} minutes</p>;", true],
  ['a derived figure', 'const A = ({ n }: { n: number }) => <p>{n} days under {FLOOR}</p>;', false],
  ['a derived figure with formatting', 'const A = ({ n }: { n: number }) => <p>{n.toFixed(2)}%</p>;', false],
  ['single digits in prose', 'const A = () => <p>it arrives 3 or 4 minutes at a time</p>;', false],
  /* Flagged on the first run too, and also right. "worst 1 in 10" labelled a column computed with
     `percentile_cont(0.10)`, so the label and the percentile were one decision written in two
     places. It is `1 in {TAIL_ONE_IN}` now, off the same constant the query uses. */
  ['a percentile spelled out beside its own query', 'const A = () => <td>bad day (worst 1 in 10)</td>;', true],
  /* This one flagged on its first run and the case was written expecting it to be clean. The gate
     was right: "a 30 min stretch" was a column heading on /health/day and 30 was also the threshold
     inside the query behind it, in two places, so changing one would have left the other lying.
     It is `STRETCH_MIN`, exported from daily.ts and rendered, now. */
  ['a threshold typed beside a query that uses it', 'const A = () => <th>Days with a 30 min stretch</th>;', true],
  ['a greater-than operator between components', 'const A = (a: number, b: number) => a > b ? <p>x</p> : <p>y</p>;', false],
  ['a generic that looks like a tag', 'const r: Record<string, number> = { a: 2026 };', false],
  ['a year inside a callback in a JSX expression', "const A = ({ g }: { g: string[] }) => <p>{g.filter((x) => x === '2020').length}</p>;", false],
  ['a className with digits', 'const A = () => <p className="p50">ok</p>;', false],
];

function selftest() {
  let failed = 0;
  for (const [name, src, shouldFlag] of CASES) {
    const hits = renderedStrings('case.tsx', src).filter((s) => DIGITS.test(s.text));
    const flagged = hits.length > 0;
    if (flagged !== shouldFlag) {
      failed++;
      console.error(`  selftest FAIL: ${name} -> ${flagged ? 'flagged' : 'clean'}, expected ${shouldFlag ? 'flagged' : 'clean'}`);
      if (flagged) console.error(`    saw: ${hits.map((h) => JSON.stringify(h.text)).join(', ')}`);
    }
  }
  if (failed) {
    console.error(`\nlint-typed-figures selftest: ${failed} of ${CASES.length} cases wrong. The gate is broken; fix it before trusting a pass.`);
    process.exit(1);
  }
  return CASES.length;
}

const n = selftest();
if (process.argv.includes('--selftest')) {
  console.log(`lint-typed-figures selftest: ${n} cases, all correct.`);
  process.exit(0);
}

let findings = 0;
for (const [file, why] of PAGES) {
  const abs = join(ROOT, file);
  const hits = scan(file, readFileSync(abs, 'utf8'));
  for (const h of hits) {
    findings++;
    console.error(`${relative(ROOT, abs)}:${h.line}:${h.col}  ${h.note}`);
  }
  if (!hits.length) console.log(`  ${file} clean (${why})`);
}

if (findings) {
  console.error(
    `\n${findings} typed figure(s) in rendered prose. Every number these pages print must come back\n` +
    'from a query, so it moves when his data moves. Derive it, or say the thing without the number.\n' +
    'If a figure genuinely cannot be derived, add it to ALLOW with a reason that says why not.',
  );
  process.exit(1);
}
console.log(`lint-typed-figures: ${PAGES.length} page(s), ${n} selftest cases, no typed figures.`);
