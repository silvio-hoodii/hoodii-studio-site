#!/usr/bin/env node
/**
 * Print a recipe as the COOK SCREEN renders it, not as the JSON holds it.
 *
 * Run: node content/kitchen/render.mjs piccata
 *
 * Why this exists, 2026-08-09. Step 2 of piccata shipped with an amounts table reading:
 *
 *     the   butter, cold, cut into 6 cubes
 *     the   garlic cloves, smashed flat, not chopped
 *     the   chicken stock
 *     the   lemon juice, from 1 large fresh lemon
 *     the   capers, drained and rinsed
 *
 * on the one step whose whole job is to put measured amounts on the counter. The JSON was correct,
 * `validate.mjs` passed it clean, and it was unreadable. Every check in this project so far has run
 * against the data. Nothing has ever run against the thing he actually reads.
 *
 * The rendering below MIRRORS CookClient.tsx and has to be kept in step with it. That duplication is
 * deliberate: the alternative is booting a browser to answer "what does step 2 say", which is slow
 * enough that nobody does it, which is how this shipped.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ---- lifted verbatim from CookClient.tsx ---- */

const FRAC = [[0.5, '1/2'], [0.25, '1/4'], [0.75, '3/4'], [1 / 3, '1/3'], [2 / 3, '2/3'], [0.125, '1/8']];

function niceNum(n) {
  const whole = Math.floor(n);
  const rest = n - whole;
  if (rest < 0.02) return String(whole);
  for (const [v, s] of FRAC) if (Math.abs(rest - v) < 0.02) return whole ? `${whole} ${s}` : s;
  return String(Math.round(n * 100) / 100);
}

function amount(qty, unit) {
  if (qty === null || qty === undefined) return '';
  if (unit === 'g' || unit === 'ml') return `${Math.round(qty)} ${unit}`;
  if (!unit || unit === 'each') return niceNum(qty);
  return `${niceNum(qty)} ${unit}`;
}

const asUse = (u) => (typeof u === 'string' ? { ref: u } : u);

/** The qty column for one row of a step's amounts table. Returning null means the row is dropped. */
export function renderQty(use, ing) {
  // amount 0 means the step handles the thing without consuming a share of it. It has no number, so
  // it has no business in a table of numbers: the row is dropped rather than filled with a word.
  if (use.amount === 0) return null;
  if (use.amount !== undefined && use.amount !== null) return amount(use.amount, use.unit ?? ing.unit);
  return amount(ing.qty, ing.unit) || 'the';
}

export function renderRecipe(r) {
  const byRef = Object.fromEntries(r.ingredients.map((i) => [i.ref, i]));
  const usedRefs = new Set(r.steps.flatMap((s) => (s.uses ?? []).map((u) => asUse(u).ref)));

  const prep = r.ingredients
    .filter((i) => usedRefs.has(i.ref))
    .map((i) => ({
      qty: amount(i.qty, i.unit) || '-',
      name: i.display + (i.prep ? `, ${i.prep}` : ''),
    }));

  const steps = r.steps.map((s, k) => {
    const rows = [];
    for (const raw of s.uses ?? []) {
      const u = asUse(raw);
      const ing = byRef[u.ref];
      if (!ing) continue;
      const q = renderQty(u, ing);
      if (q === null) continue;
      rows.push({ ref: u.ref, qty: q, name: ing.display });
    }
    return {
      n: k + 1,
      eyebrow: `STEP ${k + 1} OF ${r.steps.length}${s.minutes ? ` · ABOUT ${s.minutes} MIN` : ''}`,
      text: s.text,
      timer: s.minutes ? `[ Start ${s.minutes} min timer ]` : null,
      rows,
      heat: s.heat?.target ?? (s.heat?.tempF ? `${s.heat.tempF}F` : null),
      recheck: s.heat?.recheck ?? null,
      doneness: s.doneness?.test ?? null,
      warn: s.warn ?? null,
      look: s.look ?? null,
    };
  });

  return { prep, steps };
}

/* ---- printing ---- */

const wrap = (t, width, indent = '') =>
  String(t).split(/\s+/).reduce((lines, w) => {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= width) lines[lines.length - 1] = last + ' ' + w;
    else lines.push(w);
    return lines;
  }, []).map((l) => indent + l).join('\n');

function print(r, { look = false } = {}) {
  const { prep, steps } = renderRecipe(r);
  const W = 92;

  console.log('='.repeat(W));
  console.log(r.name.toUpperCase());
  console.log('='.repeat(W));
  console.log('\nGET THIS OUT FIRST');
  for (const p of prep) console.log(`  ${p.qty.padEnd(11)}  ${p.name}`);

  for (const s of steps) {
    console.log('\n' + '-'.repeat(W));
    console.log(s.eyebrow);
    console.log(wrap(s.text, W));
    if (s.timer) console.log('\n' + s.timer);
    if (s.rows.length) {
      console.log('');
      for (const row of s.rows) console.log(`  ${row.qty.padEnd(11)}  ${row.name}`);
    }
    if (s.heat) console.log('\nHEAT\n' + wrap(s.heat, W - 2, '  ') + (s.recheck ? `\n  Check again: ${s.recheck}` : ''));
    if (s.doneness) console.log('\nHOW YOU KNOW IT IS READY\n' + wrap(s.doneness, W - 2, '  '));
    if (s.warn) console.log('\nCAREFUL\n' + wrap(s.warn, W - 2, '  '));
    if (look && s.look) console.log('\nWHY\n' + wrap(s.look, W - 2, '  '));
  }
  console.log('\n' + '='.repeat(W));
}

/* ---- the read stamp, made mechanical ------------------------------------------------------------
 *
 * `provenance.readAt` claims every step was read AS RENDERED at a given build. Until 2026-08-11 it
 * was a string an agent typed, checked only against `build`, which is ALSO a string an agent typed.
 * So the gate could be satisfied by editing two strings, and it was, repeatedly, on the same evening
 * five invented instructions reached the stove.
 *
 * `readHash` fixes half of that honestly. It is a hash of the rendered text, so it cannot be
 * satisfied by hand: change one word anywhere in any step and the hash moves and the build fails.
 *
 * Be precise about what it does and does not prove. It does NOT prove a human read anything. It
 * proves the text has not changed since whoever stamped it looked. That is exactly what `readAt`
 * always claimed and never enforced. Law 3 of .agents/ENGINEERING.md: report outcomes, not intent.
 */
export function renderHash(r) {
  const { prep, steps } = renderRecipe(r);
  const blob = JSON.stringify({
    name: r.name,
    prep: prep.map((p) => [p.qty, p.name]),
    steps: steps.map((s) => [s.text, s.rows.map((x) => [x.qty, x.name]), s.heat, s.recheck, s.doneness, s.warn, s.look]),
  });
  // djb2. Zero dependencies, same posture as the rest of this pipeline, and collision risk is
  // irrelevant here: this guards against edits, not against an adversary.
  let h = 5381;
  for (let i = 0; i < blob.length; i++) h = ((h << 5) + h + blob.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

/* Only act as a CLI when this file IS the entry point. Without this guard, importing `renderHash`
 * into validate.mjs made `node validate.mjs beefmushroomrice` print a whole rendered recipe and a
 * "set provenance.readHash to this" instruction in the middle of validator output, because the block
 * below reads process.argv regardless of who loaded the module. Caught 2026-08-11 the moment the
 * import landed. */
const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
const id = process.argv.find((a) => !a.includes('node') && !a.endsWith('.mjs') && !a.startsWith('-'));
if (isEntry && id) {
  const recipe = JSON.parse(readFileSync(join(HERE, 'recipes', `${id}.json`), 'utf8'));
  if (process.argv.includes('--hash')) {
    console.log(renderHash(recipe));
  } else {
    print(recipe, { look: process.argv.includes('--why') });
    console.log(`\nrendered-text hash: ${renderHash(recipe)}`);
    console.log('Read every step above, fix what that finds, then set provenance.readHash to this.');
  }
}
