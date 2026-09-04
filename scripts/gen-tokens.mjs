#!/usr/bin/env node
/* THE PALETTE, CONVERTED TO HEX ONCE, BY A MACHINE.
 *
 * WHY THIS EXISTS, and it is not tidiness. `src/app/globals.css` holds every colour as `oklch()`.
 * Four places cannot read a CSS custom property and need a hex: an `ImageResponse` (the share card
 * and both icons) renders in satori with no stylesheet and no cascade, and a `themeColor` viewport
 * export is read by the browser chrome. So the tokens got converted by hand and the comment in
 * `opengraph-image.tsx` said they were "the token values converted once".
 *
 * ALL FOUR WERE WRONG, found 2026-09-04. The file claimed:
 *
 *     --background        #fdfcfa   the token converts to #fdfdfc
 *     --foreground        #262420   the token converts to #141412
 *     --muted-foreground  #807d78   the token converts to #72726f
 *     --signal            #00784a   the token converts to #007142
 *
 * Every one is wrong in the WARM direction, because every one is a leftover from the cream palette
 * that was deleted on 2026-08-09. So the share card, the single surface seen by people who have not
 * chosen to visit the site, had been rendering in the retired palette for a month while the comment
 * above it asserted it mirrored the current one. `lint-tokens.mjs` allowed all four by marker and
 * was right to: they are legitimate exceptions. A marker says a literal is ALLOWED to be there. It
 * cannot say the literal is CORRECT.
 *
 * That is the class, and it is the same disease as `inProgramme`, the body-metrics copies and the
 * immigration dates: every copy of a fact is a fact that goes stale silently. So no copy. This
 * derives the hex from the token and writes it out, `--check` refuses a stale file, and `pnpm build`
 * runs `--check`. A palette change that is not regenerated now fails the build instead of shipping a
 * share card in last month's colours.
 *
 *   node scripts/gen-tokens.mjs           # write src/lib/tokens.generated.ts
 *   node scripts/gen-tokens.mjs --check   # exit 1 if the file on disk is stale. In `pnpm build`
 *   node scripts/gen-tokens.mjs --selftest
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CSS = join(ROOT, 'src', 'app', 'globals.css');
const OUT = join(ROOT, 'src', 'lib', 'tokens.generated.ts');

/* ---- oklch -> sRGB hex -------------------------------------------------------------------------
 *
 * The standard OKLab pipeline: OKLCh -> OKLab -> LMS -> linear sRGB -> gamma-encoded sRGB. The
 * matrices are Björn Ottosson's published ones. Out-of-gamut channels are CLAMPED, which is correct
 * for this use: every token in this palette is in gamut, and a clamp on a token that is not is a
 * visibly wrong colour rather than a silent NaN.
 */
export function oklchToHex(L, C, H, alpha = 1) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  const byte = (v) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');

  const rgb = linear
    .map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055))
    .map(byte)
    .join('');

  /* Opaque colours stay six digits, so the common case reads like a normal hex and diffs against
     the old hand-typed values line up character for character. */
  return '#' + rgb + (alpha >= 1 ? '' : byte(alpha));
}

/** `oklch(0.19 0.004 100)` -> `[L, C, H, alpha]`, or null for anything else.
 *
 *  Alpha is read because the dark block needs it: `--border: oklch(1 0 0 / 12%)` and `--input` at
 *  16% are translucent by design, and refusing them left DARK two tokens short of LIGHT with
 *  nothing saying so. It emits an 8-digit hex, which satori and `<meta name="theme-color">` both
 *  accept. Alpha may be a percentage or a 0-to-1 number, per the CSS syntax.
 *
 *  Otherwise deliberately narrow: no `none`, no percentage lightness, no nested `var()`. It returns
 *  null rather than guessing, so a token this cannot read surfaces as "not converted" rather than
 *  as a plausible wrong colour. */
export function parseOklch(value) {
  const m = /^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*(?:\/\s*([0-9.]+)(%?)\s*)?\)$/i.exec(value.trim());
  if (!m) return null;
  const nums = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (nums.some((n) => Number.isNaN(n))) return null;
  if (m[4] === undefined) return [...nums, 1];
  const raw = Number(m[4]);
  if (Number.isNaN(raw)) return null;
  return [...nums, m[5] === '%' ? raw / 100 : raw];
}

/** Every `--name: value` declaration inside the FIRST block opened by `selector`.
 *
 *  Brace-counted rather than regex-to-the-next-`}`, because the dark block's `--border-strong`
 *  holds a `color-mix(...)` with parentheses in it, and the light block sits above `@theme inline`.
 *  A non-greedy match to the first `}` would have truncated whichever block gained a nested rule
 *  first, and it would have truncated it SILENTLY, which is the failure shape this repo keeps
 *  finding (the swim source read to its fourth bullet and shipped). */
export function declarationsIn(css, selector) {
  /* A RegExp rather than a substring where the substring is not unique, which cost the first run of
   * this script. `@custom-variant dark (@media (prefers-color-scheme: dark));` was added to the top
   * of globals.css in the same edit that made the dark block a media query, and it CONTAINS the
   * media condition. `indexOf` found that line, brace-counted from the next `{`, and returned the
   * `@theme inline` block: 34 declarations, not one of them an oklch literal. So DARK generated as
   * an empty object, the script printed "Wrote ... dark: 0 colour tokens" and exited 0.
   *
   * Both the selftest and the conversion were fine. The locator was wrong, and a locator that finds
   * the wrong block returns valid-looking nothing. That is why `assertParallel` below exists. */
  const at = selector instanceof RegExp ? css.search(selector) : css.indexOf(selector);
  if (at === -1) throw new Error(`gen-tokens: selector not found in globals.css: ${selector}`);
  const open = css.indexOf('{', at);
  if (open === -1) throw new Error(`gen-tokens: no block for selector ${selector}`);
  let depth = 0;
  let end = -1;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`gen-tokens: unclosed block for selector ${selector}`);

  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/** The token map for one block: every `--name` whose value is an oklch literal, as hex.
 *
 *  A token that is NOT an oklch literal is skipped and reported. `--card-foreground: var(--foreground)`,
 *  `--border-strong: color-mix(...)`, `--radius`, `--measure` and `--gap` are all legitimately not
 *  convertible, and none of them is ever needed by a satori render or the browser chrome. */
export function hexTokens(css, selector) {
  const decls = declarationsIn(css, selector);
  const hex = {};
  const skipped = [];
  for (const [name, value] of Object.entries(decls)) {
    const parsed = parseOklch(value);
    if (parsed) hex[name] = oklchToHex(...parsed);
    else skipped.push(name);
  }
  return { hex, skipped };
}

/* ---- both directions, before anything else runs ------------------------------------------------
 *
 * Same reasoning as lint-tokens.mjs and content/gym/validate.test.mjs: a gate that has only ever
 * been seen to pass may be matching nothing. The conversion cases below are checked against values
 * this repo can verify INDEPENDENTLY rather than against this function's own output:
 *
 *   - #fdfdfc for --background is what Lighthouse reported as the measured background colour of
 *     /swim on 2026-09-04, while flagging the .tag contrast failure. Two implementations agree.
 *   - #9c9b99 is what the same Lighthouse run reported for that .tag text, which is
 *     --muted-foreground at the 0.7 opacity training.css puts on it: 0.7*0x72 + 0.3*0xfd = 0x9c.
 *     So the muted-foreground conversion is confirmed by a third measurement of a fourth value.
 *   - pure black and pure white are exact by definition.
 *   - oklch(0.628 0.2577 29.23) is the published OKLCh of sRGB red.
 */
const SELFTEST = [
  ['oklch(1 0 0)', '#ffffff'],
  ['oklch(0 0 0)', '#000000'],
  ['oklch(0.993 0.0015 100)', '#fdfdfc'],
  ['oklch(0.55 0.004 100)', '#72726f'],
  ['oklch(0.628 0.2577 29.23)', '#ff0000'],
  /* Alpha, both notations, and the opaque case must NOT grow a trailing ff. */
  ['oklch(1 0 0 / 12%)', '#ffffff1f'],
  ['oklch(1 0 0 / 0.12)', '#ffffff1f'],
  ['oklch(1 0 0 / 100%)', '#ffffff'],
];

let selftestFailed = 0;
for (const [input, expected] of SELFTEST) {
  const parsed = parseOklch(input);
  const got = parsed ? oklchToHex(...parsed) : '(unparsed)';
  if (got !== expected) {
    console.error(`SELFTEST FAIL  ${input}  expected ${expected}, got ${got}`);
    selftestFailed++;
  }
}
/* The parser must REFUSE what it cannot read, rather than returning a plausible number. */
for (const bad of ['var(--foreground)', 'color-mix(in srgb, var(--foreground) 32%, var(--background))', '0.25rem', 'oklch(none 0 0)']) {
  if (parseOklch(bad) !== null) {
    console.error(`SELFTEST FAIL  ${bad}  should not parse as an oklch colour`);
    selftestFailed++;
  }
}

/* THE LOCATOR, AGAINST THE EXACT SHAPE THAT DEFEATED IT. A substring search for the media condition
 * finds the `@custom-variant` line first and brace-counts the wrong block. This asserts the
 * line-anchored form reads the media rule and not the decoy, on a fixture that holds both in the
 * order globals.css holds them. Without this case the bug is invisible: the script exits 0. */
const FIXTURE = `@custom-variant dark (@media (prefers-color-scheme: dark));
@theme inline { --color-background: var(--background); }
:root { --background: oklch(1 0 0); }
@media (prefers-color-scheme: dark) {
  :root { --background: oklch(0 0 0); }
}
`;
const fLight = hexTokens(FIXTURE, ':root {').hex;
const fDark = hexTokens(FIXTURE, /^@media \(prefers-color-scheme: dark\)/m).hex;
if (fLight['--background'] !== '#ffffff') {
  console.error(`SELFTEST FAIL  locator: light --background expected #ffffff, got ${fLight['--background']}`);
  selftestFailed++;
}
if (fDark['--background'] !== '#000000') {
  console.error(`SELFTEST FAIL  locator: dark --background expected #000000, got ${fDark['--background']} (matched the @custom-variant decoy?)`);
  selftestFailed++;
}

if (selftestFailed) {
  console.error(`\n${selftestFailed} selftest case(s) failed. The conversion is not trustworthy; not writing anything.`);
  process.exit(1);
}
if (process.argv.includes('--selftest')) {
  console.log(`selftest: ${SELFTEST.length + 6} cases, 0 failed`);
  process.exit(0);
}

/* ---- generate ---------------------------------------------------------------------------------- */

const css = readFileSync(CSS, 'utf8');

/* THE DARK BLOCK IS A MEDIA QUERY, NOT A CLASS, since 2026-09-04.
 *
 * `:root {` cannot be the dark selector: `indexOf` would find the LIGHT block, which appears first.
 * The media condition is unique in the file, and brace-counting from it captures the whole media
 * block including the nested `:root` rule. The declaration regex then reads the tokens out of that
 * body, which works because nesting is irrelevant to it: it matches `--name: value` and nothing
 * else, and the only thing inside this media query is one `:root` rule of token declarations. */
const LIGHT_SELECTOR = ':root {';
/* Anchored at the start of a line, which is what distinguishes the media RULE from the
 * `@custom-variant` declaration that mentions the same condition mid-line. */
const DARK_SELECTOR = /^@media \(prefers-color-scheme: dark\)/m;

const light = hexTokens(css, LIGHT_SELECTOR);
const dark = hexTokens(css, DARK_SELECTOR);

/* THE INVARIANT THAT CATCHES A WRONG LOCATOR, and it is the reason this function exists rather
 * than a comment telling the next person to eyeball the output.
 *
 * The dark block redefines every colour token the light block declares. That is not an accident of
 * the current palette, it is what a theme IS: a token with no dark value renders a light colour on
 * a dark ground. So the two key sets must be identical, and anything else is a bug in this script
 * or a half-finished palette edit. The first run of this script produced an EMPTY dark map from a
 * selector that matched the wrong line, and printed a cheerful summary while doing it. */
function assertParallel(a, b) {
  const missing = Object.keys(a).filter((k) => !(k in b));
  const extra = Object.keys(b).filter((k) => !(k in a));
  if (!Object.keys(a).length) throw new Error('gen-tokens: the light block yielded no colour tokens. Wrong selector?');
  if (!Object.keys(b).length) throw new Error('gen-tokens: the dark block yielded no colour tokens. Wrong selector?');
  if (missing.length || extra.length) {
    const lines = [
      'gen-tokens: the light and dark token sets disagree.',
      missing.length ? `  declared light, missing from dark: ${missing.join(', ')}` : '',
      extra.length ? `  declared dark, missing from light: ${extra.join(', ')}` : '',
      '  A colour token with no value in the other theme renders the wrong theme\'s colour.',
    ].filter(Boolean);
    throw new Error(lines.join('\n'));
  }
}
assertParallel(light.hex, dark.hex);

const serialise = (name, map) =>
  `export const ${name} = {\n` +
  Object.entries(map)
    .map(([k, v]) => `  '${k}': '${v}',`)
    .join('\n') +
  `\n} as const;`;

const body = `/* GENERATED BY scripts/gen-tokens.mjs. DO NOT EDIT.
 *
 * Every colour token in src/app/globals.css that is an oklch literal, converted to sRGB hex.
 *
 * WHAT THIS IS FOR. Two kinds of consumer cannot read a CSS custom property and so need a hex:
 * an ImageResponse (src/app/opengraph-image.tsx, icon.tsx, apple-icon.tsx) renders in satori with
 * no stylesheet and no cascade, and a themeColor viewport export is read by the browser chrome.
 * Both used to hold hand-converted literals. All four in opengraph-image.tsx were stale leftovers
 * of the cream palette deleted on 2026-08-09, which is why this file exists rather than a comment
 * asking people to keep them in sync.
 *
 * To change a colour, change the token in globals.css and run: node scripts/gen-tokens.mjs
 * \`pnpm build\` runs --check and fails on a stale file, so this cannot drift from the palette.
 *
 * Tokens that are not oklch literals are absent by design, because they are not convertible and no
 * consumer needs them: ${[...new Set([...light.skipped, ...dark.skipped])].join(', ')}.
 */

${serialise('LIGHT', light.hex)}

${serialise('DARK', dark.hex)}

export type ColourToken = keyof typeof LIGHT;
`;

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) {
    console.error(`FAIL  ${OUT} does not exist. Run: node scripts/gen-tokens.mjs`);
    process.exit(1);
  }
  const onDisk = readFileSync(OUT, 'utf8');
  if (onDisk !== body) {
    console.error('-'.repeat(70));
    console.error('FAIL  src/lib/tokens.generated.ts is stale against src/app/globals.css.');
    console.error('A palette change was made without regenerating the hex mirrors that satori and');
    console.error('the browser chrome read. Run:  node scripts/gen-tokens.mjs');
    process.exit(1);
  }
  console.log(`tokens.generated.ts is current: ${Object.keys(light.hex).length} light, ${Object.keys(dark.hex).length} dark.`);
  process.exit(0);
}

writeFileSync(OUT, body);
console.log('-'.repeat(70));
console.log(`Wrote src/lib/tokens.generated.ts`);
console.log(`  light: ${Object.keys(light.hex).length} colour tokens`);
console.log(`  dark:  ${Object.keys(dark.hex).length} colour tokens`);
console.log(`  not convertible, omitted: ${[...new Set([...light.skipped, ...dark.skipped])].join(', ')}`);
