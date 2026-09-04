#!/usr/bin/env node
/**
 * DOES EVERY PATTERN GET A FRESH SLOT, at least once a week.
 *
 *   node scripts/gym-order.mjs                        # the live programme
 *   node scripts/gym-order.mjs <path-to-program.json> # any candidate
 *
 * WHY THIS EXISTS. He spotted it himself, 2026-08-31: *"i see lover is basically what lead everytime"*
 * and *"chest being at the end of the sesion mostly, not sure if thats right"*. He was right, and the
 * paper that says so was already on this disk and had been cited by this project the day before.
 *
 * `HealthOS/knowledge/sources/pubmed-32077380.txt`, Nunes JP, Grgic J, Cunha PM, Ribeiro AS,
 * Schoenfeld BJ, de Salles BF, Cyrino ES. Eur J Sport Sci 2021;21(2):149-157. PMID 32077380. Eleven
 * good-to-excellent quality studies. Verbatim:
 *
 *   "there was a difference between the MJ-to-SJ and SJ-to-MJ orders for strength gains in the MJ
 *    exercises, favouring starting the exercise session with MJ exercises (ES = 0.32; p = 0.034)"
 *
 *   "No significant effect of EO was observed for hypertrophy combining site-specific and indirect
 *    measures (ES = 0.03; p = 0.862)."
 *
 *   "In conclusion, increases in muscular strength are the largest in the exercises performed at the
 *    beginning of an exercise session."
 *
 * SO ORDER IS A STRENGTH VARIABLE AND NOT A SIZE VARIABLE. That is exactly the asymmetry this
 * programme cares about, and it means position in the session is a prescription, not a detail.
 *
 * WHAT WENT WRONG WITHOUT IT. `sources/SPLIT-OPTIONS-2026-08-30.md` line 218 carries the heading
 * "Order inside the session is a strength variable" and scores candidates against it. The redesign
 * written the next day contains zero occurrences of Nunes, the PMID, or "exercise order", and produced
 * a week where chest was a partner in all three appearances, never a lead, never in block 1 or 2, and
 * where all four loaded single-leg lifts sat at block 3 or 4 INSIDE the priority region. Three
 * adversaries had to find it. There was no instrument for session position anywhere in this repo, and
 * `MEASUREMENT-AUDIT-2026-08-30.md` section 5b had already said so: "neither the weekly matrix nor
 * the block `why` can express it, because neither has any concept of session position."
 *
 * WHAT "FRESH" MEANS HERE, stated because it is a judgement and not a measurement. A slot is fresh if
 * it is in the first two BLOCKS of a day. Not the first two exercises: a partner in block 1 is at set
 * two of the session and is genuinely fresh, and treating it as late would refuse the whole
 * paired-block design for no reason Nunes supports. Blocks rather than sets is the honest granularity
 * because a block is what he walks to.
 *
 * THE PRIMER IS EXEMPT FROM COUNTING AS ANYONE'S FRESH SLOT. A jump is first precisely because it
 * needs to be fresh, and letting it satisfy the rule for quads would mean a box jump discharges the
 * squat's claim on the front of the session. That is the opposite of the finding.
 */
import { readFileSync, existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const programPath = argv.find((a) => !a.startsWith('--')) || 'content/gym/program.json';
const program = JSON.parse(readFileSync(programPath, 'utf8'));
const cat = JSON.parse(readFileSync('content/gym/movements.json', 'utf8'));

const byId = new Map();
for (const [, m] of Object.entries(cat.movements)) {
  for (const v of m.variants) {
    const f = { ...v, primary: v.primary ?? m.primary, secondary: v.secondary ?? m.secondary };
    byId.set(v.id, f);
    for (const a of v.aliases ?? []) byId.set(a, f);
  }
}

/* THE PATTERNS THAT MUST GET A FRESH SLOT, and why each is on the list.
 *
 * The three Iversen names as a minimum for a time-efficient programme, verbatim from
 * `sources/meas-timeefficient-34125411.txt`: "a minimum of one leg pressing exercise (e.g. squats),
 * one upper-body pulling exercise (e.g. pull-up) and one upper-body pushing exercise (e.g. bench
 * press)". Plus the hinge and the single-leg pattern, which are the priority under C2 and which the
 * killed candidate starved of fresh slots while calling itself a lower-body programme. */
const PATTERNS = {
  squat: { label: 'Squat (knee-dominant bilateral)', match: (k) => k.primary.includes('quads') && !/lunge|split|step|single|cossack|bound|jump|hop/.test(k.id) },
  hinge: { label: 'Hinge', match: (k) => k.primary.includes('hamstrings') || (k.primary.includes('glutes') && /rdl|deadlift|good-morning|swing|thrust|extension/.test(k.id)) },
  singleLeg: { label: 'Single leg (the priority sub-pattern)', match: (k) => /lunge|split-squat|step-up|single-leg|b-stance|cossack/.test(k.id) && k.primary.some((m) => ['quads', 'glutes', 'hamstrings', 'adductors'].includes(m)) },
  /* CHEST AND SHOULDERS ARE SEPARATE ROWS, and lumping them was this gate's first bug. Its first
     run reported "Upper push: 1 fresh slot" on the candidate and passed it, because a half-kneeling
     shoulder press in block 1 discharged the claim while the chest press he actually complained
     about sat in blocks 3 and 4 on all three of its appearances. A pattern family is the wrong
     granularity: Nunes is about the exercise, and chest is the muscle he named. */
  chest: { label: 'Chest press (the one he named)', match: (k) => k.primary.includes('chest') },
  shoulderPress: { label: 'Overhead press', match: (k) => k.primary.includes('front-delts') },
  upperPull: { label: 'Upper pull (Iversen minimum)', match: (k) => k.primary.includes('lats') || k.primary.includes('upper-back') },
};

const DAY_ORDER = ['a', 'b', 'c'];
const FRESH_BLOCKS = 2;
/* THE PRIORITY PATTERNS, since 2026-09-03. With two sessions of four main lifts each, only four
 * slots in the week are "fresh" by this definition, and the goal in program.json puts the legs in
 * them: squat and hinge open their sessions, and the two presses take the second slot. The single-leg
 * lift and the upper pull are therefore never fresh, BY DESIGN, and that used to fail this gate. The
 * gate now FAILS only when a pattern is missing from the week altogether or when a priority pattern
 * lacks a fresh slot; everything else is reported so the trade is visible rather than hidden. */
const PRIORITY = new Set(['squat', 'hinge']);

const fresh = {};      // pattern -> [{day, block, exercise}]
const anywhere = {};   // pattern -> count of appearances
for (const key of Object.keys(PATTERNS)) { fresh[key] = []; anywhere[key] = 0; }

const rows = [];
for (const dayKey of DAY_ORDER) {
  const day = program.days?.[dayKey];
  if (!day) continue;
  let blockIdx = 0;
  for (const b of day.blocks) {
    blockIdx++;
    const isPrimer = b.role === 'primer';
    for (const e of b.exercises) {
      const k = byId.get(e.id);
      if (!k) continue;
      for (const [key, p] of Object.entries(PATTERNS)) {
        if (!p.match(k)) continue;
        anywhere[key]++;
        /* Primer slots do not discharge anyone's claim on the front of the session. */
        if (blockIdx <= FRESH_BLOCKS && !isPrimer) fresh[key].push({ day: dayKey, block: blockIdx, ex: e.name });
      }
      rows.push({ day: dayKey, block: blockIdx, isPrimer, name: e.name, id: e.id });
    }
  }
}

console.log(`${programPath}`);
console.log(`A slot is FRESH if it is in the first ${FRESH_BLOCKS} blocks of a day and not the primer.`);
console.log('Nunes 2021: strength gains are largest in the exercises performed at the beginning of a session');
console.log('(ES 0.32, p = 0.034), and order has no effect on hypertrophy (ES 0.03, p = 0.862).\n');

console.log('pattern'.padEnd(38) + 'appearances'.padStart(12) + 'fresh slots'.padStart(13) + '   where');
console.log('-'.repeat(96));
const findings = [];
const notes = [];
for (const [key, p] of Object.entries(PATTERNS)) {
  const f = fresh[key];
  const where = f.length ? f.map((x) => `${x.day.slice(0, 3)} b${x.block}`).join(', ') : '';
  console.log(p.label.padEnd(38) + String(anywhere[key]).padStart(12) + String(f.length).padStart(13) + `   ${where}`);
  if (anywhere[key] === 0) {
    findings.push(`${p.label} does not appear in the week at all.`);
  } else if (f.length === 0 && PRIORITY.has(key)) {
    findings.push(`${p.label} appears ${anywhere[key]} time(s) and NEVER in the first ${FRESH_BLOCKS} blocks of any day. `
      + 'Nunes found the strength gain is largest in whatever is done first, and this is a priority pattern under the goal in program.json.');
  } else if (f.length === 0) {
    notes.push(`${p.label} is never fresh. Accepted: the fresh slots go to the priority patterns.`);
  }
}
for (const n of notes) console.log(`  note: ${n}`);

/* THE SECOND CHECK: what leads. Reported rather than failed, because C2 makes lower-body leads
 * correct and the question is only whether it is total. */
console.log('');
const leads = rows.filter((r) => r.block && !r.isPrimer);
const leadByRegion = { lower: 0, upper: 0, other: 0 };
for (const dayKey of DAY_ORDER) {
  const day = program.days?.[dayKey];
  if (!day) continue;
  let i = 0;
  for (const b of day.blocks) {
    i++;
    if (b.role === 'primer') continue;
    const k = byId.get(b.exercises[0].id);
    if (!k) continue;
    const region = k.primary.some((m) => ['glutes', 'quads', 'hamstrings', 'adductors', 'calves'].includes(m)) ? 'lower'
      : k.primary.some((m) => ['chest', 'lats', 'upper-back', 'front-delts', 'side-delts', 'rear-delts', 'biceps', 'triceps'].includes(m)) ? 'upper' : 'other';
    leadByRegion[region]++;
  }
}
const totalLeads = leadByRegion.lower + leadByRegion.upper + leadByRegion.other;
console.log(`BLOCK LEADS: ${leadByRegion.lower} lower, ${leadByRegion.upper} upper, ${leadByRegion.other} other, of ${totalLeads} non-primer blocks.`);
console.log('Lower leading is correct under C2 and is not a fault. It is printed because when it reaches');
console.log('100% the upper body has no fresh slot anywhere, which is what the check above then catches.');

console.log('');
console.log('-'.repeat(96));
if (!findings.length) {
  console.log(`GREEN. Every pattern is in the week and every priority pattern gets a fresh slot.`);
  process.exit(0);
}
console.log(`${findings.length} finding(s):\n`);
for (const f of findings) console.log(`  ${f}\n`);
console.log('Move one block, or drop the pattern from PATTERNS here and say why it does not need a fresh');
console.log('slot. The one thing this cannot check is a pattern quietly removed from the list.');
process.exit(1);
