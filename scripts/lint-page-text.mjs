#!/usr/bin/env node
/* PAGE TEXT THAT FAILS HIS RULE IN A WAY A MACHINE CAN SEE. In `pnpm build`.
 *
 * His words, 2026-09-15: "in general i feel there so much text that adds no value, everywhere, so
 * tahts the type of audit that i want but also whats the criteria to determine what stays and what
 * not". The criteria are in AGENTS.md under "Page text: what stays". This is the part of them that
 * is decidable. It does not judge whether a sentence is useful; a person does that. It refuses the
 * five shapes that are never useful to him and that kept arriving on the page:
 *
 *   path      a file, script or command                    "Run node content/health/sync.mjs"
 *   changelog a typed ISO date in a sentence, or "used to"  "There is no Saturday session since 2026-09-06"
 *   defence   the page defending its own method            "on purpose", "by construction", "honestly"
 *   research  study citations                              "Pelland JC et al.", "doi:", "randomised"
 *   plumbing  where a number came from                     "watch readings", "the mirror behind this page"
 *
 * WHERE IT LOOKS. JSX text and string literals that are JSX children, in src/app and src/components,
 * via the TypeScript AST, so comments (where all of this belongs) are never read. And the content
 * JSON fields that actually render, named by path below. A research field that no longer renders,
 * like a cue's `grounding` or conditioning.json's `howItFits`, is not checked: it is the record.
 *
 * WHAT IT CANNOT SEE, said plainly: template literals built outside JSX and passed in as props, the
 * Neon rows behind the kitchen (dish notes are written in sessions, not in this repo), and any
 * sentence that is useless in a way none of the five patterns describes. Those need a person.
 *
 *   node scripts/lint-page-text.mjs             # exits 1 on any finding
 *   node scripts/lint-page-text.mjs --selftest  # runs first on every invocation anyway
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const RULES = [
  ['path', /\b(?:src|scripts|content)\/[\w./-]+|\b[\w-]+\.(?:mjs|tsx?|ps1|sql)\b|\bnode [\w./-]+\.m?js\b|\bpnpm (?:build|dev|start|install)\b/],
  ['changelog', /\b20\d\d-\d\d-\d\d\b|\bused to (?:say|read|be)\b|\buntil 20\d\d\b/i],
  ['defence', /\bon purpose\b|\bby construction\b|\bhonest(?:ly)?\b|\bnot a verdict\b|\brather than guessed\b/i],
  ['research', /\bet al\.|\bdoi:|\bmeta-analys[ie]s\b|\brandomi[sz]ed\b|\b\d[\d,]* participants\b/i],
  ['plumbing', /\bwatch readings?\b|\bthe mirror behind\b|\bscale readings?\b|\bsynced from\b/i],
];

export function findings(text) {
  return RULES.filter(([, re]) => re.test(text)).map(([name, re]) => [name, text.match(re)[0]]);
}

/* The content fields that reach a page. A path is dotted keys with [n] for array items. */
const CONTENT = [
  ['content/gym/program.json', /^\.days\.\w+\.blocks\[\d+\]\.(?:why|exercises\[\d+\]\.(?:cue|whyHere|alts\[\d+\]\.cue))$/],
  ['content/gym/alt-cues.json', /^\.cues\.[\w-]+$/],
  ['content/gym/warmups.json', /^(?!.*\.\$)/],
  ['content/gym/cooldowns.json', /^(?!.*\.\$)/],
  ['content/gym/conditioning.json', /^\.(?:run|bike)\.(?:rules\[\d+\]|howHard\.\w+|cues\[\d+\]\.(?:cue|test|name)|weeks\[\d+\]\.note|beltSettings\.(?:run|walk|theUnitTest)|protocol\.(?:structure|shortVersion))$|^\.slots\.(?:\w+\.what|poolTimes\.\w+)$/],
  ['content/swim/plan.json', /^\.(?:pullBuoyRule|structure\.note|theGoal\.(?:target|whatThatActuallyIs)|theOneTechniqueChange\.what|cues\[\d+\]\.(?:cue|test|name)|structure\.calibration\.(?:what|test))$/],
  ['content/swim/coaching.json', /^\.groups\[\d+\]\.items\[\d+\]\.(?:do|check|name)$/],
  ['content/swim/teaching.json', /^\.groups\[\d+\]\.items\[\d+\]\.(?:say|show|watch|see)$|^\.beforeYouStart\.body$/],
];

function jsonStrings(obj, path = '', out = []) {
  if (Array.isArray(obj)) obj.forEach((v, i) => jsonStrings(v, `${path}[${i}]`, out));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) if (!k.startsWith('$')) jsonStrings(v, `${path}.${k}`, out);
  } else if (typeof obj === 'string') out.push([path, obj]);
  return out;
}

function jsxTexts(src, file) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = [];
  const walk = (n) => {
    const line = () => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    if (ts.isJsxText(n) && n.text.trim()) out.push([line(), n.text.replace(/\s+/g, ' ').trim()]);
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.parent && ts.isJsxExpression(n.parent)) {
      const p = n.parent.parent;
      if (p && (ts.isJsxElement(p) || ts.isJsxFragment(p))) out.push([line(), n.text]);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

function selftest() {
  const mustCatch = [
    ['Run <code>node content/health/sync.mjs</code> in the repo.', 'path'],
    ['There is no Saturday session since 2026-09-06.', 'changelog'],
    ['This sentence used to say something else.', 'changelog'],
    ['Lighter than the back squat on purpose.', 'defence'],
    ['so they add up by construction rather than by agreement', 'defence'],
    ['Pelland JC et al. The Resistance Training Dose Response.', 'research'],
    ['Bertelsen 2018 randomised 56 novice runners', 'research'],
    ['Both readings are watch readings.', 'plumbing'],
    ['The mirror behind this page last updated 3 days ago.', 'plumbing'],
  ];
  const mustPass = [
    'Lift first. Then the swim after every lift.',
    'Weight 105.2 kg, last measured 9 days ago',
    'Do the second one during the first one’s rest.',
    'Rest 60 s, then 300 m.',
    'Ranked within a section, not across them.',
    'The watch started this one by itself and could not tell what it was.',
    'Set Aug 9 (100 m), Sep 10 (200 m)',
  ];
  let bad = 0;
  for (const [t, want] of mustCatch) {
    if (!findings(t).some(([n]) => n === want)) { console.error(`SELFTEST: missed ${want}: ${t}`); bad++; }
  }
  for (const t of mustPass) {
    const f = findings(t);
    if (f.length) { console.error(`SELFTEST: false positive ${f.map((x) => x[0])}: ${t}`); bad++; }
  }
  // The AST half: text in a comment must not be read, text in JSX must be.
  const src = 'export default function P(){ return (<p>{/* on purpose, in a comment */}Kept. {"used to say it"}</p>); }';
  const got = jsxTexts(src, 'x.tsx').map(([, t]) => t);
  if (got.some((t) => t.includes('on purpose'))) { console.error('SELFTEST: read a JSX comment'); bad++; }
  if (!got.some((t) => t.includes('used to say'))) { console.error('SELFTEST: missed a string child'); bad++; }
  if (bad) process.exit(1);
  return mustCatch.length + mustPass.length + 2;
}

const n = selftest();
if (process.argv.includes('--selftest')) {
  console.log(`selftest: ${n} cases pass`);
  process.exit(0);
}

const all = [];
/* NOT a double-star pathspec like "src/app/(star)(star)/(star).tsx". Without `:(glob)` magic git
 * reads that as src/app/ + anything + a slash + a .tsx name, which needs a subdirectory, so the first version of this file never read
 * src/app/page.tsx, the front door, or any of the other 12 top-level files. Caught by planting a
 * violation in src/app/not-found.tsx and watching this exit 0. lint-filler.mjs had the same hole. */
const files = execSync('git ls-files -- src/app src/components', { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).map((f) => f.replace(/\\/g, '/')).filter((f) => f.endsWith('.tsx'));
for (const f of files) {
  for (const [line, text] of jsxTexts(readFileSync(join(ROOT, f), 'utf8'), f)) {
    for (const [rule, hit] of findings(text)) all.push(`${f}:${line}  [${rule}] "${hit}" in: ${text.slice(0, 110)}`);
  }
}
for (const [file, re] of CONTENT) {
  const json = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
  for (const [path, text] of jsonStrings(json)) {
    if (!re.test(path)) continue;
    for (const [rule, hit] of findings(text)) all.push(`${file} ${path}  [${rule}] "${hit}" in: ${text.slice(0, 110)}`);
  }
}

if (all.length) {
  console.error(`FAIL  ${all.length} piece(s) of page text break the page-text rule (AGENTS.md, "Page text"):\n`);
  for (const a of all) console.error(`  ${a}`);
  console.error('\nCut it, or move it into a comment beside the code. The page carries facts about him and things to do.');
  process.exit(1);
}
console.log(`page text: ${files.length} TSX files and ${CONTENT.length} content files, no path, changelog, defence, research or plumbing text.`);
