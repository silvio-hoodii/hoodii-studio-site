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
/* THE REPO ROOT ITSELF WAS NEVER CHECKED, and README.md carried an em dash the whole time.
 *
 * Found 2026-09-04. This linter walked three directories, so the two markdown files at the top of
 * the repo were outside it: `README.md`, which is the file GitHub renders on the landing page and
 * therefore the most-read prose in the project, and `AGENTS.md`, which is where the no-em-dash rule
 * is WRITTEN DOWN. The rule's own statement was not subject to the rule.
 *
 * The root is added as a file list rather than as a walked directory on purpose: walking `.` would
 * descend into node_modules, .next and .git, and while SKIP_DIR covers those by name, an
 * allowlist of two files cannot acquire a fourth by accident. */
const ROOTS = ['src', 'content', 'scripts'];
const ROOT_FILES = ['README.md', 'AGENTS.md'];
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

/* INVISIBLE CHARACTERS, added 2026-08-27. A separate class from the dashes and a worse one, because
 * a dash at least renders.
 *
 * On 2026-08-27 two BACKSPACE characters (0x08) were baked into a regex by a bad escape, so
 * `/friday/i` could never match "Friday" and every cross-reference in that pass read as stale. The
 * repo's whole gate suite passed with them in place: typecheck, lint, build, the validator, the
 * validator's own regression suite and the probe. Nothing greps for a byte it cannot see, and no
 * human review catches a character that occupies no width on screen.
 *
 * Same shape as the em dash rule one paragraph up: it is not that people are careless, it is that
 * the check has to exist somewhere other than in someone's attention.
 *
 * WHAT IS FLAGGED. Every C0 control character except tab (0x00 to 0x1F, tab excluded; LF and CR are
 * already gone, the file was split on them), DEL (0x7F), and the three invisibles that read as a
 * space and are not one: no-break space, zero-width space, and a byte-order mark anywhere but the
 * very start of a file. Reported by code point, because "there is an invisible character on line 44"
 * is unactionable and "U+0008 at column 12" is a fix.
 *
 * NOT flagged: any other Unicode. Accented letters, the degree sign and the multiplication sign all
 * appear legitimately in this repo's content, and a rule that fires on those would be turned off. */
const INVISIBLE = {
  '\u00a0': 'U+00A0 no-break space',
  '\u200b': 'U+200B zero-width space',
  '\ufeff': 'U+FEFF byte-order mark',
};
/* Written as escapes, exactly like EM and EN above, so this detector does not contain the thing it
 * detects and cannot report itself. */
function invisibleHits(line, isFirstLine) {
  const hits = [];
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const code = line.charCodeAt(i);
    if (c === '\ufeff' && isFirstLine && i === 0) continue;   // a BOM at the top of a file is a BOM
    if (c === '\t') continue;
    const named = INVISIBLE[c];
    if (named) { hits.push(`${named} at column ${i + 1}`); continue; }
    if (code < 0x20 || code === 0x7f) {
      hits.push(`U+${code.toString(16).toUpperCase().padStart(4, '0')} control character at column ${i + 1}`);
    }
  }
  return hits;
}

/* DECORATIVE EMOJI, added 2026-08-28 per 08-ux-ui P2-3.
 *
 * A fire emoji was rendering next to "CURRENT" on two /reading queue rows, from `'\u{1F525} current'`
 * duplicated byte-for-byte in `queue-types.ts` and `catalog-types.ts`. The design brief is a
 * monochrome instrument with exactly one chromatic colour; `music.css` refuses album covers on the
 * grounds that "a grid of full-colour covers is the one thing that would visibly break a monochrome
 * system built on purpose", and a full-colour glyph at 14px is the same break in miniature. It is
 * also, on its own, one of the named AI tells.
 *
 * THIS HAS TO BE NODE AND NOT GREP. `grep -P` for these ranges fails on this machine with "supports
 * only unibyte and UTF-8 locales", which is the exact failure that let an agent report the repo
 * clean of em dashes on 2026-08-13 while 118 lines carried them. The audit reproduced it.
 *
 * THE RANGE IS THE PICTOGRAPH BLOCKS PLUS U+FE0F, AND NOT THE DINGBATS, and that narrowing came
 * from this check's second live finding being wrong. The audit proposed `\u{2600}-\u{27BF}`, which
 * covers Miscellaneous Symbols and Dingbats, and the first run flagged
 * `.reading .sortopt.on .so-name::after { content: ' ✓' }`: a CHECK MARK, which renders as a
 * monochrome text glyph in the page's own colour and breaks nothing this rule is about. Flagging it
 * would have made the check's first real output a false positive, which is how a checker teaches
 * people to dismiss it (the bare-path hook in this workspace got three out of three wrong on its
 * first live run, and the lesson written down was that precision matters more than recall here).
 *
 * So the rule now matches its own stated reason: U+1F000 to U+1FAFF, every actual emoji block, plus
 * U+FE0F, the variation selector that turns a text dingbat into a colour one. A plain check mark
 * stays legal; a check mark asking for emoji presentation does not.
 *
 * Deliberately NOT all of Unicode, for the same reason the invisible check stops where it does: this
 * repo legitimately carries accented letters, the degree sign and the multiplication sign, and a rule
 * that fires on those is a rule somebody turns off.
 *
 * Same `lint-prose-allow` marker as the dashes, for a line whose job is to strip them. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{FE0F}]/u;

const bad = [];

function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIR.has(e)) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (!EXT.test(e)) continue;
    checkFile(full);
  }
}

/** One file, by absolute path. Split out of `walk` on 2026-09-04 so the two markdown files at the
 *  top of the repo can be checked without walking the repo root. See ROOT_FILES. */
function checkFile(full) {
  {
    const e = full.split(/[\\/]/).pop();
    const lines = readFileSync(full, 'utf8').split(/\r?\n/);
    /* A COOK CARD'S QUOTED SENTENCES ARE NOT OUR PROSE. Added 2026-08-23.
     *
     * `content/kitchen/recipes/*.json` is mostly our writing and stays under this rule: `why`,
     * `look`, `prep`, `doneness`, `statement` and the rest are all things an agent wrote and the
     * no-dash rule is about exactly that. But `text` and `sourceText` on a `sourced` card are ONE
     * PUBLISHER'S SENTENCE, quoted, and `validate.mjs` checks every one of them against the hashed
     * capture in `imported/`. Editing a quote to satisfy a punctuation rule would either break that
     * check or, worse, pass it while putting words in her mouth.
     *
     * That is the same argument this file already makes for skipping `corpus/` and `imported/`
     * twenty lines up: rewriting a source's text is a provenance violation and it matters more than
     * a punctuation rule about our own writing. Those two directories were exempt and the recipe
     * cards that quote them were not, which is an inconsistency nobody hit until Budget Bytes'
     * spaetzle step 3 gave a range of one to two tablespoons of milk using an en dash, on
     * 2026-08-23. (Written out in words here on purpose: this comment is our prose and the rule
     * still applies to it, which this file proved by failing on itself when it was not.)
     *
     * Deliberately NOT a whole-file skip: a dash in anything else on the card is still a failure. */
    const isCard = full.includes(join('content', 'kitchen', 'recipes'));
    lines.forEach((line, i) => {
      if (line.includes('lint-prose-allow')) return;
      if (isCard && /^\s*"(?:text|sourceText)":/.test(line)) return;
      const hits = [];
      if (line.includes(EM)) hits.push('U+2014 em dash');
      if (line.includes(EN)) hits.push('U+2013 en dash');
      if (/&mdash;|&#8212;|&ndash;|&#8211;/.test(line)) hits.push('em/en dash HTML entity');   // lint-prose-allow
      const emoji = line.match(EMOJI);
      if (emoji) {
        hits.push(`emoji U+${emoji[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
      }
      hits.push(...invisibleHits(line, i === 0));
      if (hits.length) bad.push({ file: relative(ROOT, full), line: i + 1, what: hits.join(' + '), text: line.trim().slice(0, 100) });
    });
  }
}

for (const r of ROOTS) {
  try { walk(join(ROOT, r)); } catch { /* a root that does not exist is not a failure */ }
}
/* The two markdown files at the top of the repo. See ROOT_FILES: README.md is what GitHub renders,
   and AGENTS.md is where this rule is written down, and neither was checked until 2026-09-04. */
for (const f of ROOT_FILES) {
  try { checkFile(join(ROOT, f)); } catch { /* a file that does not exist is not a failure */ }
}

for (const b of bad) {
  console.log(`x  ${b.file}:${b.line}  ${b.what}`);
  console.log(`      ${b.text}`);
}

console.log('-'.repeat(70));
if (bad.length) {
  console.log(`${bad.length} lines carry a character this repo does not allow.`);
  console.log('For a dash: use a comma, a period, a colon, or parentheses. If the line exists to');
  console.log('STRIP these characters, add the marker lint-prose-allow in a comment on that line.');
  console.log('For an invisible character: it is almost always a bad escape or a paste from a web');
  console.log('page. Delete it. Write it as \\uXXXX if a literal one is genuinely needed.');
  console.log('For an emoji: the word next to it already says what it says. This is a monochrome');
  console.log('instrument and a colour glyph breaks it, at any size.');
  process.exit(1);
}
console.log('No em dashes, no en dashes, no dash entities, no emoji, no invisible characters.');
