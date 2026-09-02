#!/usr/bin/env node
/**
 * Swim content validator. Same discipline as content/gym/validate.mjs and
 * content/kitchen/validate.mjs: the rules that matter are enforced mechanically, not left as prose
 * someone has to remember to re-check.
 *
 * THESE CHECKS ARE NOT NEW. They lived inside content/gym/validate.mjs until 2026-08-26, when swim
 * left /gym and its content moved to content/swim/. Moving the files without moving the checks
 * would have silently dropped every one of them: the tier-ordering rule that caught the 5 km parse
 * bug, the "no sourced cue without a verbatim quote" rule he asked for in his own words, and the
 * refusal to ship a teaching handbook with no safety block. A validator that stops running is
 * indistinguishable from a validator that passes.
 *
 * Wired into `build` in package.json, beside the gym and reading validators.
 *
 * Run: node content/swim/validate.mjs
 * Zero dependencies on purpose.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(readFileSync(join(HERE, f), 'utf8'));

const plan = readJson('plan.json');
const swimStandards = readJson('standards.json');
const swimTeaching = readJson('teaching.json');
const swimCoaching = readJson('coaching.json');

let FAIL = 0;
const out = [];
function fail(where, msg) { FAIL++; out.push(`FAIL  [${where}] ${msg}`); }

// ---------------------------------------------------------------------------------------------
// THE PLAN. The one block here that is new, and it is deliberately thin.
//
// plan.json was the `swim` member of conditioning.json until 2026-08-26 and nothing validated it
// then either. It gets a structural check now for one reason: /swim reads
// `structure.calibration.test` and walks `structure.ladder`, and a missing key renders as the word
// undefined on a page he reads standing at the side of a pool. This asserts the blocks the renderer
// indexes into exist. It does NOT invent rules about their contents, which would be a different
// decision than the one this migration was authorised to make.
// ---------------------------------------------------------------------------------------------
{
  for (const k of ['title', 'sessionsPerWeek', 'baseline', 'theGoal', 'theOneTechniqueChange', 'onDrills', 'structure', 'paddleRule', 'pullBuoyRule']) {
    if (plan[k] == null) fail('plan.json', `missing "${k}", which /swim renders directly`);
  }
  if (!Array.isArray(plan.baseline) || !plan.baseline.length) {
    fail('plan.json', 'baseline must be a non-empty array of {label, value}. It is an ARRAY rather than named fields on purpose: the page read three fields by name until 2026-08-21, so the data had to fit the slots, and two false claims survived in them for weeks.');
  }
  for (const f of plan.baseline || []) {
    if (!f.label || !f.value) fail('plan.json', `a baseline fact needs both a label and a value, got ${JSON.stringify(f)}`);
  }
  for (const k of ['name', 'what', 'test', 'why']) {
    if (!plan.structure?.calibration?.[k]) {
      fail('plan.json', `structure.calibration.${k} is missing. The calibration swim is the gate on the whole ladder: every rung below it is written relative to the number it returns.`);
    }
  }
  if (!plan.structure?.ladder?.length) fail('plan.json', 'structure.ladder is empty, so the plan prescribes nothing');
  for (const s of plan.structure?.ladder || []) {
    if (!s.weeks || !s.piece || !s.rest) fail('plan.json', `a ladder rung needs weeks, piece and rest, got ${JSON.stringify(s)}`);
  }
  /* THE SEVEN CUES ON THE HOW TAB WERE GATED BY NOTHING UNTIL 2026-09-02, and they are the ones he
   * follows in the water. `checkGroundedCues` at the bottom of this file is called on coaching.json
   * and teaching.json only. plan.json's cues carry no `quote` field at all, use a DIFFERENT
   * confidence vocabulary (evidence / contested / convention against sourced / inference /
   * convention), and put their citation in a prose `grounding` field with a `url` beside it. So the
   * most load-bearing prose on this surface was also the least checked, while the handoff describing
   * this surface said every cue must carry a verbatim quote from a named source.
   *
   * This does NOT retrofit the coaching vocabulary onto them, which would relabel seven cues to
   * satisfy a checker rather than to say anything truer. It gates the shape they actually use, which
   * is what "gated" was supposed to mean. A quote is not proof of correct quotation and nothing here
   * can check that; what this stops is a cue with no test, no stated confidence, or an evidence
   * claim with no link to open. */
  const PLAN_CONF = new Set(['evidence', 'contested', 'convention']);
  for (const c of plan.cues || []) {
    const where = `plan.json/${c.name || '?'}`;
    if (!PLAN_CONF.has(c.confidence)) {
      fail(where, `confidence must be ${[...PLAN_CONF].join(' | ')}, got ${JSON.stringify(c.confidence ?? null)}. An unlabelled cue is an agent's opinion wearing a coach's voice, and .conf styling exists for exactly these three.`);
    }
    if (!c.cue || String(c.cue).trim().length < 20) fail(where, 'no cue, or one too short to follow');
    if (!c.test || String(c.test).trim().length < 20) {
      fail(where, 'no test. Every cue must come with something he can actually check, not a sensation he is supposed to have.');
    }
    if (!c.grounding || String(c.grounding).trim().length < 20) {
      fail(where, 'no grounding. Say where this came from, or say CONVENTION in as many words. The renderer prints this behind the tap that says whether a study exists.');
    }
    if ((c.confidence === 'evidence' || c.confidence === 'contested') && !/^https?:\/\//.test(String(c.url || ''))) {
      fail(where, `confidence is "${c.confidence}" but there is no url to open. An evidence claim he cannot check is a convention claim wearing a better badge.`);
    }
  }

  /* AN OPEN QUESTION'S SHAPE, gated here since 2026-09-02 because it was not. content/gym's
   * validator has gated this for weeks; swim's did not, and plan.json's one `open` row carried no
   * `topic`, which scripts/gym-notes.mjs prints. Worse, that script read only the two gym files, so
   * a question parked on 2026-08-28 with a due date of 2026-09-11 was invisible to every mechanism
   * this repo owns and to all five tabs of the page. `topic` is required because reading nineteen of
   * these in one block he said "most of the questions are either badly phrased or badly explained",
   * and part of that was that they all looked alike. */
  const OPEN_TOPICS = new Set(['cue', 'placement', 'prescription', 'equipment', 'volume', 'unit', 'time']);
  for (const q of plan.open || []) {
    const where = 'plan.json/open';
    if (!q.q || String(q.q).trim().length < 40) fail(where, 'an open question needs a question of at least 40 characters, with the options and the cost of each');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(q.asked || ''))) fail(where, `asked must be a YYYY-MM-DD date, got ${JSON.stringify(q.asked ?? null)}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(q.due || ''))) fail(where, `due must be a YYYY-MM-DD date, got ${JSON.stringify(q.due ?? null)}. gym-notes.mjs exits non-zero past it, which is the only thing that makes a parked question bite.`);
    if (!OPEN_TOPICS.has(q.topic)) fail(where, `topic must be one of ${[...OPEN_TOPICS].join(' | ')}, got ${JSON.stringify(q.topic ?? null)}. gym-notes.mjs prints it, because the topic changes what an answer IS.`);
  }

  if (!FAIL) out.push(`ok    [plan.json] ${plan.structure.ladder.length} ladder rungs, ${plan.baseline.length} baseline facts, calibration block present, ${(plan.cues || []).length} cues gated, ${(plan.open || []).length} open question(s) with a shape`);
}

// ---------------------------------------------------------------------------------------------
// SWIM STANDARDS: every tier has to say where its numbers came from. Added 2026-08-22.
//
// He asked for levels knowing the honest answer would be mixed: "you're probably only going to
// find reference for elite and whatever and really high-performing athletes. We'll have to make
// up our own tiers." Three of these tiers are published standards for men 35-39 and two are
// multiples of one of them that an agent chose. The whole value of the sourced rows depends on
// the constructed ones being visibly labelled, so `provenance` is mandatory and a sourced tier
// must name a source that exists.
//
// The alternative, remembering to write it down, is the shape of rule this workspace has broken
// every single time.
// ---------------------------------------------------------------------------------------------
/* 'third-party' sits between sourced and constructed: published by somebody real, but not by the
   governing body. Openlane's masters tables are the case that created it. It must still name a
   source, because the whole point of the value is that a reader can go and look. */
const PROVENANCE = new Set(['sourced', 'sourced-other-course', 'third-party', 'constructed', 'capability']);

{
  const srcIds = new Set((swimStandards.sources || []).map((s) => s.id));
  for (const s of swimStandards.sources || []) {
    if (!s.url || !/^https?:\/\//.test(s.url)) fail('standards.json', `source "${s.id}" has no usable url`);
  }
  const tiers = swimStandards.tiers || [];
  if (!tiers.length) fail('standards.json', 'no tiers');
  const ids = new Set(tiers.map((t) => t.id));
  for (const t of tiers) {
    const where = `standards.json/${t.id || "?"}`;
    if (!t.id || !t.name) fail(where, 'tier needs an id and a name');
    if (!PROVENANCE.has(t.provenance)) {
      fail(where, `provenance must be one of ${[...PROVENANCE].join(" | ")}, got ${JSON.stringify(t.provenance ?? null)}. Every tier has to say whether its numbers were published by somebody or picked by us.`);
    }
    if ((t.provenance === 'sourced' || t.provenance === 'sourced-other-course' || t.provenance === 'third-party')) {
      if (!t.sourceId) fail(where, `provenance is "${t.provenance}" but no sourceId. A sourced tier must name the source it came from.`);
      else if (!srcIds.has(t.sourceId)) fail(where, `sourceId "${t.sourceId}" is not in sources[]`);
      if (!t.times) fail(where, `provenance is "${t.provenance}" but the tier carries no times`);
    }
    if (t.provenance === 'constructed' && !t.derivedFrom && !t.times) {
      fail(where, 'a constructed tier must either carry its own times or say what it is derived from');
    }
    if (t.derivedFrom) {
      if (!ids.has(t.derivedFrom.tier)) fail(where, `derivedFrom names tier "${t.derivedFrom.tier}", which does not exist`);
      if (!(t.derivedFrom.multiplier > 0)) fail(where, `derivedFrom.multiplier must be a positive number`);
    }
    if (!t.what || t.what.length < 20) fail(where, `tier needs a "what" of at least 20 characters explaining who swims this`);
  }

  /* Tiers must get slower as they get easier, at every distance. A table where "National" is
     slower than "Qualifier" would place him in the wrong band and nobody would notice by reading
     it: the numbers are all plausible on their own. */
  /* h:mm:ss, m:ss, or plain seconds. The two-part-only version returned the HOURS field for a 5 km
     time, so every rung at that distance parsed as 1.00 and the ordering check compared 1 to 1.
     The same parser had been written three times in this feature and was wrong in all three. */
  const parse = (str) => {
    const p = String(str).split(':').map(Number);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0];
  };
  const resolve = (tier, dist, seen = new Set()) => {
    if (tier.times && tier.times[dist] != null) return parse(tier.times[dist]);
    if (tier.derivedFrom && !seen.has(tier.id)) {
      seen.add(tier.id);
      const base = tiers.find((x) => x.id === tier.derivedFrom.tier);
      const b = base ? resolve(base, dist, seen) : null;
      return b == null ? null : b * tier.derivedFrom.multiplier;
    }
    return null;
  };
  const dists = [...new Set(tiers.flatMap((t) => Object.keys(t.times || {})))];
  for (const d of dists) {
    let prev = null;
    let prevName = null;
    for (const t of tiers) {
      const v = resolve(t, d);
      if (v == null) continue;
      if (prev != null && v <= prev) {
        fail('standards.json', `at ${d} m, tier "${t.name}" (${v.toFixed(2)}s) is not slower than "${prevName}" (${prev.toFixed(2)}s). Tiers are listed hardest first and must get slower going down, or a swimmer lands in the wrong band.`);
      }
      prev = v;
      prevName = t.name;
    }
  }
  out.push(`ok    [standards.json] ${tiers.length} tiers over ${dists.length} distances, provenance on all of them`);
}

// ---------------------------------------------------------------------------------------------
// SWIM TEACHING: nothing goes in the handbook without a source or an admission. 2026-08-22.
//
// This is the one surface on the site where being wrong could hurt somebody who is not him. He
// is going to read these lines out to a stranger in a swimming pool. The kitchen already proved
// what happens when an agent writes instructions from memory: on 2026-08-09 every one of the
// four failures came from a sentence an agent wrote, and not one came from a figure a source
// gave. In a kitchen that burnt dinner.
//
// So each cue must carry a TEST, and each must declare a confidence. `sourced` must name a URL.
// `convention` may not, and that is exactly what it is for: it is how a line admits that nobody
// studied it.
// ---------------------------------------------------------------------------------------------
const TEACH_CONF = new Set(['sourced', 'convention']);

{
  const stages = swimTeaching.stages || [];
  if (!stages.length) fail('teaching.json', 'no stages');
  if (!swimTeaching.beforeYouStart?.body?.length) {
    fail('teaching.json', 'beforeYouStart is missing. That block is the safety line and it is the first thing on the page: he is being handed a script to read to a stranger in deep water.');
  }
  const srcIds = new Set((swimTeaching.sources || []).map((x) => x.id));
  const stageIds = new Set(stages.map((x) => x.id));
  for (const st of stages) {
    const where = `teaching.json/${st.id || "?"}`;
    if (!st.name || !st.who) fail(where, 'a stage needs a name and a `who` so he can pick it by recognising the person in front of him');
    if (st.sourceId && !srcIds.has(st.sourceId)) fail(where, `sourceId "${st.sourceId}" is not in sources[]`);
    if (!st.cues?.length) fail(where, 'a stage with no cues teaches nothing');
    for (const c of st.cues || []) {
      const w2 = `${where}/${c.name || "?"}`;
      if (!c.cue) fail(w2, 'no cue');
      if (!c.test || c.test.length < 20) {
        fail(w2, 'every teaching point needs a TEST of at least 20 characters. He is on a pool deck looking at somebody: it has to be something he can SEE, not something they have to feel.');
      }
      if (!TEACH_CONF.has(c.confidence)) {
        fail(w2, `confidence must be ${[...TEACH_CONF].join(" | ")}, got ${JSON.stringify(c.confidence ?? null)}`);
      }
      if (c.confidence === 'sourced' && !c.url) {
        fail(w2, 'confidence is "sourced" but there is no url. A sourced claim about what to do in water has to name where it came from, or it is an agent writing swim instruction from memory.');
      }
    }
  }
  for (const i of swimTeaching.whatToLookFor?.items || []) {
    if (!stageIds.has(i.stage)) {
      fail('teaching.json', `whatToLookFor points at stage "${i.stage}", which does not exist`);
    }
  }
  const nCues = stages.reduce((a, x) => a + (x.cues?.length || 0), 0);
  out.push(`ok    [teaching.json] ${stages.length} stages, ${nCues} cues, all with a test and a stated confidence`);
}

/* NO CUE WITHOUT A QUOTE. Added 2026-08-22, at his instruction and in his words:
 *
 *   "Again I don't want hallucination here so try to keep it as literal as you can. Same thing for
 *    coach them: the actual grounding has to happen so I don't want the agents or whatever just
 *    coming back, coming up with their own leg cues or whatever. It has to be grounded something
 *    for both."
 *
 * coaching.json is him coaching HIMSELF in the water; teaching.json is him coaching somebody else
 * from the deck. Both are pure prose, which means both are exactly the kind of file an agent can
 * fill with confident invented technique advice that reads perfectly and is checked by nothing.
 * This is the check.
 *
 *   confidence 'sourced'    must carry a verbatim `quote` and a `source` that resolves to a URL
 *                           in the file's own `sources` list.
 *   confidence 'inference'  must name the `from` source and the `fromQuote` it reasons from, so the
 *                           reasoning is visible and the reader can go and disagree with it.
 *   confidence 'convention' is allowed and means common practice with no trial behind it. It has to
 *                           say so on the page, which the renderer does.
 *
 * A quote is not proof it was quoted correctly. Nothing here can check that, and pretending
 * otherwise would be worse than admitting it: what this stops is the case with no source at all,
 * which is the one that has actually happened. */
function checkGroundedCues(fileLabel, doc, entries) {
  const sourceIds = new Set((doc.sources || []).map((x) => x.id));
  for (const src of doc.sources || []) {
    if (!/^https?:\/\//.test(String(src.url || ''))) {
      fail(fileLabel, `source "${src.id}" has no usable url (${JSON.stringify(src.url ?? null)}). Every source must be a link he can open and check.`);
    }
  }
  for (const c of entries) {
    const where = `${fileLabel}/${c.id || c.name || c.say || '?'}`;
    const hasSource = sourceIds.has(c.source) || /^https?:\/\//.test(String(c.url || ''));
    const conf = c.confidence;
    if (!['sourced', 'inference', 'convention'].includes(conf)) {
      fail(where, `confidence must be sourced | inference | convention, got ${JSON.stringify(conf ?? null)}. An unlabelled cue is an agent's opinion wearing a coach's voice.`);
      continue;
    }
    if (conf === 'sourced') {
      if (!c.quote || String(c.quote).trim().length < 15) {
        fail(where, 'marked "sourced" with no verbatim quote. Paste the sentence from the guide, or mark it convention.');
      }
      /* Either a `source` id into this file's list, or a `url` on the cue itself. The teaching
         file already used the second shape and the first version of this gate did not know about
         it, which made it report nine ungrounded cues that were not ungrounded. They were missing
         the QUOTE, which is the half that matters and the half that is still enforced below. */
      if (!hasSource) {
        fail(where, `marked "sourced" but names neither a source id from this file's list (${[...sourceIds].join(', ')}) nor a url of its own.`);
      }
    }
    if (conf === 'inference') {
      if (!sourceIds.has(c.from)) {
        fail(where, `marked "inference" but ${JSON.stringify(c.from ?? null)} is not one of this file's sources. An inference has to say what it reasons FROM.`);
      }
      if (!c.fromQuote || String(c.fromQuote).trim().length < 15) {
        fail(where, 'marked "inference" with no fromQuote. Paste the sentence the reasoning starts from so he can judge the leap himself.');
      }
    }
    if (!c.test || String(c.test).trim().length < 15) {
      fail(where, 'no test. Every cue must come with something he can actually check, not a sensation he is supposed to have.');
    }
  }
}

checkGroundedCues('coaching.json', swimCoaching, swimCoaching.checks || []);
checkGroundedCues('teaching.json', swimTeaching, (swimTeaching.stages || []).flatMap((st) => st.cues || []));
if ((swimCoaching.checks || []).length) {
  out.push(`ok    [coaching.json] ${swimCoaching.checks.length} self-checks, every one carrying a test, a stated confidence and a source`);
}

console.log(out.join('\n'));
console.log('-'.repeat(70));
console.log(`4 swim content files checked, ${FAIL} failures`);
process.exit(FAIL ? 1 : 0);
