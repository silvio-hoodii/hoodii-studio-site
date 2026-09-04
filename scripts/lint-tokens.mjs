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
 * THE TWO EXCEPTIONS THIS FILE USED TO DOCUMENT ARE GONE, as of 2026-09-04, and how they went is
 * the point. They were:
 *
 *   `src/app/opengraph-image.tsx`  an ImageResponse renders outside the document and cannot read a
 *                                  CSS variable. Four literals there "mirrored the tokens".
 *   the eight layout `themeColor`  a viewport export is consumed by the browser chrome, not by CSS.
 *
 * ALL FOUR LITERALS IN THE FIRST ONE WERE WRONG, and had been for a month: they were leftovers of
 * the cream palette deleted on 2026-08-09, so the share card rendered in the retired palette while
 * its comment claimed otherwise. The eight `themeColor` copies were eight places holding one fact.
 *
 * A MARKER SAYS A LITERAL IS ALLOWED TO BE THERE. IT CANNOT SAY THE LITERAL IS CORRECT. That is the
 * limit of this whole approach, and the fix was not a better marker: `scripts/gen-tokens.mjs` now
 * derives the hex from the oklch token, `src/lib/tokens.generated.ts` holds the result, every
 * consumer imports it, and `pnpm build` runs `gen-tokens --check` so a palette change that is not
 * regenerated fails the build. Both exceptions were deleted rather than re-marked.
 *
 * The marker still works and is still the right escape hatch for a genuinely new case. There are
 * currently zero uses of it in `src`, which is the state to keep.
 *
 * ONE PATH EXEMPTION, and it is not a marker. `src/lib/tokens.generated.ts` is 30 hex literals
 * written by a machine from the token file, and marking each line would be noise that also says the
 * wrong thing: the marker means "a person decided this literal is fine", and nobody typed these.
 * It carries a STRONGER gate than the marker instead, `gen-tokens --check`, which asserts the
 * literals equal the tokens rather than merely permitting them.
 *
 *   node scripts/lint-tokens.mjs             # wired into `pnpm build`
 *   node scripts/lint-tokens.mjs --selftest  # runs first on every invocation anyway
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const TOKEN_FILE = join('src', 'app', 'globals.css').split(sep).join('/');
/* Machine-written from TOKEN_FILE and gated by `gen-tokens --check`, which is a stronger claim than
 * this linter makes: it asserts the literals EQUAL the tokens. See the header. */
const GENERATED_FILE = join('src', 'lib', 'tokens.generated.ts').split(sep).join('/');

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

/* ---- two checks about tokens that EXIST, added 2026-09-04 --------------------------------------
 *
 * Everything above this point asks "is this a colour literal". Both defects found on the cook
 * screen on 2026-09-04 passed that question cleanly, because neither was a literal:
 *
 *   A1  `color: 'var(--accent)'` on the "you do not have this" warning. `--accent` is a SURFACE
 *       token, oklch(0.955 0.002 100), a near-white. The cream palette's accent was orange; the
 *       2026-08-09 rename kept the name and lost the meaning. Measured on /kitchen/piccata: 1.1:1.
 *       The one warning that stops him mid-dish was invisible.
 *
 *   A2  `color: 'var(--ink-faint)'`, three times. That token is declared NOWHERE. An undefined
 *       custom property makes the declaration invalid at computed-value time and `color` inherits,
 *       so it silently rendered as whatever the parent was.
 *
 * A TOKEN THAT EXISTS AND MEANS THE WRONG THING, AND A TOKEN THAT DOES NOT EXIST AT ALL, both pass
 * a literal check. These are the two cheapest checks that would have caught them, and between them
 * they are about five lines of actual logic.
 */

/** Every custom property NAME declared anywhere in the stylesheets, plus the ones declared outside
 *  CSS entirely.
 *
 *  Collected from ALL css files rather than only globals.css, because a surface stylesheet
 *  legitimately declares its own non-colour locals (`--pad` in training.css). The palette rule
 *  above already stops a surface declaring a COLOUR. */
export function declaredTokens(cssSources, extra = []) {
  const names = new Set(extra);
  for (const src of cssSources) {
    for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:/gi)) names.add(m[1]);
  }
  return names;
}

/* Declared by `next/font/google` in src/app/layout.tsx, not by a stylesheet, and consumed by
 * `@theme inline`. A CSS-only sweep cannot see them. */
const EXTERNAL_TOKENS = ['--font-plex-sans', '--font-plex-mono'];

/** Names referenced by `var(--x)` on a line. Handles a fallback: `var(--x, 12px)`. */
export function tokenRefs(line) {
  return [...line.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]);
}

/** Blank out every comment in a file, keeping line numbers and string contents intact.
 *
 *  WHY THIS IS A FILE-LEVEL SCANNER AND NOT A PER-LINE REGEX. `colourLiteralsInCss` already strips
 *  comments per line, and its header records that its one false positive on its first live run was
 *  a sentence in a comment. The TSX path never got the same treatment, and the two checks added on
 *  2026-09-04 did not either, so the first run of the extended linter produced TWO findings and
 *  BOTH WERE PROSE:
 *
 *    kitchen.css:228   a comment explaining that `var(--ink-faint)` is undefined
 *    layout.tsx:67     a comment explaining that eight layouts each held `themeColor: '#ffffff'`
 *
 *  Which is to say: documenting a defect reintroduced it, in the checker written to find it. Every
 *  file this rule protects explains its palette in prose, at length, and a gate that flags its own
 *  documentation gets dismissed.
 *
 *  A per-line strip cannot do this, because this repo's comments are multi-line blocks whose
 *  continuation lines are ordinary prose with no marker of their own beyond a leading `*`, and
 *  matching a leading `*` would also blank a CSS universal selector. So the state has to be carried
 *  across lines.
 *
 *  Quoted strings are preserved deliberately: `'//'` inside a URL and `'/*'` inside a string must
 *  not open a comment, and a real literal AFTER a string on the same line must still be seen. */
export function blankComments(source) {
  const out = [];
  let inBlock = false;
  for (const line of source.split(/\r?\n/)) {
    let result = '';
    let i = 0;
    let quote = null;
    while (i < line.length) {
      const two = line.slice(i, i + 2);
      if (inBlock) {
        if (two === '*/') {
          inBlock = false;
          result += '  ';
          i += 2;
        } else {
          result += ' ';
          i += 1;
        }
        continue;
      }
      if (quote) {
        result += line[i];
        if (line[i] === '\\') {
          result += line[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (line[i] === quote) quote = null;
        i += 1;
        continue;
      }
      if (line[i] === "'" || line[i] === '"' || line[i] === '`') {
        quote = line[i];
        result += line[i];
        i += 1;
        continue;
      }
      if (two === '/*') {
        inBlock = true;
        result += '  ';
        i += 2;
        continue;
      }
      /* `//` to end of line. Only reachable outside a string, so `https://` in a quoted URL is
         safe; an unquoted one in CSS would already be a syntax error. */
      if (two === '//') break;
      result += line[i];
      i += 1;
    }
    out.push(result);
  }
  return out;
}

/* THE FIVE SURFACE TOKENS. Each is a BACKGROUND in the shadcn model and each has its own
 * `-foreground` partner for text that sits on it, so using the surface itself as a text colour is
 * always the mistake A1 was: it is the colour of the paper, on the paper. `--background` is
 * deliberately NOT in this list, because it is the correct text colour on an inverted control
 * (white text on the near-black primary button) and flagging it would be a false positive on
 * working code. */
const SURFACE_TOKENS = ['--accent', '--secondary', '--muted', '--card', '--popover'];

/** A surface token used as a text colour, on one line of CSS or TSX. Returns the offenders.
 *
 *  Matches `color:` and not `background`, `border-color` or `fill`, which is the whole point: these
 *  tokens are correct as a background and wrong as text. `-foreground` variants are excluded by
 *  requiring the token name to END at the closing paren or comma. */
export function surfaceTokenAsText(line) {
  const hits = [];
  /* CSS `color: var(--muted)` and JSX `color: 'var(--muted)'`, but not `background-color`,
     `caret-color`, `border-color`, `text-decoration-color` or `--card-foreground: ...`. */
  const m = /(?:^|[^-\w])color\s*:\s*'?"?\s*var\(\s*(--[a-z0-9-]+)\s*[,)]/i.exec(line);
  if (m && SURFACE_TOKENS.includes(m[1])) hits.push(m[1]);
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

/* The two 2026-09-04 checks, in both directions, on the exact lines that shipped. `--accent` as a
 * text colour is A1 verbatim; `--ink-faint` is A2 verbatim. The must-NOT-catch half is the half
 * that matters: a check whose first real finding is a false positive teaches people to dismiss it,
 * which is written into the header of scripts/bare-path-check.mjs in the workspace above this one
 * after exactly that happened. */
const SURFACE_SELFTEST = [
  ["{p.missing ? <b style={{ color: 'var(--accent)' }}> · you do not have this</b> : null}", true],
  ['  color: var(--muted);', true],
  ["style={{ color: 'var(--card)' }}", true],
  // must NOT be caught: the -foreground partners are exactly what these lines should say
  ["style={{ color: 'var(--muted-foreground)' }}", false],
  ['  color: var(--accent-foreground);', false],
  // must NOT be caught: a surface token IS correct as a surface
  ['  background: var(--muted);', false],
  ['  background-color: var(--accent);', false],
  ['  border-color: var(--secondary);', false],
  // must NOT be caught: declaring the token, not using it as text
  ['  --card-foreground: var(--foreground);', false],
  // must NOT be caught: --background as text is right on an inverted control
  ['  color: var(--background);', false],
];

const REF_SELFTEST = [
  // declared set for the purposes of this fixture
  ["  color: var(--ink-faint);", ['--ink-faint']],
  ["style={{ color: 'var(--muted-foreground)' }}", []],
  ['  padding: clamp(28px, 7vw, 52px) var(--pad) 140px;', []],
  ['  font-size: var(--nope, 12px);', ['--nope']],
];
const REF_DECLARED = declaredTokens(['--muted-foreground: x; --pad: 20px; --foreground: y;']);

/* THE COMMENT SCANNER, on the two false positives it was written for plus the shapes that must
 * survive it. Every other check now depends on this one, so a bug here silently blinds all three:
 * blank too much and the linter passes everything. Hence the must-SURVIVE half. */
const COMMENT_SELFTEST = [
  // [source, must still contain, must no longer contain]
  ["const A = '#fdfcfa'; // lint note about #ffffff", "'#fdfcfa'", '#ffffff'],
  ['/* themeColor: \'#ffffff\' */\ncolor: var(--muted);', 'var(--muted)', '#ffffff'],
  ['/* a block\n * mentioning var(--ink-faint)\n */\ncolor: var(--real);', 'var(--real)', 'ink-faint'],
  // a string that LOOKS like a comment opener must not open one
  ["const u = 'https://x.dev'; color: var(--muted);", 'var(--muted)', 'NOTHING_EXPECTED'],
  ["const s = '/*'; const B = '#abcdef';", "'#abcdef'", 'NOTHING_EXPECTED'],
];

let selftestFailed = 0;
for (const [source, mustKeep, mustDrop] of COMMENT_SELFTEST) {
  const got = blankComments(source).join('\n');
  if (!got.includes(mustKeep)) {
    console.error(`SELFTEST FAIL  blankComments dropped ${mustKeep} from: ${JSON.stringify(source)}`);
    selftestFailed++;
  }
  if (mustDrop !== 'NOTHING_EXPECTED' && got.includes(mustDrop)) {
    console.error(`SELFTEST FAIL  blankComments kept ${mustDrop} from: ${JSON.stringify(source)}`);
    selftestFailed++;
  }
}
for (const [kind, line, shouldCatch] of SELFTEST) {
  const hits = kind === 'css' ? colourLiteralsInCss(line) : colourLiteralsInTsx(line);
  const caught = hits.length > 0;
  if (caught !== shouldCatch) {
    console.error(`SELFTEST FAIL  ${kind}  expected ${shouldCatch ? 'a catch' : 'no catch'}: ${line}`);
    selftestFailed++;
  }
}
for (const [line, shouldCatch] of SURFACE_SELFTEST) {
  const caught = surfaceTokenAsText(line).length > 0;
  if (caught !== shouldCatch) {
    console.error(`SELFTEST FAIL  surface-as-text  expected ${shouldCatch ? 'a catch' : 'no catch'}: ${line}`);
    selftestFailed++;
  }
}
for (const [line, expected] of REF_SELFTEST) {
  const undeclared = tokenRefs(line).filter((n) => !REF_DECLARED.has(n));
  if (undeclared.join(',') !== expected.join(',')) {
    console.error(`SELFTEST FAIL  undeclared-token  expected [${expected}], got [${undeclared}]: ${line}`);
    selftestFailed++;
  }
}
if (selftestFailed) {
  console.error(`\n${selftestFailed} selftest case(s) failed. The check is not trustworthy; not running it.`);
  process.exit(1);
}
if (process.argv.includes('--selftest')) {
  console.log(
    `selftest: ${SELFTEST.length + SURFACE_SELFTEST.length + REF_SELFTEST.length + COMMENT_SELFTEST.length} cases, 0 failed`,
  );
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

/* Every token name declared anywhere, so a reference to one that is declared NOWHERE can be told
 * apart from a reference to a surface stylesheet's own local. Read before the sweep because the
 * sweep needs the whole picture: `--pad` is declared in training.css and used in kitchen.css. */
const DECLARED = declaredTokens(
  files.filter((f) => f.endsWith('.css')).map((f) => blankComments(readFileSync(f, 'utf8')).join('\n')),
  EXTERNAL_TOKENS,
);

let fail = 0;
let checked = 0;
for (const full of files) {
  const path = rel(full);
  /* globals.css IS the palette. Every literal in it is a token definition, which is the whole point
   * of having one file that holds them. */
  if (path === TOKEN_FILE) continue;
  if (path === GENERATED_FILE) continue;
  const isCss = path.endsWith('.css');
  checked++;

  const raw = readFileSync(full, 'utf8').split(/\r?\n/);
  /* Comments are blanked BEFORE any check runs. See blankComments: the first live run of the two
   * checks below reported two findings and both were sentences describing the defects. */
  blankComments(raw.join('\n')).forEach((line, i) => {
    if ((raw[i] ?? '').includes('lint-tokens-allow')) return;

    const hits = isCss ? colourLiteralsInCss(line) : colourLiteralsInTsx(line);
    if (hits.length) {
      console.error(`FAIL  ${path}:${i + 1}  colour literal: ${hits.join(', ')}`);
      console.error(`        ${(raw[i] ?? '').trim().slice(0, 100)}`);
      fail++;
    }

    /* A token that does not exist. Renders as inherited, silently. */
    const undeclared = tokenRefs(line).filter((n) => !DECLARED.has(n));
    if (undeclared.length) {
      console.error(`FAIL  ${path}:${i + 1}  undefined token: ${undeclared.join(', ')}`);
      console.error(`        ${(raw[i] ?? '').trim().slice(0, 100)}`);
      console.error('        Declared nowhere, so `color` inherits and the rule does nothing.');
      fail++;
    }

    /* A token that exists and means the wrong thing. Renders as paper on paper. */
    const surface = surfaceTokenAsText(line);
    if (surface.length) {
      console.error(`FAIL  ${path}:${i + 1}  surface token as a text colour: ${surface.join(', ')}`);
      console.error(`        ${(raw[i] ?? '').trim().slice(0, 100)}`);
      console.error(`        Use ${surface[0]}-foreground. ${surface[0]} is the colour of the paper.`);
      fail++;
    }
  });
}

console.log('-'.repeat(70));
if (fail) {
  /* Three kinds of finding since 2026-09-04, so the summary counts findings rather than calling
     them all colour literals: the two token checks fire on lines that hold no literal at all. */
  console.log(`${fail} token finding(s) in ${checked} file(s).`);
  console.log('');
  console.log('  colour literal            The palette is a decision, not a default: cream plus');
  console.log('                            terra-cotta plus serif plus rounded cards was removed on');
  console.log('                            2026-08-09 after research named it as the current');
  console.log('                            AI-generated tell. Use a token from globals.css, or add');
  console.log('                            one there. If it is genuinely unavoidable, put');
  console.log('                            lint-tokens-allow in a comment on the same line.');
  console.log('  undefined token           Declared in no stylesheet, so the declaration is invalid');
  console.log('                            at computed-value time and the property inherits. The');
  console.log('                            rule does nothing and looks like it does something.');
  console.log('  surface token as text     A background token used as a text colour. Every one of');
  console.log('                            them has a -foreground partner; that is the one you want.');
  process.exit(1);
}
console.log(`${checked} file(s) checked: no colour literal outside ${TOKEN_FILE}, no undefined token, no surface token used as text.`);
