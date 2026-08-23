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
import { renderHash } from './render.mjs';
import { heatEvidence, NO_HEAT_FORMS } from './heat-evidence.mjs';
import { loadCaptures, captureHash } from './import.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECIPES = join(HERE, 'recipes');

/* Captures written by `import.mjs`: the publisher's own ingredient and method lines, fetched and
 * hashed. Indexed by primary source URL so a card can be checked against the page it names. */
const CAPTURES = new Map();
for (const c of loadCaptures()) {
  if (c.source?.url) CAPTURES.set(String(c.source.url).replace(/\/+$/, ''), c);
}

/* Quotes, dashes and spacing differ between a page's markup and anything that has been through a
 * clipboard, and none of those differences is a paraphrase. Everything else is left alone: this
 * normalises typography, not words. */
const normQuote = (s) => String(s)
  .replace(/[‘’ʼ]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[‐-―]/g, '-')
  .replace(/ /g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
/* A SECOND normaliser, for one job: is this run of WORDS inside that run of words.
 *
 * Extracting text out of HTML loses boundaries that were carried by markup rather than by characters.
 * Leitesculinaria wraps "If you have plain, unsauced spaghetti" in a <strong> immediately followed by
 * "Heat enough oil", so its own JSON-LD reads "spaghettiHeat", while the card copied off the rendered
 * page reads "spaghetti: heat". Neither is an invention and comparing them literally reports five.
 *
 * So this drops everything that is not a letter or a digit, spaces included, and the containment test
 * becomes: do the card's letters appear, in order, inside the publisher's letters.
 *
 * WHAT THAT CATCHES: any word added, removed or changed. Which is the whole of the invention problem.
 * WHAT IT DOES NOT: punctuation and spacing. A comma cannot tell him to cook something for 8 minutes.
 * Stated plainly here because a gate whose reach is not written down gets believed for more than it
 * does, which is exactly what the digit-only rule was believed for. */
const normLetters = (s) => String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

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
/* A heat level named in an instruction, which on this induction hob means nothing without an
 * observable beside it.
 *
 * The negative lookahead for "speed" was added 2026-08-23. King Arthur's eggless pasta dough says
 * "using the dough hook on medium speed", and this matched it and demanded a heat observable for a
 * step that applies no heat at all: it is a stand mixer setting, not a dial on a stove. Widening the
 * rule to let that pass would be wrong, so it is narrowed to exactly the phrase that caused it.
 * Everything this rule exists for still fails. */
const HEAT_LEVEL_WORD = /\b(?:on|to|over)\s+(?:a\s+)?(?:low|medium(?:[- ]high|[- ]low)?|high)\b(?!\s+speed)(?:\s+heat)?/i;

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
/* Every key an ingredient may carry, and every one of these reaches a screen. Mirrors the
 * `Ingredient` interface in src/lib/kitchen/types.ts; change one, change the other. The check that
 * uses this is at the bottom of the ingredient loop and explains what it caught. */
const ING_KEYS = new Set([
  'ref', 'stock', 'staple', 'display', 'qty', 'unit', 'prep', 'defining',
  'frozenOk', 'thawText', 'optional', 'betterWith', 'insteadOf', 'altText', 'section',
]);

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
    /* A KEY NOTHING RENDERS IS A NOTE NOBODY READS. Added 2026-08-22.
     *
     * `honeygarlicchicken` carried `standsIn` on its vinegar: a careful paragraph explaining that she
     * says RICE vinegar, the cupboard holds DISTILLED WHITE, and the two are different products. No
     * surface reads that key. Not CookClient, not render.mjs, not this file. The field the app
     * actually renders is `insteadOf`, which exists for precisely this and was added on 2026-08-11
     * after the same confusion about cornstarch standing in for potato starch.
     *
     * So he cooked that dish on 2026-08-16 reading "rice vinegar" on his own prep list, holding a
     * bottle of white, with the explanation sitting in a field that goes nowhere. He asked what rice
     * vinegar was on 2026-08-22, six days later, and the answer had been written and never shown.
     *
     * An invented key is indistinguishable from a typo and both fail silently, which is the whole
     * reason this is a gate and not a line in SOURCING.md. */
    for (const k of Object.keys(ing)) {
      if (!ING_KEYS.has(k)) {
        fail(id, 'ingredients', `"${ing.ref}" has key "${k}", which nothing renders`,
          `Known keys: ${[...ING_KEYS].join(', ')}. If this is meant to reach the screen, use one that does; if it is a note to yourself, it does not belong on the ingredient.`);
      }
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
    /* The banned cues exist because vague instructions failed him at the stove, and every one of
     * them was written by an agent. The verbatim law then created a collision nobody had hit until
     * 2026-08-14: Salt and Lavender's Mongolian beef says "Spoon out excess fat as needed", and
     * `as needed` is banned. Three ways out, and only one is honest. Rewriting her sentence breaks
     * the rule that produced every good outcome this project has had. Dropping it omits a step the
     * source has, which is banned outright. So: a banned cue that is HER phrase, quoted, on a
     * `sourced` recipe, is allowed to stand as her instruction, PROVIDED the step carries a `look`
     * annotation, which is where the amount or the test he actually needs is written.
     *
     * The protection is unchanged where it matters. An agent writing "as needed" into its own prose
     * still fails, because the phrase will not be in sourceText. The exemption cannot be reached by
     * inventing, only by quoting.
     *
     * AMENDED 2026-08-16: the gate used to also require tier `sourced`, and that part was wrong on
     * its own terms. What makes quoting safe is that the phrase is in BOTH sourceText and text, not
     * what the tier says. The tier gate meant an `adapted` recipe was punished for its source's own
     * words: Honey Garlic Chicken is Budget Bytes verbatim except for one tablespoon of vinegar he
     * has not ruled on yet, and her step 4 says "saute for 30-60 seconds until fragrant". Banned
     * cue, her sentence, annotated in `look`, and the only way through was to rewrite her, which is
     * the thing this whole file exists to stop.
     *
     * The hole that gate was accidentally covering is now closed properly, below: the sourceText
     * checks (present, and every number in `text` traceable to it) run on ANY recipe that carries
     * sourceText, not only on `sourced` ones. So an agent still cannot reach this exemption by
     * pasting its own sentence into sourceText and calling it a quote. */
    const quoted = String(s.sourceText || '');
    for (const b of BANNED_CUE) {
      if (!b.re.test(blob)) continue;
      const fromSource = b.re.test(quoted) && b.re.test(String(s.text || ''));
      if (fromSource && String(s.look || '').trim()) continue;
      if (fromSource) {
        fail(id, 'cue', `${where} quotes the source's "${b.re.source}" with no annotation explaining it`,
          `${b.why} Her sentence may stand, but the step must carry a \`look\` that says what it means here.`);
        continue;
      }
      fail(id, 'cue', `${where} uses a banned cue: ${b.re.source}`, b.why);
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

  /* ---- the read gate -------------------------------------------------------
   * `provenance.readAt` says which build had every step read AS RENDERED. Edit the recipe without
   * re-reading it and the stamp goes stale, this fails, and the app stops offering the dish.
   *
   * This is the only rule here that is not about the data. It exists because on 2026-08-09 a recipe
   * passed every other rule in this file, shipped, and had eleven defects in the rendered output,
   * two of which would have ruined the dish. A validator that only reads JSON cannot see the word
   * "the" appearing five times in a table, because that word is nowhere in the JSON. */
  /* ---- sourcing. See schema/SOURCING.md, decided 2026-08-09. ----------------
   * Tier `sourced` means the steps are one published recipe's own sentences, and an agent has only
   * annotated them. These three rules are what make that a mechanical claim rather than a promise:
   * a translation can be diffed against its original, and an invention cannot hide in one. */
  /* ---- verbatim only. Decided by Silvio 2026-08-11, and this is Law 1 of
   * ~/.agents/ENGINEERING.md made mechanical: eliminate the class, do not validate instances.
   *
   * Five defects reached him from ONE recipe in one evening. Every single one was an agent sentence
   * rather than a figure a source gave: a pot swapped for her skillet (retained the water her wide
   * pan drives off), "mostly brown" where she says 80 percent COOKED, a fond note about a dish that
   * has no fond, rice converted into US cups the appliance does not use, and a nappe sauce test where
   * she asks for "just a little sticky". His verdict: "there's no one single recipe that I have been
   * able to do... are we just spending tokens for nothing?"
   *
   * Prose already forbade all of this. SOURCING.md has been binding since 2026-08-09 and every one of
   * those five violated it. So the tier is now load-bearing instead of descriptive:
   *
   *   ANY deviation at all disqualifies `sourced`. No classification, no size threshold, no
   *   judgement call to argue into. One entry in `deviations` and the tier must be `adapted`.
   *
   * And only `sourced` is offered (see isRead in kitchen/page.tsx). The catalogue gets very small.
   * It was already 1 of 30, and honest-and-tiny beats broad-and-broken. */
  /* AMENDED 2026-08-12, and the amendment matters more than the original rule.
   *
   * The first version disqualified `sourced` on ANY deviation. That banned the wrong thing. Reviewing
   * the five defects of 08-11: a pot swapped for a skillet, an invented browning target, an invented
   * fond note, an invented unit conversion, and a sauce test three times thicker than the source
   * asks for. NOT ONE was an ingredient substitution. Cornstarch for potato starch worked. Cremini
   * for enoki worked. Fresh shiitake for dried worked. Sirloin for ribeye worked. Same for piccata:
   * all four failures were prose, not swaps.
   *
   * So the defect class is agent-authored CONTENT, not substitution. And banning substitution took
   * the catalogue to 0 of 30 and told him he could not cook gyudon over rice he owns. His answer:
   * "Why couldn't we just replace that with long grain rice... I don't think something needing 450
   * versus 500 would make such a difference." He is right, and on his own dish he is the one who
   * should decide.
   *
   * So `decidedBy` is now load-bearing:
   *   'silvio' - he chose it, having been told the consequence. Does NOT disqualify `sourced`.
   *   'agent'  - an agent chose it on his behalf. DISQUALIFIES `sourced`. This is the whole defect
   *              class and it stays banned.
   * Absent counts as 'agent', because an unattributed change is one nobody owns. */
  const devs = Array.isArray(r.deviations) ? r.deviations : [];
  const agentDevs = devs.filter((d) => (d.decidedBy ?? 'agent') !== 'silvio');
  if (r.provenance?.tier === 'sourced' && agentDevs.length) {
    fail(id, 'verbatim',
      `tier is "sourced" but ${agentDevs.length} deviation(s) were decided by an agent`,
      'An agent may not change a published recipe on his behalf: vessel, scale, heat and cues are '
      + 'exactly where all nine defects came from. He MAY change it himself. Ask him, state the '
      + 'consequence, and set decidedBy:"silvio" with what he was told. Otherwise the tier is '
      + '`adapted` and the dish is not offered. First offenders: '
      + agentDevs.map((d) => JSON.stringify(String(d.what).slice(0, 40))).join(', '));
  }
  for (const d of devs) {
    if (d.decidedBy === 'silvio' && !d.toldHim) {
      warn(id, 'verbatim', `"${String(d.what).slice(0, 40)}" says he decided it but not what he was told`,
        'His decision is only informed if the consequence was stated. Record it in `toldHim`.');
    }
  }

  if (r.provenance?.tier === 'sourced') {
    const primary = (r.provenance.sources || []).filter((s) => s.primary);
    if (primary.length !== 1) {
      fail(id, 'sourcing', `tier is "sourced" but ${primary.length} sources are marked primary`,
        'Exactly one. Following six recipes at once is how an agent ends up writing a seventh.');
    } else if (!primary[0].url) {
      fail(id, 'sourcing', 'the primary source has no url', 'It has to be checkable against the original.');
    }
  }

  /* THE SOURCETEXT CHECKS RUN ON ANY RECIPE THAT CARRIES SOURCETEXT, not only on `sourced` ones.
   * Widened 2026-08-16 alongside the banned-cue exemption above, and it is what makes that widening
   * safe: sourceText now buys a quoting exemption, so sourceText itself has to be checked wherever
   * it appears. A recipe one field away from `sourced` was previously getting its quotes ignored and
   * its numbers unchecked at the same time, which is the wrong half of both rules.
   *
   * A recipe with no sourceText anywhere is untouched by this: it is `authored`, it is not offered,
   * and it says so on its own card. */
  const anySourceText = r.steps.some((s) => String(s.sourceText || '').trim());
  if (r.provenance?.tier === 'sourced' || anySourceText) {
    for (const s of r.steps) {
      const src = (s.sourceText || '').trim();
      if (!src) {
        fail(id, 'sourcing', `step ${s.n} has no sourceText`,
          'The published sentence this step came from, verbatim. Without it nothing can tell an annotation from an invention.');
        continue;
      }
      /* Numbers are where cooking instructions live and die: times, temperatures, amounts. Any that
       * appear in what he reads must be traceable to the source. This is the check that would have
       * caught a step-10 heat instruction being made up, and its absence being invented around. */
      const nums = (t) => new Set((String(t).match(/\d+(?:[.,/]\d+)?/g) || []));
      const inSource = nums(src);
      for (const n of nums(s.text)) {
        if (!inSource.has(n)) {
          fail(id, 'sourcing', `step ${s.n} says "${n}" and the source text does not`,
            'A time, temperature or amount that is not in the source is an invention. Quote the source or drop the number.');
        }
      }
    }
  }

  /* ---- sourceText must match the CAPTURED page, not just the step beside it ----
   *
   * Added 2026-08-17, and it closes the last hole in the verbatim rule.
   *
   * The check above compares `text` to `sourceText`. Both are typed by the same agent, so it verifies
   * that an agent agrees with itself, and every one of the five inventions that reached the stove on
   * 2026-08-11 would have passed it: an agent that paraphrases a sentence paraphrases it into both
   * fields. `content/kitchen/import.mjs` fetches the publisher's own method and hashes it, so the
   * question "did you invent this" is now a diff against the page rather than a promise.
   *
   * A card step may quote PART of a published step (splitting one long paragraph into two screens is
   * annotation, not invention) so the test is containment, not equality. The reverse, one card step
   * spanning two published ones, is caught because the join would not appear in either.
   *
   * Missing capture is a WARNING rather than a failure, and deliberately so: `_stockAtCapture` aside,
   * a capture is a network fetch, and a rule that fails the build when a site is down would get
   * disabled the first time it fired. Present-and-disagreeing is the case that means something.
   */
  const primaryUrl = (r.provenance?.sources || []).find((s) => s.primary)?.url;
  const cap = primaryUrl ? CAPTURES.get(String(primaryUrl).replace(/\/+$/, '')) : null;
  if (cap) {
    if (captureHash(cap) !== cap.captureHash) {
      fail(id, 'capture', `the capture for ${cap.id} has been edited by hand`,
        'imported/*.json is evidence. Its hash is over the ingredient and method lines, so editing '
        + 'either breaks it. Re-run content/kitchen/import.mjs rather than correcting the page here.');
    }
    const published = cap.instructions.map(normQuote);

    /* ---- NO INVENTION. What he READS has to be inside what she WROTE. ----
     *
     * Added 2026-08-17, hours after the capture check, because an adversary pointed at the hole the
     * capture check left wide open: `text` is the field `CookClient` renders as the instruction, and
     * NOTHING compared it to anything. The digit rule below compares numbers. The capture rule above
     * compares `sourceText`. Both of those can pass while `text` says something she never wrote,
     * because an agent supplies both fields in the same edit.
     *
     * That is not hypothetical. THREE OF THE FIVE INVENTIONS THAT REACHED THE STOVE ON 2026-08-11
     * CARRY NO DIGITS: the note calling the pot's browned bits "most of the flavour", "mostly brown"
     * replacing her "80 percent cooked", and "coats the back of the spoon and holds the line" for a
     * sauce she calls "just a little sticky". Every one would pass a validator built in their name.
     *
     * Containment rather than equality, so one long published paragraph can still be split across two
     * screens: each step quotes the whole published step as `sourceText` and shows its own slice.
     * Adding a word is impossible, changing one is impossible.
     *
     * The teaching voice does not go away. It lives in `look`, `heat` and `doneness`, which are
     * separate fields that the cook screen already renders as visibly not-her-sentence. That was
     * always the design; this is what makes it true. */
    for (const s of r.steps) {
      const txt = normLetters(s.text || '');
      const src = normLetters(s.sourceText || '');
      if (!txt || !src) continue;
      if (src.includes(txt)) continue;
      fail(id, 'sourcing', `step ${s.n} shows an instruction that is not inside its sourceText`,
        'What he reads has to be her sentence or part of it. Adding to it, or rewording it, is the '
        + 'invention that burnt the first dish this app ever cooked. Teaching goes in `look`, `heat` '
        + 'and `doneness`, which render as visibly ours.');
    }

    /* ---- NO OMISSION. Every sentence she published has to reach the screen. ----
     *
     * The other half, and the harder one. `SOURCING.md` says the defects are "gaps BETWEEN the
     * numbers" and "a check cannot see an absence it was not told to look for". This tells it to look.
     *
     * Found live by the same pass: Leftover Pasta Frittata step 2 drops "If you have plain, unsauced
     * spaghetti:" from the front of her sentence, turning a CONDITIONAL into an unconditional
     * instruction, on a dish that is offered. Under containment alone that is legal, because a
     * shorter slice is still a slice.
     *
     * Structural steps a publisher writes for the page rather than the pan ("Mix the eggs.",
     * "Prep the pasta.") are the reason this is a warning and not a failure: dropping a heading is
     * fine and dropping a condition is not, and nothing in the text tells them apart. So it reports
     * every published sentence no step shows, and a human decides. That is honest about what it can
     * and cannot know, which beats a rule that fails on headings and gets switched off. */
    const shown = normLetters(r.steps.map((s) => s.text || '').join(' '));
    for (const p of cap.instructions) {
      const whole = normLetters(p);
      if (!whole || whole.length < 12) continue;
      if (shown.includes(whole)) continue;
      // Sentence by sentence, so a long published step is not reported whole over one missing clause.
      const missing = p.split(/(?<=[.!?])\s+/).filter((x) => normLetters(x).length >= 12 && !shown.includes(normLetters(x)));
      if (!missing.length) continue;
      warn(id, 'sourcing', `${missing.length} published sentence(s) reach no step`,
        `She wrote: "${missing[0].slice(0, 120)}". If that is a heading for the page, fine. If it is a `
        + 'condition, a temperature or a step, he never sees it, and an absence is the defect class '
        + 'this whole schema exists for.');
    }

    /* Against the WHOLE method joined, not entry by entry. Publishers using schema.org HowToSection
     * emit the section name and its step as separate entries ("Mix the eggs", then "Crack the 6 large
     * eggs..."), and a card that quotes both as one step is re-chunking, not inventing. Order is still
     * enforced, because containment in a joined string is containment in sequence. */
    const publishedAll = normLetters(cap.instructions.join(' '));
    for (const s of r.steps) {
      const src = normLetters(s.sourceText || '');
      if (!src) continue;   // already failed above where sourceText is required
      if (publishedAll.includes(src)) continue;
      fail(id, 'capture', `step ${s.n} quotes a sentence that is not on the source page`,
        `Its sourceText does not appear in imported/${cap.id}.json, which was fetched from `
        + `${cap.source.url} on ${cap.fetchedAt}. Either it was retyped from memory, or the page has `
        + 'changed since capture. Re-run import.mjs to see which.');
    }
  } else if (r.provenance?.tier === 'sourced' && primaryUrl) {
    /* PROMOTED FROM WARN TO FAIL, 2026-08-17, the same day it was written. It shipped as a warning on
     * the reasoning that a capture is a network fetch and a gate that fails when a site is down gets
     * disabled the first time it fires. An adversarial pass found what that actually bought: two
     * `sourced` recipes were OFFERED with no capture at all, so half the catalogue carried a warning
     * nobody reads while three separate documents told the reader that a quote the page does not
     * carry fails the build.
     *
     * The objection was about RE-fetching, and this does not re-fetch. It requires the capture to
     * EXIST, which is a file on disk, checked offline. */
    fail(id, 'capture', `tier is "sourced" and there is no captured source`,
      `Nothing can check its quotes against the publisher, so "verbatim" is an agent's word for it. `
      + `Run: node content/kitchen/import.mjs ${primaryUrl} --id ${id}`);
  }

  /* SOURCING.md's enforcement list says "provenance.readAt still required" and this file never
   * required it: the check below is guarded on the field EXISTING, so a sourced recipe with no readAt
   * validated clean. A binding document listing a rule its enforcement layer does not contain is the
   * worst kind of decoration, because it reads as covered. Found 2026-08-17. */
  if (r.provenance?.tier === 'sourced' && !r.provenance.readAt) {
    fail(id, 'read', 'tier is "sourced" and there is no provenance.readAt',
      'Nobody has recorded reading this as it renders. Read it, then stamp the build you read.');
  }

  if (r.provenance?.readAt && r.provenance.readAt !== r.build) {
    fail(id, 'read', `readAt is "${r.provenance.readAt}" but build is "${r.build}"`,
      'The recipe changed after it was last read. Render every step (node content/kitchen/render.mjs '
      + `${id}, or walk the real screens), read them, fix what that finds, then set readAt to the new build.`);
  }

  /* `readAt` compares one hand-typed string to another, so two edits satisfy it. `readHash` is a hash
   * of the RENDERED text and cannot be satisfied by hand. Law 3: report outcomes, not intent.
   * Warn rather than fail while recipes are being migrated onto it; promote to fail once all offered
   * recipes carry one. */
  if (r.provenance?.readHash) {
    const actual = renderHash(r);
    if (actual !== r.provenance.readHash) {
      fail(id, 'read', `readHash is "${r.provenance.readHash}" but the rendered text hashes to "${actual}"`,
        `The words he would read have changed since anyone checked them. Run: node content/kitchen/render.mjs ${id}`);
    }
  } else if (r.provenance?.tier === 'sourced') {
    /* PROMOTED FROM WARN TO FAIL, 2026-08-17. The comment above has said "promote to fail once all
     * offered recipes carry one" since the field was added, and an adversarial pass checked: all of
     * them do, and have for a while. The condition was met and nobody came back to do it, which is
     * how a warning becomes permanent. Meanwhile AGENTS.md told its reader that changing one word
     * makes the deploy die, which was true only for recipes that had opted in. */
    fail(id, 'read', 'tier is "sourced" and there is no provenance.readHash',
      `readAt alone is two hand-typed strings agreeing, and one agent types both. Run: node content/kitchen/render.mjs ${id}`);
  }

  /* Same bar for the other route into the menu, added 2026-08-21 alongside the `cookedResult`
   * clause in isOfferable(). A card he has cooked and rated good is now OFFERED whatever its tier,
   * which means `readAt` would be the only thing standing between an edit and his screen, and
   * `readAt` is two hand-typed strings agreeing with one agent typing both. That is the exact
   * weakness readHash was introduced to remove, so the new door gets the same lock as the old one
   * rather than a promise to be careful. */
  if (r.provenance?.cookedResult === 'worked' && !r.provenance.readHash) {
    fail(id, 'read', 'cookedResult is "worked" (so it is offered) and there is no provenance.readHash',
      `Being cooked successfully admits a card regardless of tier, so nothing else is checking that `
      + `the words on screen are the words anyone read. Run: node content/kitchen/render.mjs ${id}`);
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

/* ---- the no-heat claim, cross-checked against the words on the screen ----------------------------
 *
 * `isOfferable()` will offer an UNSOURCED recipe if it is an assembly or macro that applies no heat,
 * because every defect that ever reached the stove was an invented heat, timing or doneness
 * instruction and something that never heats anything cannot carry that. The reasoning holds. The
 * first implementation of the test did not: it asked `!steps.some(s => s.heat)`, so a missing field
 * counted as a claim of no heat, and eight recipes in this corpus print oven temperatures and
 * air-fryer times while carrying `heat` on no step at all. All eight answered "no heat".
 *
 * So the claim is now explicit (`provenance.heatFree`) and this is what makes it worth anything.
 * It runs on EVERY recipe, migrated or not, because the eight unpopulated ones are all migrated and
 * the `_migration` skip is the reason nothing ever caught this.
 */
function checkHeatClaim(r, id, migrated) {
  const claimed = r.provenance?.heatFree === true;
  const ev = heatEvidence(r);

  if (claimed && ev.length) {
    const shown = ev.slice(0, 4).map((e) => `${e.where} ${e.why}${e.match ? ` ("${e.match}")` : ''}`);
    fail(id, 'heat', `provenance.heatFree is true, but ${ev.length} thing(s) in it apply heat: ${shown.join('; ')}`,
      'heatFree is what lets an unsourced recipe be offered at all. Either the claim is wrong, or the '
      + `heat is real and this needs a published source. Run: node content/kitchen/heat-evidence.mjs ${id} -v`);
  }

  // The other direction is not a failure, just a dish sitting on the shelf for no reason.
  if (!claimed && !migrated && NO_HEAT_FORMS.has(r.form) && !ev.length && r.provenance?.tier !== 'sourced') {
    warn(id, 'heat', 'applies no heat and could be offered, but does not claim provenance.heatFree',
      'Nothing here heats anything, so it is eligible for the no-heat bar. Read it as rendered, then set heatFree: true.');
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
  const rid = r.id || basename(f, '.json');
  // Deliberately OUTSIDE the _migration skip below. All eight recipes that claimed no heat while
  // printing oven temperatures were migrated ones, so skipping them is precisely how this stayed
  // invisible. It only ever fails on a false claim, so it cannot deadlock the migration backlog.
  checkHeatClaim(r, rid, !!r._migration);
  /* THE EXEMPTION IS A FROZEN LIST, NOT A FIELD AN AGENT CAN SET. Added 2026-08-17.
   *
   * `_migration: true` used to skip the ENTIRE validator under --strict, and nothing stopped a brand
   * new file from carrying it. Three separate documents say "a broken recipe cannot deploy"; what was
   * true is "a recipe that does not claim the exemption cannot deploy", and the exemption was one key
   * an agent types. That is opt-out validation described as mandatory validation.
   *
   * These 21 ids are the machine-extracted recipes that genuinely predate the schema. The list is
   * closed. A new file claiming `_migration` now fails, which is the only way this backlog shrinks
   * instead of growing. */
  const MIGRATION_BACKLOG = new Set(["arroztapado", "bankbeef", "bolognese", "bread", "brownsplit", "bulgogi", "chaufa", "chicken", "crepes", "gyudon", "knifeonion", "meatballs", "pasta", "pickledonion", "pickles", "quarters", "roast", "roastveg", "stuffedpeppers", "tilapia", "tzatziki"]);
  if (r._migration && !MIGRATION_BACKLOG.has(rid)) {
    fail(rid, 'structure', '`_migration: true` on a recipe that is not in the frozen backlog',
      'That flag skips every other check in this file and the backlog is closed. Fix the recipe '
      + 'against schema/RECIPE-SCHEMA.md rather than opting it out of the schema.');
  }
  if (STRICT && r._migration && MIGRATION_BACKLOG.has(rid)) { unmigrated.push(rid); continue; }
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
