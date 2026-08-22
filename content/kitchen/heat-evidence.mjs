#!/usr/bin/env node
/**
 * Positive evidence that a recipe applies heat, read from the words a cook actually sees.
 *
 * Run: node content/kitchen/heat-evidence.mjs        (audits every recipe)
 *      node content/kitchen/heat-evidence.mjs oats   (one recipe)
 *
 * Why this exists, 2026-08-13. `isOfferable()` was relaxed that morning so a no-heat assembly could
 * be offered without a published source, on the reasoning that a dish which never applies heat cannot
 * carry the invented-heat/timing/doneness defect `SOURCING.md` exists to rule out. The reasoning is
 * sound. The test was not: it asked `!r.steps.some(s => s.heat)`, so it read a MISSING FIELD as a
 * claim of no heat.
 *
 * That field is empirically unpopulated. An audit the same day found EIGHT recipes in the corpus whose
 * steps say "Oven to 450F", "Air fryer at 375F for 10 minutes", "Bake 18 to 20 minutes" and carry no
 * `heat` on any step: bread, chicken, meatballs, quarters, roast, roastveg, tilapia, and the Dutch-oven
 * half of bread. Every one of them answered "no heat" to that question. They stayed out of the app only
 * because their `form` is `dish` and their read stamps are stale, neither of which has anything to do
 * with whether heat is applied. The gate was safe by coincidence.
 *
 * `_migration` recipes are skipped by `validate.mjs --strict`, so nothing was ever going to populate
 * that field on its own. Law 1 of .agents/ENGINEERING.md: eliminate the class, do not validate
 * instances. So "no heat" stops being an absence and becomes an assertion (`provenance.heatFree`)
 * that this file checks against the text, and the build refuses a contradiction between them.
 *
 * Zero dependencies, same posture as validate.mjs and render.mjs.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const EQUIP = JSON.parse(readFileSync(join(HERE, 'schema', 'equipment.json'), 'utf8')).equipment;

/** Equipment that IS a heat source, straight off the canonical vocabulary rather than a word list.
 *  Declaring one of these is the cleanest possible evidence: it is structured, and the schema already
 *  forces every `equipment` ref to resolve here. */
export const HEAT_EQUIPMENT = new Set(
  Object.entries(EQUIP).filter(([, v]) => v.class === 'heat').map(([k]) => k),
);

/* Things that read as heat but are not. Stripped BEFORE the patterns run, because "baking tray" and
 * "baking sheet" appear all over cold prep steps ("line a tray with parchment") and a false "this
 * applies heat" is not free: it would silently drop an honest assembly out of the app.
 *
 * The `roast` entries are the interesting ones. In THIS kitchen "the roast" is a 1 kg sirloin tip, a
 * noun, and it appears in four steps of `bankbeef` and one of `tzatziki`, none of which cook anything.
 * A heat detector that cannot tell a cut of beef from a cooking verb reports five dishes as heated
 * that are not. */
const NOT_HEAT = [
  /\bbaking (?:tray|sheet|paper|dish|powder|soda|mat)\b/gi,
  /\bfrying pan\b/gi,        // the vessel, named while cold. An actual heat step also says what it is doing.
  /\bhot sauce\b/gi,
  /\bhot water from the tap\b/gi,
  /\bheat[- ]proof\b/gi,
  /\boven mitts?\b/gi,       // reaching for mitts is not the heat; the step that heats says so itself.
  /\boven[- ]safe\b/gi,
  /\b(?:no|without|needs no|zero)\s+heat\b/gi,
  /\b(?:the|a|an|this|that|its|one|both|each)\s+(?:whole\s+)?(?:sirloin(?:\s+tip)?\s+)?roasts?\b/gi,
  /\broast\s+(?:beef|bag|out\b)/gi,
];

/** Every pattern here means heat is being applied to food. Ordered roughly by how load-bearing they
 *  are, and each one is a phrase that has actually appeared in this corpus. */
export const HEAT_EVIDENCE = [
  { re: /\b(?:pre)?heat(?:s|ed|ing)?\b/i, why: 'says heat' },
  { re: /\boven\b/i, why: 'names the oven' },
  { re: /\bair[- ]?fry(?:er)?\b/i, why: 'names the air fryer' },
  { re: /\bmicrowave\b/i, why: 'names the microwave' },
  { re: /\b(?:stovetop|stove|hob|burner|panini press|rice cooker)\b/i, why: 'names a heat source' },
  { re: /\bbroil(?:s|ed|er|ing)?\b/i, why: 'says broil' },
  { re: /\bbake(?:s|d)?\b|\bbaking(?!\s)/i, why: 'says bake' },
  { re: /\broast(?:s|ed|ing)?\b/i, why: 'says roast' },
  { re: /\bfry(?:ing)?\b|\bfries\b|\bfried\b/i, why: 'says fry' },
  { re: /\bsear(?:s|ed|ing)?\b/i, why: 'says sear' },
  { re: /\bsaut[eé](?:s|ed|ing)?\b/i, why: 'says saute' },
  { re: /\bsimmer(?:s|ed|ing)?\b/i, why: 'says simmer' },
  { re: /\bboil(?:s|ed|ing)?\b/i, why: 'says boil' },
  { re: /\bpoach(?:es|ed|ing)?\b/i, why: 'says poach' },
  { re: /\bsteam(?:s|ed|ing)?\b/i, why: 'says steam' },
  { re: /\bgrill(?:s|ed|ing)?\b/i, why: 'says grill' },
  { re: /\btoast(?:s|ed|ing)?\b/i, why: 'says toast' },
  { re: /\bscrambl(?:e|es|ed|ing)\b/i, why: 'says scramble' },
  { re: /\bmelt(?:s|ed|ing)?\b/i, why: 'says melt' },
  { re: /\bsizzl(?:e|es|ing)\b/i, why: 'describes a hot pan' },
  { re: /\bhot pan\b|\bhot oil\b|\bhot enough\b/i, why: 'describes heat' },
  { re: /\bcook(?:s|ed|ing)? (?:for|until|another|it|them|the)\b/i, why: 'says cook for/until' },
  { re: /\d\s*(?:&deg;|°|\bdeg\b)\s*[FC]\b/i, why: 'gives a temperature' },
  { re: /\b\d{3}\s*(?:&deg;|°)?F\b/i, why: 'gives a temperature in F' },
  { re: /\b(?:low|medium(?:[- ](?:high|low))?|high)\s+heat\b/i, why: 'gives a heat level' },
];

/* `look` is the WHY panel, and it is prose rather than instruction: it explains what a cut of beef
 * will be good for next week, why a bag freezes flat, what a technique unlocks later. Run the patterns
 * above over it and five honest recipes light up on "not a roast", "a hot pan nearly straight from the
 * freezer", "no ice to boil off", "needs no heat".
 *
 * But an instruction CAN hide there, and one does: yogurtbowl's why-panel said "microwave the fruit
 * alone for 20 seconds first" inside a dish offered on the grounds that it applies no heat. So `look`
 * is scanned for imperatives only, which is what separates "microwave the fruit" from "a hot pan". */
const LOOK_EVIDENCE = [
  {
    re: /\b(microwave|bake|broil|fry|boil|simmer|steam|toast|grill|heat|roast|sear|saut[eé])\s+(?:the|it|them|for|at|in|on)\b/i,
    why: 'the why-panel gives a heat instruction',
  },
  { re: /\bin(?:to)? (?:the|a|an) (?:oven|air fryer|microwave|hot oven)\b/i, why: 'the why-panel sends food into a heat source' },
];

/** Everything a cook reads on a step that is an INSTRUCTION, joined. Mirrors what render.mjs prints,
 *  because the claim being checked is about the text he sees and not about the shape of the JSON.
 *  `look` is deliberately not here; it gets LOOK_EVIDENCE instead. */
function stepBlob(s) {
  return [
    s.text,
    s.doneness?.test,
    s.warn,
    s.timerLabel,
    s.heat?.target,
    s.heat?.level,
    s.heat?.recheck,
  ].filter(Boolean).join(' · ');
}

const scrub = (t) => NOT_HEAT.reduce((acc, re) => acc.replace(re, ' '), t);

/**
 * Every reason to believe this recipe applies heat. Empty array means no evidence anywhere, which is
 * the only state in which `provenance.heatFree` may be claimed.
 *
 * @returns {{where: string, kind: 'field'|'equipment'|'text', why: string, match?: string}[]}
 */
export function heatEvidence(r) {
  const found = [];
  const steps = r.steps ?? [];

  steps.forEach((s, i) => {
    const where = `step ${i + 1}`;
    // The structured field, when someone did populate it. Still the strongest signal there is.
    if (s.heat) found.push({ where, kind: 'field', why: 'the step carries a `heat` object' });

    for (const e of s.equipment ?? []) {
      if (HEAT_EQUIPMENT.has(e)) found.push({ where, kind: 'equipment', why: `uses heat equipment "${e}"` });
    }

    const blob = scrub(stepBlob(s));
    for (const p of HEAT_EVIDENCE) {
      const m = p.re.exec(blob);
      if (m) found.push({ where, kind: 'text', why: p.why, match: m[0].trim() });
    }

    const look = scrub(s.look ?? '');
    for (const p of LOOK_EVIDENCE) {
      const m = p.re.exec(look);
      if (m) found.push({ where: `${where} (why)`, kind: 'text', why: p.why, match: m[0].trim() });
    }
  });

  for (const e of r.equipment ?? []) {
    if (HEAT_EQUIPMENT.has(e)) {
      found.push({ where: 'recipe.equipment', kind: 'equipment', why: `declares heat equipment "${e}"` });
    }
  }

  return found;
}

/** The one question `isOfferable()` needs answered, and the one `validate.mjs` cross-checks a claim of
 *  `provenance.heatFree` against. */
export const appliesNoHeat = (r) => heatEvidence(r).length === 0;

/** Mirrors NO_HEAT_FORMS in src/lib/kitchen/recipes.ts. Same deliberate duplication as render.mjs
 *  mirroring CookClient: the alternative is importing TypeScript into a zero-dependency node script.
 *  Change one, change the other. */
/*  'method' joined this set 2026-08-22. The argument that put 'assembly' and 'macro' here is
 *  about heat and not about the kind of dish: something that never heats anything cannot carry an
 *  invented heat, timing or doneness instruction, which is the entire defect class SOURCING.md
 *  exists for. Grating cheese and bagging it for the freezer clears that bar exactly as a smoothie
 *  does. Caramelising onions does NOT, which is why that one is sourced from a published recipe.
 *  The claim is still checked against the rendered text by checkHeatClaim(), so this widens who may
 *  ASK for the exemption and not who is believed. */
export const NO_HEAT_FORMS = new Set(['assembly', 'macro', 'method']);

/* ---- CLI: audit the corpus ---- */

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntry) {
  const dir = join(HERE, 'recipes');
  const only = process.argv.find((a) => !a.includes('node') && !a.endsWith('.mjs') && !a.startsWith('-'));
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).filter((f) => !only || f === `${only}.json`);
  let clean = 0;
  for (const f of files.sort()) {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const id = r.id || basename(f, '.json');
    const ev = heatEvidence(r);
    const claim = r.provenance?.heatFree === true ? 'heatFree:true' : '-';
    if (!ev.length) {
      clean++;
      console.log(`NO HEAT   ${id.padEnd(16)} form=${String(r.form).padEnd(10)} ${claim}`);
    } else {
      console.log(`heat      ${id.padEnd(16)} form=${String(r.form).padEnd(10)} ${claim}  ${ev.length} signals`);
      if (process.argv.includes('-v')) {
        for (const e of ev) console.log(`            ${e.where}: ${e.why}${e.match ? ` ("${e.match}")` : ''}`);
      }
    }
  }
  console.log(`\n${files.length} recipes, ${clean} with no heat evidence anywhere.`);
}
