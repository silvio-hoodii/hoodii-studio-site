#!/usr/bin/env node
/**
 * KitchenOS recipe validator.
 *
 * Run: node KitchenOS/validate.mjs [id]
 *
 * This file is the enforcement layer for schema/RECIPE-SCHEMA.md. It exists because eight rounds of
 * writing rules into DESIGN.md as prose did not stop the same five bugs recurring. Prose asks an
 * agent to remember. This exits non-zero.
 *
 * Zero dependencies on purpose, same as lint.mjs.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECIPES = join(HERE, 'recipes');
const EQUIP = JSON.parse(readFileSync(join(HERE, 'schema', 'equipment.json'), 'utf8')).equipment;
const STOCK = existsSync(join(HERE, 'stock', 'items.json'))
  ? JSON.parse(readFileSync(join(HERE, 'stock', 'items.json'), 'utf8'))
  : { items: {} };
const STOCK_IDS = new Set(Object.keys(STOCK.items || STOCK));

const FORMS = ['dish', 'technique', 'method', 'assembly', 'macro'];
const MEALS = ['breakfast', 'lunch', 'dinner', 'side', 'dessert', 'snack', 'sauce', 'project'];

/* ------------------------------------------------------------------ *
 * Banned language. Each entry traces to a real failure at the stove.
 * ------------------------------------------------------------------ */

const BANNED_HEAT = [
  { re: /\blowest setting\b/i, why: 'A dial position. The hob is induction and its burners do not share a scale.' },
  { re: /\bhighest setting\b/i, why: 'Same. Describe what the pan should be doing.' },
  { re: /\bturn (?:it )?(?:down|up)(?: by)? (?:one|two|a|1|2)\b/i, why: 'Notch counting. Meaningless on this hob.' },
  { re: /\b(?:one|two|three|1|2|3) notch(?:es)?\b/i, why: 'Notch counting.' },
  { re: /\bsetting (?:\d+)\b/i, why: 'A dial number. Burners run 1-120, 1-10, or low/med/high.' },
  { re: /\bnumber \d+ on the dial\b/i, why: 'A dial number.' },
  { re: /\bdial to \d+/i, why: 'A dial number.' },
  { re: /\bon a \d+ to \d+ dial\b/i, why: 'Assumes a dial scale. This hob does not have one scale.' },
  { re: /\bas low as it (?:can|will) go\b/i, why: 'A dial position. On this hob the lowest setting sits BELOW a simmer, which is what ruined the rice on 2026-08-05.' },
  { re: /\braise it (?:one|a|two)\b/i, why: 'Notch counting.' },
];

/* Heat words in the instruction are fine, but ONLY alongside a structured observable. This is the
 * "never give a heat setting without an observable in the same step" rule, made mechanical. */
const HEAT_LEVEL_WORD = /\b(?:on|to|over)\s+(?:a\s+)?(?:low|medium(?:[- ]high|[- ]low)?|high)\b(?:\s+heat)?/i;

const BANNED_CUE = [
  { re: /\bsizzles? rather than hiss/i, why: 'Failed for real 2026-08-02. He cannot tell these apart and neither can most people.' },
  { re: /\bseason to taste\b/i, why: 'He is a beginner. Give a number and a palm-sized analogue.' },
  { re: /\bcook until done\b/i, why: 'Not a test. Say what to look for.' },
  { re: /\bwhen it looks right\b/i, why: 'Not a test.' },
  { re: /\buntil fragrant\b/i, why: 'A sense he has to have, not a test he can perform. Give a time and a colour.' },
  { re: /\buntil it smells\b/i, why: 'Same. Smell cues assume experience he does not have yet.' },
  { re: /\bas needed\b/i, why: 'Give the amount.' },
  { re: /\ba splash\b/i, why: 'Give the amount. He has measuring spoons.' },
  { re: /\bsome\b(?= (?:salt|pepper|oil|water|butter))/i, why: 'Give the amount.' },
];

/* Cups of water per cup of dry rice. Carried over from lint.mjs, but now computed from structured
 * quantities instead of regexed out of prose, which is why it can actually be trusted. */
const RICE_RATIO = {
  longgrainrice: { lo: 1.4, hi: 1.9, label: 'long grain' },
  jasminerice: { lo: 1.4, hi: 1.9, label: 'jasmine' },
  whiterice: { lo: 1.4, hi: 1.9, label: 'white (assumed long grain)' },
  basmatirice: { lo: 1.4, hi: 1.85, label: 'basmati' },
  shortgrainrice: { lo: 0.95, hi: 1.35, label: 'short grain' },
  sushirice: { lo: 0.95, hi: 1.35, label: 'short grain' },
  arboriorice: { lo: 0.95, hi: 1.35, label: 'arborio' },
  brownrice: { lo: 2.0, hi: 2.6, label: 'brown' },
};

const CUPS = { cup: 1, cups: 1, ml: 1 / 236.6, l: 4.227, tbsp: 1 / 16, tsp: 1 / 48 };
const toCups = (qty, unit) => (CUPS[String(unit).toLowerCase()] ? qty * CUPS[String(unit).toLowerCase()] : null);

/* ------------------------------------------------------------------ */

let FAIL = 0;
let WARN = 0;
const out = [];

function fail(id, rule, msg, hint) {
  FAIL++;
  out.push({ id, level: 'FAIL', rule, msg, hint });
}
function warn(id, rule, msg, hint) {
  WARN++;
  out.push({ id, level: 'WARN', rule, msg, hint });
}

function validate(r, file) {
  const id = r.id || basename(file, '.json');

  /* ---- structure ---- */
  for (const f of ['id', 'name', 'form', 'time', 'serves', 'ingredients', 'equipment', 'steps']) {
    if (r[f] === undefined) fail(id, 'structure', `missing required field \`${f}\``);
  }
  if (r.id && r.id !== basename(file, '.json')) {
    fail(id, 'structure', `id "${r.id}" does not match filename ${basename(file)}`);
  }
  if (r.form && !FORMS.includes(r.form)) fail(id, 'structure', `form "${r.form}" not one of ${FORMS.join('|')}`);
  for (const m of r.meal || []) if (!MEALS.includes(m)) fail(id, 'structure', `meal "${m}" not one of ${MEALS.join('|')}`);
  if (!Array.isArray(r.steps) || !r.steps.length) {
    fail(id, 'structure', 'no steps');
    return;
  }
  if (!Array.isArray(r.ingredients)) {
    fail(id, 'structure', 'ingredients is not an array');
    return;
  }

  /* ---- ingredient identity ---- */
  const refs = new Set();
  for (const ing of r.ingredients) {
    if (!ing.ref) { fail(id, 'ingredients', `ingredient with no ref: ${JSON.stringify(ing).slice(0, 80)}`); continue; }
    if (refs.has(ing.ref)) fail(id, 'ingredients', `duplicate ingredient ref "${ing.ref}"`);
    refs.add(ing.ref);

    if (!ing.display) fail(id, 'ingredients', `"${ing.ref}" has no display name`);

    // RULE: quantities are data. This is the "I didn't know how much cottage cheese" bug.
    if (ing.qty === undefined || ing.qty === null || ing.unit === undefined) {
      fail(id, 'quantity', `"${ing.ref}" has no qty/unit`,
        'Every ingredient carries its amount so any step that mentions it can render the number inline.');
    }
    if (/to taste|as needed|to preference/i.test(String(ing.unit) + String(ing.qty))) {
      fail(id, 'quantity', `"${ing.ref}" uses a non-amount as its unit`, 'Give a number and a palm-sized analogue.');
    }

    // stock linkage drives makeability and consume-on-cook
    if (ing.stock !== undefined && ing.stock !== null && !STOCK_IDS.has(ing.stock)) {
      fail(id, 'stock', `"${ing.ref}" points at stock id "${ing.stock}" which is not in stock/items.json`,
        'Makeability and consume-on-cook both key off this.');
    }
    // Staples are the slow half of the three-speeds model in README.md: spices, flour, oil. Presence
    // is binary and lives in KITCHEN.md, not in the event-sourced stock. They are deliberately not
    // tracked, so not having a stock link is correct rather than an omission.
    if (ing.stock === undefined && !ing.staple) {
      warn(id, 'stock', `"${ing.ref}" has no stock link and is not marked staple:true`,
        'It will be invisible to "what can I cook now".');
    }
    if (ing.defining === undefined) {
      warn(id, 'ingredients', `"${ing.ref}" does not declare \`defining\``,
        'Set it. defining:true means the dish does not exist without it and will not be offered.');
    }
  }

  /* ---- equipment ---- */
  const eqDeclared = new Set(r.equipment || []);
  for (const e of eqDeclared) {
    const def = EQUIP[e];
    if (!def) {
      fail(id, 'equipment', `equipment "${e}" is not in schema/equipment.json`,
        'Add it there if the kitchen really has it, and say when it was confirmed.');
      continue;
    }
    if (def.present === false) {
      fail(id, 'equipment', `"${e}" (${def.name}) is NOT in this kitchen`,
        def.insteadUse ? `Use instead: ${def.insteadUse.join(', ')}` : 'Rewrite the method without it.');
    }
  }

  /* ---- closure, both directions. This is rule 1. ---- */
  const usedIng = new Set();
  const usedEq = new Set();
  const portions = {};   // ref -> [{n, amount, unit, optional}]  for the split check

  r.steps.forEach((s, i) => {
    const n = s.n ?? i + 1;
    const where = `step ${n}`;

    if (!s.text || !String(s.text).trim()) fail(id, 'steps', `${where} has no text`);
    if (s.n !== undefined && s.n !== i + 1) fail(id, 'steps', `${where} is out of order (index ${i + 1})`);

    for (const raw of s.uses || []) {
      const u = typeof raw === 'string' ? { ref: raw } : raw;
      usedIng.add(u.ref);
      if (!refs.has(u.ref)) {
        fail(id, 'closure', `${where} uses "${u.ref}" which is not in ingredients[]`,
          'This is the green-onion-whites bug: a step reaching for something no list told him to get out.');
        continue;
      }
      if (u.amount !== undefined) {
        (portions[u.ref] ||= []).push({ n, amount: u.amount, unit: u.unit, optional: !!u.optional });
      }
    }
    for (const e of s.equipment || []) {
      usedEq.add(e);
      if (!eqDeclared.has(e)) {
        fail(id, 'closure', `${where} uses equipment "${e}" not declared on the recipe`,
          'This is the "what baking sheet this wasn\'t on the list wtf" bug.');
      }
    }

    /* ---- heat. Rule 2. ---- */
    const blob = [s.text, s.doneness?.test, s.heat?.target, s.heat?.level].filter(Boolean).join(' ');
    for (const b of BANNED_HEAT) {
      if (b.re.test(blob)) fail(id, 'heat', `${where} references a dial position: ${b.re.source}`, b.why);
    }
    for (const b of BANNED_CUE) {
      if (b.re.test(blob)) fail(id, 'cue', `${where} uses a banned cue: ${b.re.source}`, b.why);
    }

    // A heat level in the instruction with nothing observable attached to it.
    if (HEAT_LEVEL_WORD.test(s.text || '') && !s.heat?.target && !s.heat?.tempF && !s.heat?.tempC) {
      const m = HEAT_LEVEL_WORD.exec(s.text);
      fail(id, 'heat', `${where} says "${m[0].trim()}" with no observable`,
        'Low and medium are positions on a dial nobody here has seen. Say what the pan should be DOING, and when to check again.');
    }

    if (s.heat) {
      const surf = s.heat.surface;
      if (!EQUIP[surf]) {
        fail(id, 'heat', `${where} heat.surface "${surf}" is not known equipment`);
      } else if (EQUIP[surf].class !== 'heat') {
        fail(id, 'heat', `${where} heat.surface "${surf}" is not a heat source`);
      }
      if (surf === 'stovetop' && !s.heat.target) {
        fail(id, 'heat', `${where} is a stovetop step with no heat.target`,
          'The hob is induction and its burners do not share a dial scale. Say what the pan should be DOING.');
      }
      if (surf === 'oven' && s.heat.tempF === undefined && s.heat.tempC === undefined) {
        fail(id, 'heat', `${where} is an oven step with no temperature`);
      }
      if (surf && eqDeclared.size && !eqDeclared.has(surf)) {
        fail(id, 'closure', `${where} heats on "${surf}" which is not in the recipe's equipment[]`);
      }
    }

    /* ---- doneness. Rule 3. ---- */
    const isCooking = !!s.heat;
    if (isCooking && !s.doneness?.test) {
      fail(id, 'doneness', `${where} applies heat with no doneness test`,
        'A test he can perform with a binary result. "Tilt the pot, is there standing liquid?" not "until it looks ready".');
    }
    if (s.minutes !== undefined && typeof s.minutes !== 'number') {
      fail(id, 'steps', `${where} minutes is not a number`);
    }
  });

  for (const ref of refs) {
    if (!usedIng.has(ref)) {
      fail(id, 'closure', `ingredient "${ref}" is never used by any step`,
        'Either a step is missing it or it should not be on the list. Both are real bugs.');
    }
  }
  for (const e of eqDeclared) {
    if (!usedEq.has(e)) {
      warn(id, 'closure', `equipment "${e}" is declared but no step uses it`);
    }
  }

  /* ---- splits must sum. ----------------------------------------------------
   * Nearly every recipe here splits an ingredient across steps: 2 tbsp of oil going in as 1 tbsp
   * then 1 tbsp, 1.5 cups of milk going in as 0.5 then 1. In prose that is completely uncheckable,
   * which is why an audit of the old recipes turned up eleven quantity mismatches that all had to
   * be resolved by hand and all turned out to be legitimate splits. Declared as data it is
   * arithmetic, so a real drift can finally be told apart from an intended split. */
  for (const [ref, parts] of Object.entries(portions)) {
    const ing = r.ingredients.find((i) => i.ref === ref);
    if (!ing || ing.qty === undefined) continue;
    const required = parts.filter((p) => !p.optional);
    const badUnit = required.find((p) => p.unit && p.unit !== ing.unit);
    if (badUnit) {
      warn(id, 'split', `"${ref}" step ${badUnit.n} is in ${badUnit.unit} but the ingredient is in ${ing.unit}`,
        'Not summed. Use the same unit or convert it on the ingredient.');
      continue;
    }
    const sum = required.reduce((a, p) => a + Number(p.amount || 0), 0);
    if (Math.abs(sum - ing.qty) > 0.01) {
      fail(id, 'split',
        `"${ref}" is declared as ${ing.qty} ${ing.unit} but the steps use ${Number(sum.toFixed(3))}`,
        `Steps ${required.map((p) => p.n).join(', ')}. Either the total is wrong or a step is missing its share.`);
    }
  }

  /* ---- provenance is not optional ----------------------------------------
   * A recipe that cannot say where it came from is a recipe nobody can trust, and 28 of 29 could
   * not say on 2026-08-09. `authored` is a legitimate answer; silence is not. */
  const TIERS = ['sourced', 'adapted', 'authored'];
  if (!r.provenance || !TIERS.includes(r.provenance.tier)) {
    fail(id, 'provenance', 'no provenance.tier',
      `One of ${TIERS.join('|')}. "authored" means an agent wrote it and it must say so in the app.`);
  } else if (r.provenance.tier !== 'authored' && !(r.provenance.sources || []).length) {
    fail(id, 'provenance', `tier is "${r.provenance.tier}" but no sources are listed`,
      'Sourced and adapted both mean a real recipe exists. Name it, or the tier is a claim with nothing behind it.');
  }

  /* ---- protein arithmetic must be shown ---- */
  const p = r.serves?.proteinPerUnit;
  if (p && !r.serves?.proteinMath) {
    fail(id, 'protein', `serves.proteinPerUnit is ${p} with no proteinMath`,
      'He audits these and he is right to. Show the derivation.');
  }

  /* ---- rice ratio, now computed from data rather than regexed out of prose ---- */
  const riceIng = r.ingredients.find((i) => RICE_RATIO[i.stock]);
  const waterIng = r.ingredients.find((i) => i.stock === 'water' || /^water$/i.test(i.display || ''));
  if (riceIng && waterIng) {
    const rc = toCups(riceIng.qty, riceIng.unit);
    const wc = toCups(waterIng.qty, waterIng.unit);
    if (rc && wc) {
      const ratio = wc / rc;
      const band = RICE_RATIO[riceIng.stock];
      if (ratio < band.lo || ratio > band.hi) {
        fail(id, 'ratio',
          `${band.label} rice at ${ratio.toFixed(2)} cups water per cup rice, outside ${band.lo}-${band.hi}`,
          'This exact class of error gave 2 cups water to 2 cups long grain on 2026-08-05 and produced hard rice.');
      }
    }
  }

  /* ---- rice cooker exists now ---- */
  if (riceIng && !eqDeclared.has('ricecooker') && (r.equipment || []).some((e) => e.startsWith('pot_'))) {
    warn(id, 'equipment', 'cooks rice in a pot on the hob',
      'A thermostat rice cooker was bought 2026-08-08 specifically because the hob caused two rice failures. Consider it.');
  }
}

/* ------------------------------------------------------------------ */

if (!existsSync(RECIPES)) {
  console.error(`No recipes directory at ${RECIPES}`);
  process.exit(1);
}

/* --strict is what the build runs. It fails only on recipes that have been AUTHORED, meaning the
 * `_migration` block has been removed. Recipes still carrying it are machine-extracted from the old
 * kitchen.html and are known incomplete, so gating on them would just block every build until all 29
 * are done. This way the backlog burns down and nothing that has been finished can regress. */
const STRICT = process.argv.includes('--strict');
const only = process.argv.find((a) => a !== '--strict' && !a.startsWith('-') && !a.includes('node') && !a.endsWith('.mjs'));
const files = readdirSync(RECIPES).filter((f) => f.endsWith('.json')).filter((f) => !only || f === `${only}.json`);

if (!files.length) {
  console.error(only ? `No recipe "${only}"` : 'No recipes found.');
  process.exit(1);
}

const unmigrated = [];
for (const f of files) {
  const path = join(RECIPES, f);
  let r;
  try {
    r = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(basename(f, '.json'), 'json', `will not parse: ${e.message}`);
    continue;
  }
  if (STRICT && r._migration) { unmigrated.push(r.id || basename(f, '.json')); continue; }
  validate(r, path);
}

/* ---- report ---- */
const byId = {};
for (const o of out) (byId[o.id] ||= []).push(o);

const ids = Object.keys(byId).sort();
for (const id of ids) {
  const rows = byId[id];
  const f = rows.filter((r) => r.level === 'FAIL').length;
  console.log(`\n${f ? 'x' : '!'} ${id}  (${f} fail, ${rows.length - f} warn)`);
  for (const r of rows) {
    console.log(`   ${r.level}  [${r.rule}] ${r.msg}`);
    if (r.hint) console.log(`         -> ${r.hint}`);
  }
}

const checked = files.length - unmigrated.length;
const clean = checked - ids.length;
console.log(`\n${'-'.repeat(70)}`);
if (STRICT && unmigrated.length) {
  console.log(`${unmigrated.length} still machine-migrated, not gated yet: ${unmigrated.join(', ')}`);
}
console.log(`${checked} authored recipes checked, ${clean} clean, ${FAIL} failures, ${WARN} warnings`);
process.exit(FAIL ? 1 : 0);
