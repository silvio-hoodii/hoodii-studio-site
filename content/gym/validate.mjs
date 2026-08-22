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
const equipment = readJson('equipment.json');
const conditioning = readJson('conditioning.json');
const swimStandards = readJson('swim-standards.json');
const swimTeaching = readJson('swim-teaching.json');

let FAIL = 0;
const out = [];
function fail(where, msg) { FAIL++; out.push(`FAIL  [${where}] ${msg}`); }

const REQUIRED_EX_FIELDS = ['id', 'name', 'sets', 'reps', 'rest', 'cue', 'zone', 'station'];

/* IF IT IS IN THE LOG, THE THING THAT CHANGES MUST BE RECORDED. Added 2026-08-22.
 *
 * Silvio, reading his own programme: "I still don't understand why band pull apart is an exercise
 * inside the program. How is that actually something that I can progressively overload? Okay so
 * I'm gonna do 15 this week. Is it a big deal that I do 16 next week? Is this how programs are
 * designed actually?" and "Why would I track D reps on band external rotation or band pull apart".
 *
 * He is right, and the programme admitted it in its own notes ("no study behind it", "Neither is
 * sourced") while still asking him to type three sets of it. The defect is not the exercise, it is
 * that it was LOGGED. These are the only three things this app records:
 *
 *   weight  a number in the weight box moves.
 *   reps    bodyweight, and the rep count moves.
 *   time    a timed hold, and the seconds move.
 *
 * A band is none of them. What separates an easy band set from a hard one is the band, and there
 * is nowhere to record which band, so 3x15 on a light one and 3x15 on a heavy one are the same row
 * forever. Anything in that position belongs in warmups.json, where nothing pretends to progress.
 *
 * Declared rather than sniffed, because a band is `bodyweight: true` and would sail through any
 * rule that inferred "bodyweight means reps progress". An author adding one now has to write down
 * which number moves, and for a band there is no true answer to write. */
const PROGRESSION = new Set(['weight', 'reps', 'time']);
const REQUIRED_ALT_FIELDS = ['id', 'name', 'cue', 'zone', 'station'];
const ROLES = new Set(['primer', 'main', 'accessory']);
// 'fill' added 2026-08-21: the partner is done inside the lift's rest gaps. It is bound by the SAME
// physical rule as 'alternate' below, and more strictly if anything, because you are standing at the
// lift's own fixture while you do it.
const PAIRINGS = new Set(['alternate', 'sequence', 'fill']);
// Pairings whose two halves are in the gym AT THE SAME TIME, and so must fit in one place.
const CONCURRENT = new Set(['alternate', 'fill']);

/* THE HEADER MAY NOT PROMISE WHAT THE BLOCK DOES NOT CONTAIN. Added 2026-08-22.
 *
 * Silvio, reading Tuesday on his phone: "also this have no superset ... happens accros the session,
 * so whats the point". Four block headers were describing a second exercise that had been deleted
 * the day before. "Triceps + Rotator Cuff (cable, band in hand)" held one cable pushdown; "Swim
 * Catch + Rotator Cuff (cable, band in hand)" held one straight-arm pulldown; two "Second Pattern"
 * blocks still said "band in hand" with no band anywhere in them. The band work had been moved to
 * warmups.json in e0b029c because a band cannot be progressively loaded, and the labels were left
 * behind. Three more headers were the exercise's own name printed a second time.
 *
 * `label` and `tag` are the only free text on a block that makes a factual claim about its
 * contents, and nothing checked them, so the header could say anything. Now:
 *
 *   - a one-exercise block may not use a conjunction that promises a second one
 *   - a one-exercise block's label may not just repeat that exercise's name
 *   - every EQUIPMENT noun in a tag must be verifiable against the block's exercises
 *   - a word in a tag that is neither known equipment nor known prose FAILS, rather than passing
 *     unchecked, because an unrecognised noun is exactly how "band in hand" got in
 *
 * The prose list is deliberately short. A tag is a three-word chip under a heading on a phone; if
 * it wants a sentence it is a `why`, and a `why` is already required and already read. */
const PAIR_PROMISE = [' + ', ' & ', ' then ', ', then '];
/** Equipment a tag may name, each with the test that proves the block actually uses it. */
const TAG_EQUIPMENT = {
  band: (ex) => /band/i.test(ex.id) || /band/i.test(ex.name),
  cable: (ex) => ex.zone === 'cable' || (ex.station || '').startsWith('cable'),
  machine: (ex) => ex.zone === 'machines',
  rack: (ex) => ex.zone === 'rack' || ex.station === 'rack',
  bench: (ex) => ex.station === 'bench',
  preacher: (ex) => ex.station === 'preacher',
  box: (ex) => ex.station === 'box',
};
/** Words a tag may use that claim nothing about equipment. */
const TAG_PROSE = new Set([
  'a', 'and', 'first', 'fresh', 'never', 'tired', 'same', 'technique', 'only', 'its', 'own',
  'dumbbell', 'dumbbells', 'on', 'the', 'floor', 'right', 'there', 'sideways', 'then', 'seat',
  'walk', 'in', 'hand', 'at', 'to', 'no', 'kit', 'up', 'of', 'per', 'side', 'light', 'heavy',
]);

// ---------------------------------------------------------------------------------------------
// The equipment map, flattened once. `station: null` is legal and means "occupies no fixture".
// Anything else must name a station that equipment.json actually lists, so a typo cannot invent a
// machine that is not in the building.
// ---------------------------------------------------------------------------------------------
const ZONES = equipment.zones;
const STATION_ZONE = new Map();
for (const [zoneKey, zone] of Object.entries(ZONES)) {
  for (const stationKey of Object.keys(zone.stations || {})) {
    if (STATION_ZONE.has(stationKey)) {
      fail('equipment.json', `station "${stationKey}" is declared in two zones`);
    }
    STATION_ZONE.set(stationKey, zoneKey);
  }
}

/** Every place `station` and `zone` are checked, for exercises and alts alike. An alt gets the same
 *  treatment as the exercise it replaces, because a swap that moves the partner to another machine
 *  recreates the exact defect this file exists to prevent. */
function checkPlacement(where, item, kind) {
  if (item.zone !== undefined && !ZONES[item.zone]) {
    fail(where, `${kind} "${item.id}" has zone "${item.zone}", which is not in equipment.json`);
    return;
  }
  if (item.station === null || item.station === undefined) return;
  const zoneOfStation = STATION_ZONE.get(item.station);
  if (!zoneOfStation) {
    fail(where, `${kind} "${item.id}" names station "${item.station}", which is not in equipment.json`);
    return;
  }
  if (zoneOfStation !== item.zone) {
    fail(where, `${kind} "${item.id}" is in zone "${item.zone}" but station "${item.station}" lives in zone "${zoneOfStation}"`);
  }
}

/* THE SAME EXERCISE MAY NOT APPEAR TWICE ON ONE DAY'S PAGE. Added 2026-08-22.
 *
 * Silvio: "It's literally in two places on the same session, and it's not just that workout I want."
 *
 * He caught it on band pull-apart, which I had put in the warmup and then, an hour later, back into
 * the workout as well. But the class was already there and had nothing to do with that mistake:
 * Single-Leg Glute Bridge sat in the lower warmup AND in the squat block on both lower days, and
 * Band Straight-Arm Pulldown sat in the upper warmup while the loaded Straight-Arm Pulldown was the
 * Friday swim-catch lift. Three duplications, live, none of them noticed by anybody.
 *
 * A warmup entry and a session entry answer different questions ("get ready" vs "do the work"), and
 * seeing one name in both places on a phone reads as the programme having lost track of itself,
 * which is precisely the thing that makes him stop believing it. The rule: if it is loaded in the
 * session, the warmup does not also need it; if the warmup needs it, it is not session work.
 *
 * Matching is deliberately exact after normalising, rather than fuzzy. A warmup name carries its
 * dose ("Single-Leg Glute Bridge x10/side (LEFT first)") and sometimes an implement prefix ("Band
 * Straight-Arm Pulldown"), both of which are stripped; anything past that has to match on the whole
 * name, so "Copenhagen Plank" and "Plank w/ Shoulder Taps" stay distinct. */
function exerciseKey(name) {
  return String(name || '')
    .replace(/\s*[x×]\s*\d.*$/i, '')      // the dose: "x10/side", "x 30s"
    .replace(/\([^)]*\)/g, '')             // parentheticals: "(LEFT first)", "(short lever)"
    .replace(/^\s*(band|db|bb|ez bar|kettlebell)\s+/i, '')  // implement prefix
    .toLowerCase().replace(/[^a-z]/g, '');
}

for (const [dayKey, day] of Object.entries(program.days)) {
  const prep = [
    ...(warmups[day.warmup] || []).map((w) => ({ where: 'the warmup', name: w.name })),
    ...(day.cooldown || []).map((c) => cooldowns[c]).filter(Boolean).map((c) => ({ where: 'the cooldown', name: c.name })),
  ];
  for (const b of day.blocks || []) {
    for (const ex of b.exercises || []) {
      const k = exerciseKey(ex.name);
      if (!k) continue;
      const clash = prep.find((w) => exerciseKey(w.name) === k);
      if (clash) {
        fail(`${dayKey}/${b.label}`, `"${ex.name}" is in the session and "${clash.name}" is in ${clash.where}, on the same day. Pick one. If it is loaded and logged here, the warmup does not also need it; if the warmup needs it, it is not session work.`);
      }
    }
  }
}

for (const [dayKey, day] of Object.entries(program.days)) {
  if (!day.name || !day.title) fail(dayKey, 'missing name/title');
  if (!warmups[day.warmup]) fail(dayKey, `warmup "${day.warmup}" not found in warmups.json`);
  for (const cdKey of day.cooldown || []) {
    if (!cooldowns[cdKey]) fail(dayKey, `cooldown key "${cdKey}" not found in cooldowns.json`);
  }

  if (!Array.isArray(day.blocks) || !day.blocks.length) { fail(dayKey, 'no blocks'); continue; }

  const idsInDay = new Set();
  for (const block of day.blocks) {
    const where = `${dayKey}/${block.label || block.role}`;

    if (!ROLES.has(block.role)) fail(where, `role must be one of ${[...ROLES].join('|')}, got "${block.role}"`);
    if (!PAIRINGS.has(block.pairing)) fail(where, `pairing must be one of ${[...PAIRINGS].join('|')}, got "${block.pairing}"`);

    // Every block says WHY it is in the programme. He stopped believing the programme because he had
    // never seen the evidence behind it, and a block added later with no reason attached is how that
    // comes back. 40 chars is not a quality bar, it just refuses "because" and an empty string.
    if (typeof block.why !== 'string' || block.why.trim().length < 40) {
      fail(where, `block needs a "why" of at least 40 characters, got ${JSON.stringify(block.why ?? null)}`);
    }

    if (!Array.isArray(block.exercises) || !block.exercises.length) {
      fail(where, 'empty exercises[]');
      continue;
    }
    // `alternate` means the two share one rest window, which only makes sense for exactly two.
    if (CONCURRENT.has(block.pairing) && block.exercises.length !== 2) {
      fail(where, `${block.pairing} block has ${block.exercises.length} exercises, expected exactly 2`);
    }

    // ------ THE HEADER MAY NOT PROMISE WHAT THE BLOCK DOES NOT CONTAIN. See PAIR_PROMISE above.
    const label = String(block.label || '');
    if (block.exercises.length === 1) {
      const promise = PAIR_PROMISE.find((c) => label.toLowerCase().includes(c));
      if (promise) {
        fail(where, `one-exercise block, but its label "${label}" contains "${promise.trim()}", which reads as a pair. Either add the second exercise or say what is actually there.`);
      }
      if (label.trim().toLowerCase() === String(block.exercises[0].name || '').trim().toLowerCase()) {
        fail(where, `label "${label}" is the name of its only exercise, printed a second time. A block label says why the slot exists ("Second Vertical Pull"); the exercise says what fills it.`);
      }
    }
    for (const raw of String(block.tag || '').toLowerCase().match(/[a-z]+/g) || []) {
      const test = TAG_EQUIPMENT[raw];
      if (test) {
        if (!block.exercises.some(test)) {
          fail(where, `tag "${block.tag}" names "${raw}" but no exercise in this block uses one (${block.exercises.map((e) => e.name).join(', ')}). A header that names kit he has to bring is a header he acts on.`);
        }
        continue;
      }
      if (!TAG_PROSE.has(raw)) {
        fail(where, `tag "${block.tag}" contains "${raw}", which the validator does not know. Teach it: add "${raw}" to TAG_EQUIPMENT with the test that proves the block uses one, or to TAG_PROSE if it claims nothing. Unrecognised nouns are how "band in hand" survived a day with no band in the block.`);
      }
    }

    for (const ex of block.exercises) {
      /* See PROGRESSION above. `log !== false` because logging is the default. */
      if (ex.log !== false && !PROGRESSION.has(ex.progression)) {
        fail(
          where,
          `"${ex.id}" is logged but its progression is ${JSON.stringify(ex.progression ?? null)}. ` +
            `It must be one of weight | reps | time: the number he types has to be able to mean ` +
            `something next week. If nothing about it progresses (a band, whose resistance this app ` +
            `cannot record), it belongs in warmups.json rather than in the log.`,
        );
      }
      for (const f of REQUIRED_EX_FIELDS) {
        if (ex[f] === undefined || ex[f] === '') fail(where, `exercise missing "${f}": ${JSON.stringify(ex).slice(0, 60)}`);
      }
      if (ex.id) {
        if (idsInDay.has(ex.id)) fail(where, `duplicate exercise id "${ex.id}" within ${dayKey}`);
        idsInDay.add(ex.id);
      }
      checkPlacement(where, ex, 'exercise');

      // A timed exercise MUST say whether it carries load, because two different parts of the app
      // ask that question and they read different fields. progression.ts keys off `timed` and gets
      // it right; GymClient keys off `bodyweight` and, finding nothing, enables the weight box and
      // labels it "lb". So a plank asked Silvio for a weight on 2026-08-15.
      //
      // This check already existed here, as an empty if-block with a comment reading "not a hard
      // failure but worth a look". It identified the defect exactly and did nothing about it for as
      // long as it has been here, which is what ENGINEERING.md means by a rule that does not execute.
      // Guessing the answer is not available either: farmer-carry is timed AND loaded, so the author
      // has to say. Making it unrepresentable is the fix; being vigilant about it is not.
      if (ex.timed && typeof ex.bodyweight !== 'boolean') {
        fail(where, `timed exercise "${ex.id}" must declare bodyweight: true or false. Without it the weight box is enabled and asks for lb.`);
      }

      for (const alt of ex.alts || []) {
        /* An alt IS the logged exercise the moment he swaps to it, so it answers the same question.
           Falls back to the parent's axis, because most alts are a different way to do the same
           movement and repeating `progression` on all 47 of them would be a copy that drifts. */
        const altProg = alt.progression ?? ex.progression;
        if ((alt.log ?? ex.log) !== false && !PROGRESSION.has(altProg)) {
          fail(where, `alt "${alt.id}" of "${ex.id}" is logged but its progression is ${JSON.stringify(altProg ?? null)}. Same rule as the parent: weight | reps | time, or it is warmup content.`);
        }
        for (const f of REQUIRED_ALT_FIELDS) {
          if (alt[f] === undefined || alt[f] === '') fail(where, `alt of "${ex.id}" missing "${f}": ${JSON.stringify(alt).slice(0, 60)}`);
        }
        checkPlacement(where, alt, `alt of "${ex.id}",`);
        if (alt.timed && typeof alt.bodyweight !== 'boolean') {
          fail(where, `timed alt "${alt.id}" of "${ex.id}" must declare bodyweight: true or false`);
        }
        // No alt should point back at its own exercise's id: a real bug that once slipped through
        // the hand-authored gym.html would silently make "swap" a no-op.
        if (alt.id === ex.id) fail(where, `"${ex.id}" lists itself as its own alt`);
      }
    }

    // -----------------------------------------------------------------------------------------
    // THE PAIRING RULE. A superset may occupy AT MOST ONE STATION, and if either half needs the
    // floor, the zone has to have floor.
    //
    // This is the check that did not exist. Every superset in the old program.json paired a
    // station lift with a floor or band exercise somewhere else in the gym, five times, and
    // Silvio found all five by standing there with a phone: "Realistically there's no way I can do
    // a lat pulldown and a dead bug. I'm not going to lay on the floor at that cable machine."
    // "Where am I supposed to put the band off standing calf raise? That's a machine, so you're
    // saying on the fore exercise I should use two machines."
    //
    // The rule itself is not new. It was written into HealthOS/HANDOFF.md on 2026-05-23, in prose,
    // and then broken five times, because prose does not execute. This does.
    //
    // `sequence` blocks are exempt by definition: you finish the first exercise and walk away
    // before starting the second, so occupying two stations in turn is fine.
    // -----------------------------------------------------------------------------------------
    if (CONCURRENT.has(block.pairing) && block.exercises.length === 2) {
      const [a, b] = block.exercises;

      // DISTINCT stations, because two exercises that use the same bench occupy one bench. Counting
      // raw entries instead flagged single-leg RDL alternating with a Copenhagen plank on the same
      // bench, which is the one arrangement that is obviously fine.
      const stations = [...new Set([a.station, b.station].filter((s) => s != null))];
      if (stations.length > 1) {
        fail(where, `${block.pairing} block occupies ${stations.length} stations (${stations.join(' + ')}). Two exercises done in one window may occupy at most one: the partner must need no fixture (floor, handheld band, bodyweight, dumbbells).`);
      }

      if (a.zone !== b.zone) {
        fail(where, `${block.pairing} block spans two zones ("${a.zone}" and "${b.zone}"). Doing both in one window means walking back and forth between them every set.`);
      }

      for (const ex of [a, b]) {
        if (!ex.needsFloor) continue;
        const zone = ZONES[ex.zone];
        if (zone && zone.floor !== true) {
          fail(where, `"${ex.id}" needs the floor but zone "${ex.zone}" has floor: ${JSON.stringify(zone.floor)}. ${zone.floorNote || ''}`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// THE REST RULE, ENFORCED ON THE PLAN. Added 2026-08-21, the day he chose "never more than 3 in a
// row" over a fixed day off.
//
// This is the mechanism half of that decision. The other half is on the page, which counts what he
// ACTUALLY did; this counts what the programme ASKS of him, and refuses to build when the plan
// contradicts its own rule. Without it, "max 3 consecutive" is a sentence in a JSON comment, and
// every prose rule in this workspace has been violated while every mechanical gate has held.
//
// The lifting days are read out of program.json rather than restated in conditioning.json. A
// second copy of the split would drift the first time a day moved, which is the same failure the
// body-metrics rule exists to prevent: every copy is a fact that goes stale silently.
// ---------------------------------------------------------------------------------------------
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

if (!conditioning.week?.restRule) {
  fail('conditioning.json', 'week.restRule is missing. It is load-bearing: /gym/conditioning reads maxConsecutive to judge the real week, and this gate cannot check a plan against a rule that is not there.');
} else {
  const { maxConsecutive } = conditioning.week.restRule;
  if (!Number.isInteger(maxConsecutive) || maxConsecutive < 1 || maxConsecutive > 7) {
    fail('conditioning.json', `week.restRule.maxConsecutive must be an integer from 1 to 7, got ${JSON.stringify(maxConsecutive)}`);
  }
  const assigned = conditioning.week.assignedDays ?? {};
  const training = new Set(Object.keys(program.days));   // the lifting split, from its own file
  for (const [slot, days] of Object.entries(assigned)) {
    if (slot.startsWith('$') || slot === 'why') continue;
    if (!Array.isArray(days)) {
      fail('conditioning.json', `week.assignedDays.${slot} must be an array of weekday names`);
      continue;
    }
    for (const d of days) {
      if (!WEEKDAYS.includes(d)) fail('conditioning.json', `week.assignedDays.${slot} names "${d}", which is not a weekday`);
      training.add(d);
    }
  }
  /* Scanned over TWO weeks back to back, because a week wraps. A Friday-to-Monday block reads as
     two separate runs of two under a single Monday-to-Sunday pass, and would sail through a rule
     it actually breaks. Capped at 7 so "trains every day" reports 7 rather than 14. */
  let run = 0;
  let worst = 0;
  let worstEnd = null;
  for (const d of [...WEEKDAYS, ...WEEKDAYS]) {
    if (training.has(d)) {
      run++;
      if (run > worst) { worst = run; worstEnd = d; }
    } else run = 0;
  }
  worst = Math.min(worst, 7);
  if (Number.isInteger(maxConsecutive) && worst > maxConsecutive) {
    fail(
      'conditioning.json',
      `the PLANNED week trains ${worst} days in a row (ending ${worstEnd}), but week.restRule.maxConsecutive is ${maxConsecutive}. ` +
        `Training days in the plan: ${WEEKDAYS.filter((d) => training.has(d)).join(', ')}. ` +
        `Move a conditioning slot onto a day that is already a training day, or change the rule on purpose.`,
    );
  } else {
    out.push(`ok    [conditioning.json] planned week trains ${training.size} days, longest run ${worst}, rule allows ${maxConsecutive}`);
  }
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
    if (!s.url || !/^https?:\/\//.test(s.url)) fail('swim-standards.json', `source "${s.id}" has no usable url`);
  }
  const tiers = swimStandards.tiers || [];
  if (!tiers.length) fail('swim-standards.json', 'no tiers');
  const ids = new Set(tiers.map((t) => t.id));
  for (const t of tiers) {
    const where = `swim-standards.json/${t.id || "?"}`;
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
        fail('swim-standards.json', `at ${d} m, tier "${t.name}" (${v.toFixed(2)}s) is not slower than "${prevName}" (${prev.toFixed(2)}s). Tiers are listed hardest first and must get slower going down, or a swimmer lands in the wrong band.`);
      }
      prev = v;
      prevName = t.name;
    }
  }
  out.push(`ok    [swim-standards.json] ${tiers.length} tiers over ${dists.length} distances, provenance on all of them`);
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
  if (!stages.length) fail('swim-teaching.json', 'no stages');
  if (!swimTeaching.beforeYouStart?.body?.length) {
    fail('swim-teaching.json', 'beforeYouStart is missing. That block is the safety line and it is the first thing on the page: he is being handed a script to read to a stranger in deep water.');
  }
  const srcIds = new Set((swimTeaching.sources || []).map((x) => x.id));
  const stageIds = new Set(stages.map((x) => x.id));
  for (const st of stages) {
    const where = `swim-teaching.json/${st.id || "?"}`;
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
      fail('swim-teaching.json', `whatToLookFor points at stage "${i.stage}", which does not exist`);
    }
  }
  const nCues = stages.reduce((a, x) => a + (x.cues?.length || 0), 0);
  out.push(`ok    [swim-teaching.json] ${stages.length} stages, ${nCues} cues, all with a test and a stated confidence`);
}

console.log(out.join('\n'));
console.log('-'.repeat(70));
console.log(`${Object.keys(program.days).length} days checked, the planned week checked against its rest rule, ${FAIL} failures`);
process.exit(FAIL ? 1 : 0);
