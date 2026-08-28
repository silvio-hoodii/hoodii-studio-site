#!/usr/bin/env node
/* NO COLOUR LITERAL OUTSIDE globals.css. The tokens are the design system, or they are a suggestion.
 *
 * WHY THIS EXISTS. The 2026-08-26 UX audit swept all twelve per-surface CSS files, every inline
 * style and every Tailwind arbitrary value byte by byte, and found the codebase CLEAN: zero hex, rgb,
 * hsl, oklch or named-colour literals outside `src/app/globals.css`, the five layout `themeColor`
 * exports and the four documented mirrors in `opengraph-image.tsx`. That is the good news and it is
 * also the finding (08-ux-ui P2-5): the state is maintained purely by vigilance, and vigilance decays.
 *
 * It has already failed once. `src/app/french/french.css`'s own header records that the surface
 * arrived carrying its own blue and green palette and had to be collapsed onto the tokens by hand.
 * `scripts/lint-classnames.mjs` deliberately scopes itself to layout-affecting collisions and says so,
 * so no gate would catch the next `#faf6f0`. AGENTS.md states the rule at length ("The palette is a
 * decision, not a default", "must consume the tokens, never hardcode a colour") and prose rules in
 * this workspace have been violated repeatedly while every mechanical gate has held.
 *
 * TWO LEGITIMATE EXCEPTIONS, both allowed by marker rather than by path, so the exception is visible
 * in a diff instead of living in this file where nobody rereads it. Same idiom as lint-prose's
 * `lint-prose-allow`:
 *
 *   `src/app/opengraph-image.tsx`  an ImageResponse renders outside the document and cannot read a
 *                                  CSS variable. The four literals there mirror the tokens.
 *   the five layout `themeColor`   a viewport export is consumed by the browser chrome, not by CSS.
 *
 * Marker: `lint-tokens-allow` in a comment on the same line.
 *
 *   node scripts/lint-tokens.mjs             # wired into `pnpm build`
 *   node scripts/lint-tokens.mjs --selftest  # runs first on every invocation anyway
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const TOKEN_FILE = join('src', 'app', 'globals.css').split(sep).join('/');

const rel = (p) => relative(ROOT, p).split(sep).join('/');

/* THE NAMED COLOURS ARE THE ONES THAT ACTUALLY GET TYPED. All 148 CSS names would put `tan`, `red`
 * and `plum` in the way of every English word in a comment or a class name, and the check runs on
 * declaration VALUES only, so a short list of the plausible ones is the right trade. `transparent`,
 * `currentColor` and `inherit` are not colours in the sense this rule cares about: they carry no
 * palette decision. */
const NAMED = [
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown',
  'grey', 'gray', 'cyan', 'magenta', 'teal', 'navy', 'olive', 'maroon', 'lime', 'silver',
  'gold', 'beige', 'ivory', 'salmon', 'coral', 'crimson', 'indigo', 'violet', 'khaki', 'tan',
];

/* A hex triple/quad, or any of the functional colour notations. `#` plus 3, 4, 6 or 8 hex digits;
 * rgb/rgba/hsl/hsla/hwb/lab/lch/oklab/oklch/color-mix... except `color-mix`, which is how this repo
 * legitimately derives a translucent token from another token, so it is excluded by name. */
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/i;
const NAMED_RE = new RegExp(`(?:^|[\\s:,(])(${NAMED.join('|')})(?=$|[\\s;,)])`, 'i');

/** Every colour literal on one line of CSS, or an empty array. `line` is a raw source line. */
export function colourLiteralsInCss(line) {
  const hits = [];
  /* COMMENTS COME OUT FIRST, and this was the check's one false positive on its first live run:
   * kitchen.css line 13 reads "* Two colours only, both meaning something: green is \"you may
   * proceed\", red is ..." and the colon in that sentence made everything after it a declaration
   * value. Every file this rule protects explains its palette in prose, so a rule that flags its own
   * documentation gets dismissed. Same reason scripts/lint-auth.mjs strips comments. */
  const bare = line.replace(/\/\*.*?(?:\*\/|$)/g, ' ').replace(/^\s*\*.*$/, ' ');
  /* Only the VALUE half of a declaration. A selector may legitimately be `.flav-brown` and a
   * custom-property NAME may be `--signal`. Split on the first colon and look to the right of it. */
  const colon = bare.indexOf(':');
  if (colon === -1) return hits;
  let value = bare.slice(colon + 1);
  /* `color-mix(in srgb, var(--signal) 45%, transparent)` is the sanctioned way to derive a
   * translucent shade FROM a token, and this repo uses it. Strip the wrapper so its arguments are
   * still checked: a literal inside a color-mix is still a literal. */
  value = value.replace(/color-mix\s*\(\s*in\s+[a-z-]+\s*,?/gi, ' ');

  const hex = HEX.exec(value);
  if (hex) hits.push(hex[0]);
  const fn = FUNC.exec(value);
  if (fn) hits.push(fn[0].trim());
  const named = NAMED_RE.exec(value);
  if (named) hits.push(named[1]);
  return hits;
}

/** Colour literals in TS/TSX: a Tailwind arbitrary value, or any string that IS a colour.
 *
 *  THE PROPERTY-NAME VERSION OF THIS MISSED THE REAL ONES. It looked for `color:`, `fill:`,
 *  `themeColor:` and friends, and `src/app/opengraph-image.tsx` holds
 *  `const BACKGROUND = '#fdfcfa';` plus three more, which is exactly the shape a future agent would
 *  write when adding an accent to a component. A rule that only sees the JSX style prop does not see
 *  the constant above it, and the constant is where a palette actually gets reintroduced.
 *
 *  So: any string literal whose ENTIRE value is a hex colour, plus any string containing a colour
 *  function. "Entire value" rather than "contains", because `href="#abc"` is a valid three-hex-digit
 *  string and an anchor, not a colour, and `#dad`, `#face` and `#beef` are all plausible fragment
 *  names. The anchor-shaped attribute names are excluded outright as well, so both halves have to
 *  agree before this fires.
 *
 *  Named colours are deliberately NOT checked in TS/TSX. A .tsx line is mostly prose and identifiers,
 *  and `'brown sugar'` or `'redis'` would fire constantly. In CSS, where the check reads declaration
 *  values only, named colours are safe to catch and are caught. */
export function colourLiteralsInTsx(line) {
  const hits = [];
  /* Tailwind arbitrary colour: `text-[#d86a2f]`, `bg-[rgb(1,2,3)]`. */
  const arb = /-\[(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch)\([^\]]*\))\]/.exec(line);
  if (arb) hits.push(arb[1]);

  const anchorish = /\b(?:href|hash|anchor|fragment|slug)\s*[=:]/.test(line);
  for (const m of line.matchAll(/(['"`])([^'"`\n]*)\1/g)) {
    const v = m[2];
    if (FUNC.test(v)) { hits.push(v); continue; }
    if (!anchorish && /^\s*#[0-9a-fA-F]{3,8}\s*$/.test(v)) hits.push(v.trim());
  }
  return hits;
}

/* ---- both directions, before anything else runs ------------------------------------------------
 *
 * `lint-classnames.mjs` learned this the hard way and wrote it down: its first version did not work,
 * and an adversarial pass proved it the same day by running it against a probe tree. A gate nobody
 * tested against a real positive is not a gate. So the selftest asserts BOTH that real literals are
 * caught and that the legitimate shapes this repo actually contains are not. */
const SELFTEST = [
  // must be caught
  ['css', 'color: #d86a2f;', true],
  ['css', '  background: #FFF;', true],
  ['css', 'border: 1px solid rgb(10, 20, 30);', true],
  ['css', 'color: oklch(0.7 0.1 200);', true],
  ['css', 'color: white;', true],
  ['css', 'background: var(--x, #eee);', true],
  ['css', 'background: color-mix(in srgb, #eee 45%, transparent);', true],
  ['tsx', "style={{ color: '#fff' }}", true],
  ['tsx', 'className="text-[#d86a2f]"', true],
  ['tsx', "themeColor: '#ffffff',", true],
  // must NOT be caught
  ['css', 'color: var(--foreground);', false],
  ['css', 'background: color-mix(in srgb, var(--signal) 45%, transparent);', false],
  ['css', 'border-color: transparent;', false],
  ['css', 'color: currentColor;', false],
  ['css', '.reading .flav-brown { }', false],
  ['css', '/* the browned beef reads as brown here */', false],
  ['css', '  --signal: oklch(0.72 0.15 150);', true],   // a token DEFINITION is a literal, and only globals.css may hold one
  ['tsx', "const label = 'brown sugar';", false],
  ['tsx', "const BACKGROUND = '#fdfcfa';", true],
  ['tsx', '<a href="#faq">FAQ</a>', false],
  ['tsx', '<a href="#beef">beef</a>', false],
  ['tsx', "const hash = '#dad';", false],
  ['tsx', "const ACCENT = 'rgb(1, 2, 3)';", true],
  ['tsx', '<div className="flav flav-myth" />', false],
  ['tsx', "style={{ color: 'var(--muted-foreground)' }}", false],
  ['tsx', "  id: 'redis',", false],
];

let selftestFailed = 0;
for (const [kind, line, shouldCatch] of SELFTEST) {
  const hits = kind === 'css' ? colourLiteralsInCss(line) : colourLiteralsInTsx(line);
  const caught = hits.length > 0;
  if (caught !== shouldCatch) {
    console.error(`SELFTEST FAIL  ${kind}  expected ${shouldCatch ? 'a catch' : 'no catch'}: ${line}`);
    selftestFailed++;
  }
}
if (selftestFailed) {
  console.error(`\n${selftestFailed} selftest case(s) failed. The check is not trustworthy; not running it.`);
  process.exit(1);
}
if (process.argv.includes('--selftest')) {
  console.log(`selftest: ${SELFTEST.length} cases, 0 failed`);
  process.exit(0);
}

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (/\.(css|tsx?)$/.test(e)) files.push(full);
  }
})(SRC);

let fail = 0;
let checked = 0;
for (const full of files) {
  const path = rel(full);
  /* globals.css IS the palette. Every literal in it is a token definition, which is the whole point
   * of having one file that holds them. */
  if (path === TOKEN_FILE) continue;
  const isCss = path.endsWith('.css');
  checked++;

  readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (line.includes('lint-tokens-allow')) return;
    const hits = isCss ? colourLiteralsInCss(line) : colourLiteralsInTsx(line);
    if (!hits.length) return;
    console.error(`FAIL  ${path}:${i + 1}  colour literal: ${hits.join(', ')}`);
    console.error(`        ${line.trim().slice(0, 100)}`);
    fail++;
  });
}

console.log('-'.repeat(70));
if (fail) {
  console.log(`${fail} colour literal(s) outside ${TOKEN_FILE}.`);
  console.log('The palette is a decision, not a default: cream plus terra-cotta plus serif plus');
  console.log('rounded cards was removed on 2026-08-09 after research named it as the current');
  console.log('AI-generated tell. Use a token from globals.css, or add one there.');
  console.log('If the literal is genuinely unavoidable (an ImageResponse cannot read a CSS');
  console.log('variable), put lint-tokens-allow in a comment on the same line.');
  process.exit(1);
}
console.log(`${checked} file(s) checked, no colour literal outside ${TOKEN_FILE}.`);
