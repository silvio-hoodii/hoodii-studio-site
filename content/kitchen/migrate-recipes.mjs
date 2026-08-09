#!/usr/bin/env node
/**
 * One-shot migration: the DISHES array in kitchen.html -> recipes/<id>.json
 *
 * Mechanical fields are carried across exactly. The interesting part is the inference pass, which
 * tries to reconstruct the links that never existed:
 *
 *   - step.uses       inferred by matching ingredient words against the step's own text
 *   - step.equipment  inferred by matching schema/equipment.json names against the step's text
 *   - step.heat       inferred from heat words + the presence of a temperature
 *
 * Everything it infers is marked `"_inferred": [...]` on the step so a review pass can find it.
 * Everything it CANNOT infer is simply left out, and validate.mjs then reports it as a failure.
 * That report is the point: it is the first complete list of what these recipes never said.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const STOCK = JSON.parse(readFileSync(join(HERE, 'stock', 'items.json'), 'utf8'));
const STOCK_ITEMS = STOCK.items || STOCK;

/* ---------- pull the array out of the HTML ---------- */
const html = readFileSync(join(HERE, 'kitchen.html'), 'utf8');
const start = html.indexOf('const DISHES = [');
const end = html.indexOf('const SUBS=');
if (start < 0 || end < 0) throw new Error('could not locate DISHES array');
const src = html.slice(start + 'const DISHES = '.length, end).trim().replace(/;\s*$/, '');
const DISHES = eval(src);
console.log(`parsed ${DISHES.length} dishes from kitchen.html\n`);

/* ---------- helpers ---------- */
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const FRAC = { '1/2': 0.5, '1/4': 0.25, '3/4': 0.75, '1/3': 1 / 3, '2/3': 2 / 3, '1/8': 0.125, '1/16': 0.0625 };

function parseQty(raw) {
  const s = String(raw || '').trim();
  if (!s) return { qty: null, unit: null };
  // "1 1/2 cups", "1/2 tbsp", "500 g", "2 cups", "1 pat", "113 g"
  const m = s.match(/^(?:(\d+)\s+)?(\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return { qty: null, unit: null, rawQty: s };
  const whole = m[1] ? Number(m[1]) : 0;
  const part = FRAC[m[2]] !== undefined ? FRAC[m[2]] : Number(m[2]);
  const qty = whole + part;
  const unit = (m[3] || '').trim().toLowerCase() || 'each';
  return { qty, unit: unit.replace(/\.$/, '') };
}

function slugRef(display, taken) {
  let base = strip(display).toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .split(/[,(.]/)[0]
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28) || 'item';
  let ref = base, i = 2;
  while (taken.has(ref)) ref = `${base}_${i++}`;
  taken.add(ref);
  return ref;
}

/* stock matching: score a display string against the stock catalogue, restricted to the dish's
 * declared needs[] where possible, since those ids were hand-checked and are trustworthy. */
function matchStock(display, needs) {
  const d = strip(display).toLowerCase();
  const cands = (needs && needs.length ? needs : Object.keys(STOCK_ITEMS)).filter((id) => STOCK_ITEMS[id]);
  let best = null, bestScore = 0;
  for (const id of cands) {
    const name = String(STOCK_ITEMS[id].n || id).toLowerCase();
    let score = 0;
    if (d.includes(name) || name.includes(d.split(' ')[0])) score = name.length;
    for (const w of name.split(/[\s,]+/)) {
      if (w.length > 3 && d.includes(w)) score = Math.max(score, w.length);
    }
    if (d.includes(id) || id.includes(d.replace(/[^a-z]/g, '').slice(0, 6))) score = Math.max(score, id.length);
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return bestScore >= 4 ? best : null;
}

/* equipment matching against the canonical vocabulary */
const EQ_WORDS = [
  [/\bnon-?stick\b/i, 'pan_nonstick_large'],
  [/\bstainless\b/i, 'pan_stainless_large'],
  [/\bair fry(er)?\b/i, 'airfryer'],
  [/\bpanini\b/i, 'paninipress'],
  [/\bmicrowave\b/i, 'microwave'],
  [/\brice cooker\b/i, 'ricecooker'],
  [/\boven\b/i, 'oven'],
  [/\bbaking (tray|sheet)\b|\bsheet pan\b|\btray\b/i, 'bakingtray'],
  [/\bpot with a lid\b|\boven-?safe pot\b|\bdutch oven\b/i, 'pot_ovensafe_lid'],
  [/\blarge pot\b/i, 'pot_large'],
  [/\bsmall pot\b/i, 'pot_small'],
  [/\bpot\b|\bsaucepan\b/i, 'pot_medium'],
  [/\bpan\b|\bskillet\b/i, 'pan_nonstick_large'],
  [/\bblender\b/i, 'blender_bullet'],
  [/\bslicer\b|\bgrate/i, 'slicer_multiblade'],
  [/\bmixing bowl\b|\blarge bowl\b/i, 'mixingbowl_large'],
  [/\bbowl\b/i, 'bowlset'],
  [/\brolling pin\b/i, 'rollingpin'],
  [/\bpastry mat\b/i, 'pastrymat'],
  [/\bstrainer\b|\bfine mesh\b|\bsieve\b/i, 'strainer'],
  [/\bcolander\b/i, 'colander'],
  [/\bknife\b|\bslice\b|\bchop\b|\bdice\b|\bmince\b/i, 'knife_sharp'],
  [/\bcutting board\b|\bchopping board\b/i, 'cuttingboard'],
  [/\bsharpener\b/i, 'knifesharpener'],
  [/\bspatula\b/i, 'spatula'],
  [/\bwooden spoon\b/i, 'woodenspoon'],
  [/\bwhisk\b/i, 'whisk'],
  [/\boven mitt\b/i, 'ovenmitts'],
  [/\bscale\b|\bweigh\b/i, 'scale_digital'],
  [/\bthermometer\b|\b165\s?°?f\b/i, 'thermometer'],
  [/\bmeasuring cup\b/i, 'measuringcups'],
  [/\bmeasuring spoon\b/i, 'measuringspoons'],
  [/\btea towel\b/i, 'teatowel'],
  [/\bparchment\b/i, 'parchment'],
  [/\bpaper towel\b/i, 'papertowel'],
  [/\bfreezer bag\b|\bziplock\b/i, 'freezerbag_large'],
  [/\bsharpie\b|\blabel\b/i, 'sharpie'],
  [/\bjars?\b/i, 'jars'],
  [/\bplate\b/i, 'plates'],
];

function inferEquipment(text) {
  const found = new Set();
  for (const [re, id] of EQ_WORDS) if (re.test(text)) found.add(id);
  return [...found];
}

/* heat inference */
const OVEN_TEMP = /(\d{3})\s*°?\s*f\b/i;
const HEAT_WORD = /\b(medium-high|medium-low|medium|high heat|low heat|simmer|boil|sear|fry|saut|preheat|bake|roast)\b/i;

function inferHeat(text, equipment) {
  if (!HEAT_WORD.test(text)) return null;
  const t = OVEN_TEMP.exec(text);
  if (t && (equipment.includes('oven') || /oven|bake|roast|preheat/i.test(text))) {
    return { surface: 'oven', tempF: Number(t[1]) };
  }
  if (equipment.includes('airfryer')) {
    const at = OVEN_TEMP.exec(text);
    return { surface: 'airfryer', ...(at ? { tempF: Number(at[1]) } : {}) };
  }
  if (equipment.some((e) => e.startsWith('pan_') || e.startsWith('pot_'))) {
    return { surface: 'stovetop', _needsTarget: true };
  }
  return null;
}

const FORM = {
  knifeonion: 'technique', piccata: 'technique',
  brownsplit: 'method', bankbeef: 'method',
  yogurtbowl: 'assembly', shake: 'assembly', smoothie: 'assembly', oats: 'assembly',
  ccbites: 'macro',
};
const MEAL = {
  breakfast: ['breakfast'], fast: ['dinner'], batch: ['dinner'], side: ['side'],
  dessert: ['dessert'], learn: ['dinner'], project: ['project'],
};

/* ---------- convert ---------- */
if (!existsSync(join(HERE, 'recipes'))) mkdirSync(join(HERE, 'recipes'));

const report = [];

for (const d of DISHES) {
  const taken = new Set();
  const ingredients = [];
  const equipFromList = new Set();
  let section = null;

  const rawSteps = d.steps || [];
  const ingBlock = rawSteps[0] && rawSteps[0].ing ? rawSteps[0].ing : [];

  for (const row of ingBlock) {
    if (!Array.isArray(row)) continue;
    if (row.length === 1) { section = strip(row[0]).toUpperCase(); continue; }
    const [rawQty, rawName] = row;
    const display = strip(rawName);
    if (!display) continue;

    if (section === 'EQUIPMENT') {
      inferEquipment(display).forEach((e) => equipFromList.add(e));
      continue;
    }
    const { qty, unit, rawQty: unparsed } = parseQty(rawQty);
    const ref = slugRef(display, taken);
    const stock = matchStock(display, d.needs);
    ingredients.push({
      ref,
      ...(stock ? { stock } : {}),
      display,
      ...(qty !== null ? { qty, unit } : {}),
      ...(unparsed ? { _rawQty: unparsed } : {}),
      ...(section && section !== 'GET OUT' ? { section: section.toLowerCase() } : {}),
    });
  }

  /* steps: everything after the ingredient block */
  const steps = [];
  const equipUsed = new Set(equipFromList);

  rawSteps.slice(ingBlock.length ? 1 : 0).forEach((s, idx) => {
    if (s.ing) return;
    const text = strip(s.i);
    if (!text) return;


    const eq = inferEquipment(text);
    eq.forEach((e) => equipUsed.add(e));

    const uses = ingredients
      .filter((ing) => {
        const head = strip(ing.display).toLowerCase().split(/[,(]/)[0];
        const words = head.split(/\s+/).filter((w) => w.length > 3);
        return words.some((w) => new RegExp(`\\b${w.replace(/[^a-z0-9]/g, '')}`, 'i').test(text));
      })
      .map((ing) => ing.ref);

    const heat = inferHeat(text, eq);
    if (heat?.surface) { eq.push(heat.surface); equipUsed.add(heat.surface); }

    steps.push({
      n: idx + 1,
      text,
      ...(uses.length ? { uses } : {}),
      ...(eq.length ? { equipment: eq } : {}),
      ...(s.mins ? { minutes: s.mins } : {}),
      ...(heat ? { heat } : {}),
      ...(s.look ? { look: strip(s.look) } : {}),
      ...(s.warn ? { warn: strip(s.warn) } : {}),
      _inferred: [...(uses.length ? ['uses'] : []), ...(eq.length ? ['equipment'] : []), ...(heat ? ['heat'] : [])],
    });
  });

  const recipe = {
    id: d.id,
    name: d.name,
    build: '2026-08-09-migrated',
    form: FORM[d.id] || 'dish',
    meal: MEAL[d.group] || ['dinner'],
    ...(d.why ? { why: strip(d.why) } : {}),
    ...(d.src ? { source: { name: d.src.who, url: d.src.url, why: strip(d.src.why || '') } } : {}),
    ...(d.deviates ? { deviations: d.deviates.map((x) => ({ what: strip(x.what), why: strip(x.why) })) } : {}),
    time: { totalMin: d.mins ?? null, note: d.time || null },
    serves: d.serve
      ? { count: d.serve.count, unit: d.serve.unit, proteinPerUnit: d.serve.p }
      : { count: null, unit: null, proteinPerUnit: null },
    ingredients,
    equipment: [...equipUsed],
    steps,
    _migration: {
      from: 'kitchen.html DISHES array',
      at: new Date().toISOString().slice(0, 10),
      legacyNeeds: d.needs || null,
      note: 'Fields under _inferred were guessed by migrate-recipes.mjs and need a human pass.',
    },
  };

  writeFileSync(join(HERE, 'recipes', `${d.id}.json`), JSON.stringify(recipe, null, 2) + '\n');
  report.push({
    id: d.id,
    ings: ingredients.length,
    noQty: ingredients.filter((i) => i.qty === undefined).length,
    noStock: ingredients.filter((i) => !i.stock).length,
    steps: steps.length,
    equip: equipUsed.size,
  });
}

console.log('id                 ings  no-qty  no-stock  steps  equip');
for (const r of report) {
  console.log(
    r.id.padEnd(18),
    String(r.ings).padStart(4),
    String(r.noQty).padStart(7),
    String(r.noStock).padStart(9),
    String(r.steps).padStart(6),
    String(r.equip).padStart(6),
  );
}
console.log(`\nwrote ${report.length} files to recipes/`);
