#!/usr/bin/env node
/**
 * One-time extraction of the lifting program out of HealthOS/gym.html into schema'd JSON.
 *
 * Why a script and not hand-retyping: these are real training cues (form instructions, RIR
 * guidance, gate criteria). Retyping thousands of words by hand is exactly how a wrong number or a
 * dropped word gets into something Silvio trains from. gym.html's constants are clean JS object
 * literals, so this extracts them with a real JS parser (via vm) instead of eyeballing a diff.
 *
 * Run: node content/gym/migrate-from-html.mjs
 * Reads: ../../HealthOS/gym.html (relative to this file)
 * Writes: program.json, warmups.json, cooldowns.json, handstand-ladder.json, misc.json
 *
 * Kept in the repo after running once, same as content/kitchen/migrate-recipes.mjs, as a record of
 * how the content got here and to re-run if gym.html changes before the laptop app is retired.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const GYM_HTML = join(HERE, '..', '..', '..', 'HealthOS', 'gym.html');

const html = readFileSync(GYM_HTML, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) throw new Error('No <script> block found in gym.html');
const src = scriptMatch[1];

/** Extracts `const NAME = <value>;` by walking to the statement-terminating `;` at bracket
 *  depth 0: works for array/object literals AND expressions like `Object.assign(...)`. */
function extractConst(name, from = 0) {
  const marker = `const ${name} = `;
  const start = src.indexOf(marker, from);
  if (start === -1) throw new Error(`const ${name} not found`);
  const valueStart = start + marker.length;
  let depth = 0, end = -1;
  for (let i = valueStart; i < src.length; i++) {
    const c = src[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ';' && depth === 0) { end = i; break; }
  }
  if (end === -1) throw new Error(`const ${name}: no terminating semicolon found`);
  return { text: src.slice(valueStart, end), end };
}

// Evaluate every extracted const in ONE shared vm context, in source order, so later consts that
// reference earlier ones (HS_SLOT references HS_STEPS, DAYS references WARMUP_LOWER/CD/HS_SLOT)
// resolve correctly, same trick used to verify the zone-pruning edits earlier this session.
const NAMES = ['WARMUP_LOWER', 'WARMUP_UPPER', 'CD', 'RIR_GUIDE', 'HS_STEPS', 'HS_SLOT', 'DAYS'];
// HS_SLOT is needed to resolve DAYS but is not written to its own file: DAYS embeds it verbatim
// in the Tuesday/Friday Handstand Skill blocks.
let prefix = '';
for (const name of NAMES) {
  const { text } = extractConst(name);
  prefix += `const ${name} = ${text};\n`;
}
prefix += NAMES.map((n) => `this.${n} = ${n};`).join('\n');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(prefix, sandbox, { filename: 'gym-html-extract' });

function write(file, data) {
  writeFileSync(join(HERE, file), JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${file}`);
}

write('warmups.json', { lower: sandbox.WARMUP_LOWER, upper: sandbox.WARMUP_UPPER });
write('cooldowns.json', sandbox.CD);
write('rir-guide.json', sandbox.RIR_GUIDE);
write('handstand-ladder.json', { steps: sandbox.HS_STEPS });

// gym.html assigns `warmup: WARMUP_LOWER` and `cooldown: [CD.pigeon, ...]` by reference, so a plain
// JSON.stringify of DAYS embeds a full duplicate copy of that content under every day that uses it.
// Normalize to key references (matching PROGRAM-SCHEMA.md) so the cue text lives in exactly one
// place: the same "one source, derive the rest" discipline as everything else in this migration.
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const day of Object.values(sandbox.DAYS)) {
  if (deepEq(day.warmup, sandbox.WARMUP_LOWER)) day.warmup = 'lower';
  else if (deepEq(day.warmup, sandbox.WARMUP_UPPER)) day.warmup = 'upper';
  else throw new Error(`day "${day.name}" warmup does not match WARMUP_LOWER or WARMUP_UPPER`);

  day.cooldown = day.cooldown.map((entry) => {
    const key = Object.keys(sandbox.CD).find((k) => deepEq(sandbox.CD[k], entry));
    if (!key) throw new Error(`day "${day.name}" has a cooldown entry not found in CD: ${entry.name}`);
    return key;
  });
}

write('program.json', { days: sandbox.DAYS });

console.log('\nExtraction complete. Cross-check counts against gym.html by eye before trusting this:');
console.log(`  days: ${Object.keys(sandbox.DAYS).join(', ')}`);
for (const [k, d] of Object.entries(sandbox.DAYS)) {
  const exCount = d.blocks.reduce((n, b) => n + b.exercises.length, 0);
  console.log(`  ${k}: ${d.blocks.length} blocks, ${exCount} exercises`);
}
console.log(`  handstand ladder: ${sandbox.HS_STEPS.length} steps`);
