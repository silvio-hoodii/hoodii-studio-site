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
 * THE FIRST VERSION OF THIS FILE DID NOT WORK, and an adversarial pass proved it the same day by
 * running it against a probe tree. It missed `className={`timer-bar${on ? '' : ' hidden'}`}`, which
 * is the shape of the code sitting two lines from the bug it was written for: the outer template
 * matched as one literal and the interpolation was stripped whole, taking the `' hidden'` inside it
 * with it. A gate nobody tested against a real positive is not a gate. Both directions are now
 * checked in `--selftest`, which runs first every time this script runs.
 *
 * What it still cannot see, stated plainly rather than left to be discovered: a class name that
 * only exists at runtime (`className={props.variant}`), and anything injected as raw HTML. Keep
 * class names literal in JSX and this reaches them.
 *
 * The list below is deliberately narrow: utilities that set display, visibility, position, float,
 * overflow or size, which are the ones that fail SILENTLY and look like a layout bug rather than a
 * naming bug. Colour and spacing collisions are visible the moment you look at the page.
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
  // float / clear
  'float-left', 'float-right', 'float-none', 'clear-both', 'clear-left', 'clear-right',
  // overflow
  'overflow-hidden', 'overflow-auto', 'overflow-scroll', 'overflow-visible', 'overflow-clip',
  // size and flex, which silently collapse or stretch a box
  'w-full', 'h-full', 'w-0', 'h-0', 'flex-1', 'grow', 'shrink', 'basis-0',
  // painted-but-unreachable
  'opacity-0', 'pointer-events-none', 'truncate', 'sr-only', 'not-sr-only',
  // layout container with its own max-widths
  'container',
]);

const FORBIDDEN_PATTERNS = [/^overflow-[xy]-(auto|hidden|clip|scroll|visible)$/];

const forbidden = (t) => FORBIDDEN.has(t) || FORBIDDEN_PATTERNS.some((re) => re.test(t));

/* Every class name a literal can contribute, INCLUDING the strings inside a template's `${...}`
 * expressions, which is the part the first version threw away. */
function literalTokens(text) {
  const out = [];
  const re = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[3] !== undefined) {
      const body = m[3];
      for (const expr of body.matchAll(/\$\{([\s\S]*?)\}/g)) out.push(...literalTokens(expr[1]));
      out.push(...body.replace(/\$\{[\s\S]*?\}/g, ' ').split(/[^a-zA-Z0-9_-]+/));
    } else {
      out.push(...(m[1] ?? m[2] ?? '').split(/[^a-zA-Z0-9_-]+/));
    }
  }
  return out.filter(Boolean);
}

/* The whole className value, brace-balanced, so a multi-line ternary is one chunk rather than a
 * line the per-line regex gave up on. */
function classNameChunks(src) {
  const chunks = [];
  const re = /className\s*=\s*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const i = m.index + m[0].length;
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1);
      if (end !== -1) chunks.push({ index: i, text: src.slice(i, end + 1) });
    } else if (ch === '{') {
      let depth = 0;
      let j = i;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
      chunks.push({ index: i, text: src.slice(i, j + 1) });
    }
  }
  return chunks;
}

/* A class string assembled into a variable never reaches the check above. This catches the common
 * spelling of that, where the variable is visibly a class name.
 *
 * Deliberately does NOT match `className` itself. That form is already covered by the chunk scan,
 * and including it made this fire on `<div className="meta" style={{ display: 'flex' }}>`: the
 * literal `'flex'` in an inline style is not a class name, and a gate that reports it is a gate
 * that gets switched off. */
const CLASS_VAR = /\b(cls|clsx|classes|classNames|klass|cn)\b/;

function scan(file) {
  const src = readFileSync(file, 'utf8');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  const lines = src.split('\n');
  const found = [];
  const seen = new Set();

  const report = (line, token) => {
    const key = `${line}:${token}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ file, line, token, source: (lines[line - 1] ?? '').trim() });
  };

  for (const chunk of classNameChunks(src)) {
    for (const token of literalTokens(chunk.text)) {
      if (forbidden(token)) report(lineOf(chunk.index), token);
    }
  }
  lines.forEach((line, i) => {
    if (!CLASS_VAR.test(line)) return;
    for (const token of literalTokens(line)) {
      if (forbidden(token)) report(i + 1, token);
    }
  });
  return found;
}

/* Both directions, every run. A gate that has never been shown to fail is a gate nobody has
 * checked, and the first version of this file passed clean while missing the case it existed for. */
function selftest() {
  const mustCatch = [
    ['className="collapse"', 'collapse'],
    ['className={`timer-bar${timer ? \'\' : \' hidden\'}`}', 'hidden'],
    ['const cls = `panel${sticky ? \' fixed\' : \'\'}`;', 'fixed'],
    ["className={cn('card', 'absolute')}", 'absolute'],
    ["className={\n  on ? 'collapse' : 'open'\n}", 'collapse'],
    ["className={`x ${a ? 'overflow-y-hidden' : ''}`}", 'overflow-y-hidden'],
  ];
  const mustPass = [
    "className={`exgroup${b.type === 'superset' || b.type === 'pair' ? ' tied' : ''}`}",
    'className="save-blocked stick"',
    'className={`timer-bar${timer ? \'\' : \' off\'}`}',
    "const label = 'this block is fixed in place';",
    // An inline style is not a class list. This one shipped as a false positive for one run.
    `<div className="meta" style={{ display: 'flex', position: 'relative' }}>`,
  ];
  const hits = (text) => {
    const out = [];
    for (const c of classNameChunks(text)) out.push(...literalTokens(c.text).filter(forbidden));
    for (const line of text.split('\n')) {
      if (CLASS_VAR.test(line)) out.push(...literalTokens(line).filter(forbidden));
    }
    return out;
  };
  const failures = [];
  for (const [text, token] of mustCatch) {
    if (!hits(text).includes(token)) failures.push(`missed "${token}" in: ${text.replace(/\n/g, ' ')}`);
  }
  for (const text of mustPass) {
    const h = hits(text);
    if (h.length) failures.push(`false positive ${JSON.stringify(h)} on: ${text}`);
  }
  if (failures.length) {
    console.error('\nclassname lint SELFTEST FAILED. The gate is not checking what it claims:\n');
    for (const f of failures) console.error('  ' + f);
    console.error('');
    process.exit(2);
  }
  return mustCatch.length + mustPass.length;
}

const checked = selftest();

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|jsx|ts|js)$/.test(p)) files.push(p);
  }
})('src');

const problems = files.flatMap(scan);

if (problems.length) {
  console.error(`\nclassname lint: ${problems.length} collision${problems.length === 1 ? '' : 's'} with a Tailwind utility.\n`);
  for (const p of problems) console.error(`  ${p.file}:${p.line}  class "${p.token}" is a Tailwind utility\n    ${p.source}\n`);
  console.error('These names silently change display, visibility, position or size. Rename the class.');
  console.error('Precedent: "collapse" hid three blocks on /gym for days while measuring correctly.\n');
  process.exit(1);
}

console.log(`${files.length} files checked (${checked} selftest cases), no class name collides with a Tailwind utility`);
