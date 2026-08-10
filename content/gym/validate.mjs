#!/usr/bin/env node
/**
 * Gym program validator. Same discipline as content/kitchen/validate.mjs: the rules that matter are
 * enforced mechanically, not left as prose someone has to remember to re-check.
 *
 * Run: node content/gym/validate.mjs
 * Zero dependencies on purpose.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(readFileSync(join(HERE, f), 'utf8'));

const program = readJson('program.json');
const warmups = readJson('warmups.json');
const cooldowns = readJson('cooldowns.json');

let FAIL = 0;
const out = [];
function fail(where, msg) { FAIL++; out.push(`FAIL  [${where}] ${msg}`); }

const REQUIRED_EX_FIELDS = ['id', 'name', 'sets', 'reps', 'rest', 'cue'];
const REQUIRED_ALT_FIELDS = ['id', 'name', 'cue'];
const PAIRED_TYPES = new Set(['superset', 'pair']);

for (const [dayKey, day] of Object.entries(program.days)) {
  if (!day.name || !day.title) fail(dayKey, 'missing name/title');
  if (!warmups[day.warmup]) fail(dayKey, `warmup "${day.warmup}" not found in warmups.json`);
  for (const cdKey of day.cooldown || []) {
    if (!cooldowns[cdKey]) fail(dayKey, `cooldown key "${cdKey}" not found in cooldowns.json`);
  }

  if (!Array.isArray(day.blocks) || !day.blocks.length) { fail(dayKey, 'no blocks'); continue; }

  const idsInDay = new Set();
  for (const block of day.blocks) {
    const where = `${dayKey}/${block.label || block.type}`;
    if (!Array.isArray(block.exercises) || !block.exercises.length) {
      fail(where, 'empty exercises[]');
      continue;
    }
    // Both `superset`/`pair` blocks, AND `main` blocks that carry 2 exercises, share one rest
    // window between the two exercises — see PROGRAM-SCHEMA.md. Only a lone `main` exercise (1
    // item, e.g. a power-primer or the barbell lift itself with no filler) is exempt.
    if (PAIRED_TYPES.has(block.type) && block.exercises.length !== 2) {
      fail(where, `${block.type} block has ${block.exercises.length} exercises, expected exactly 2`);
    }

    for (const ex of block.exercises) {
      for (const f of REQUIRED_EX_FIELDS) {
        if (ex[f] === undefined || ex[f] === null || ex[f] === '') fail(where, `exercise missing "${f}": ${JSON.stringify(ex).slice(0, 60)}`);
      }
      if (ex.id) {
        if (idsInDay.has(ex.id)) fail(where, `duplicate exercise id "${ex.id}" within ${dayKey}`);
        idsInDay.add(ex.id);
      }
      if (ex.timed && ex.bodyweight === undefined) {
        // Not a hard failure — some timed holds do carry load — but worth a look.
      }
      for (const alt of ex.alts || []) {
        for (const f of REQUIRED_ALT_FIELDS) {
          if (alt[f] === undefined || alt[f] === null || alt[f] === '') fail(where, `alt of "${ex.id}" missing "${f}": ${JSON.stringify(alt).slice(0, 60)}`);
        }
      }
      // No alt should point back at its own exercise's id — a real bug that once slipped through
      // the hand-authored gym.html would silently make "swap" a no-op.
      for (const alt of ex.alts || []) {
        if (alt.id === ex.id) fail(where, `"${ex.id}" lists itself as its own alt`);
      }
    }
  }
}

console.log(out.join('\n'));
console.log('-'.repeat(70));
console.log(`${Object.keys(program.days).length} days checked, ${FAIL} failures`);
process.exit(FAIL ? 1 : 0);
