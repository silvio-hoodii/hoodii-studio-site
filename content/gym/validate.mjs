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

/* The movement catalogue, flattened to one lookup per variant id (and per legacy alias id, because
 * program.json's per-slot `alts` still carry older names for jobs the catalogue already owns).
 * Loaded here so the shared-muscle rule below can run offline like everything else in this file. */
const MOVEMENTS = (() => {
  try {
    const cat = readJson('movements.json');
    const out = {};
    for (const m of Object.values(cat.movements)) {
      for (const v of m.variants) {
        const flat = { ...v, primary: v.primary ?? m.primary, secondary: v.secondary ?? m.secondary };
        out[v.id] = flat;
        for (const a of v.aliases ?? []) out[a] = flat;
      }
    }
    return out;
  } catch {
    return null;   // absent catalogue disables the rule loudly at the call site, never silently
  }
})();

const program = readJson('program.json');
const warmups = readJson('warmups.json');
const cooldowns = readJson('cooldowns.json');
const equipment = readJson('equipment.json');
const conditioning = readJson('conditioning.json');
let FAIL = 0;
const out = [];
function fail(where, msg) { FAIL++; out.push(`FAIL  [${where}] ${msg}`); }

/* NOTHING IN THE CATALOGUE MAY RESTATE WHAT program.json ALREADY SAYS. Added 2026-08-27.
 *
 * movements.json carried an `inProgramme` boolean on all 103 variants and nine of them were already
 * wrong on the day the file shipped: that morning's rebuild edited program.json and never touched
 * the flags, so db-rdl read false while being prescribed and pushup read true after being cut. The
 * only consumer was the `*` marker in gym-catalogue.mjs --options, which is the exact view the
 * handoff pointed the next agent at.
 *
 * This workspace has had the same failure twice at larger scale (body metrics 2026-08-01,
 * immigration status 2026-08-11) and drew the same conclusion both times: EVERY COPY OF A FACT IS A
 * FACT THAT GOES STALE SILENTLY. The flag is deleted and the marker is derived. This check exists
 * because the alternative was a comment in movements.json asking the next author not to add it
 * back, and a comment does not execute.
 *
 * Deliberately a whole class rather than one key: any field here whose value is a restatement of
 * program.json belongs on this list the day someone reaches for it. */
const DERIVED_NOT_STORED = {
  inProgramme: 'whether a variant is prescribed. Derive it from program.json, as gym-catalogue.mjs does.',
};
if (MOVEMENTS) {
  const seen = new Set();
  for (const [id, v] of Object.entries(MOVEMENTS)) {
    for (const [key, why] of Object.entries(DERIVED_NOT_STORED)) {
      if (key in v && !seen.has(`${id}/${key}`)) {
        seen.add(`${id}/${key}`);
        fail('movements.json', `variant "${id}" carries "${key}", which is derived and must not be stored: ${why}`);
      }
    }
  }
}

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
/* `fixed` added 2026-08-29, and it exists because of ONE SENTENCE FROM HIM:
 *
 *   "I NEVER KNEW 3 REPS WAS A THING I JUST THOUGHT I SHOULD DO AS MANY AS I CAN."
 *
 * The box jump card said 3 x 3 and he logged 10 reps a set, three sessions running. The card was
 * right; nobody had ever told him why the number was low, so he read it as a floor. And the engine
 * agreed with him: `progression: "reps"` on a bodyweight lift means "add a rep where you can", so
 * once his log said 10 the card asked for 10, and every gate stayed green while the app and the cue
 * gave opposite instructions on the same screen.
 *
 * A PLYOMETRIC DOES NOT PROGRESS ON REPS AND THE EVIDENCE FILE ALREADY SAID SO. Section 4 of
 * HealthOS/knowledge/training-programme-evidence.md, on Deng 2024: "Progress by quality and contact
 * count, not height or distance." Contact count is SETS. The fourth jump in a set is slower than
 * the first, and a slow jump trains something else. So the rep count is a ceiling set by a person
 * and the engine may not move it in either direction.
 *
 * This is a third state, not a rename of `reps`: `weight` and `reps` and `time` all say WHICH
 * NUMBER THE ENGINE MAY RAISE, and `fixed` says there is not one. */
const PROGRESSION = new Set(['weight', 'reps', 'time', 'fixed']);
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
  /* Added 2026-09-01 with the hanging knee raise. "bar" is a real claim about kit he has to reach,
   * so it gets a test rather than a place on the prose list: the block must actually hang something
   * from a pull-up bar. Naming it matters because the bar is above the rack he is already in, and
   * the tag is what tells him he does not have to walk anywhere. */
  bar: (ex) => /pullup-bar$/.test(ex.station || ''),
};
/** Words a tag may use that claim nothing about equipment. */
const TAG_PROSE = new Set([
  'a', 'and', 'first', 'fresh', 'never', 'tired', 'same', 'technique', 'only', 'its', 'own',
  'dumbbell', 'dumbbells', 'on', 'the', 'floor', 'right', 'there', 'sideways', 'then', 'seat',
  'walk', 'in', 'hand', 'at', 'to', 'no', 'kit', 'up', 'of', 'per', 'side', 'light', 'heavy',
  // Added 2026-08-29 with the sequence relabelling. "the other machine" claims nothing about what
  // equipment is present; the word `machine` beside it is what carries the claim and is tested.
  'other',
  // Added 2026-09-01. "bar above you" needs these two: `bar` carries the equipment claim and is
  // tested above, and neither of these says anything about what is present.
  'above', 'you',
]);

// ---------------------------------------------------------------------------------------------
/* ------ A LADDER IS READ POSITIONALLY, SO ITS ORDER IS LOAD-BEARING. Added 2026-08-29.
 *
 * `portable.<thing>.ladderLb` is the list of weights that exist for an implement, and both readers
 * take the FIRST entry above the working weight and the LAST entry below it. An unsorted array, a
 * duplicate or a zero does not throw anywhere: it returns a weight that is silently wrong, on a
 * card, at the rack. `suggest()` and `ladder.ts` both sort defensively at the seam, and this is why
 * neither of those sorts is the real protection: a stored file nobody can read in order is a file
 * whose next editor inserts a rung in the wrong place and sees every gate stay green. */
for (const [key, item] of Object.entries(equipment.portable ?? {})) {
  if (!item || item.ladderLb === undefined) continue;
  const at = `portable "${key}"`;
  const l = item.ladderLb;
  if (!Array.isArray(l) || l.length < 2) {
    fail('equipment.json', `${at}: "ladderLb" must be an array of at least two weights, got ${JSON.stringify(l)}`);
    continue;
  }
  if (!l.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) {
    fail('equipment.json', `${at}: every entry in "ladderLb" must be a positive number, got ${JSON.stringify(l)}`);
  }
  if (!l.every((n, i) => i === 0 || n > l[i - 1])) {
    fail('equipment.json', `${at}: "ladderLb" must be strictly ascending, and it is read positionally in two places. Got ${JSON.stringify(l)}`);
  }
  if (item.range?.maxLb != null && l[l.length - 1] > item.range.maxLb) {
    fail('equipment.json', `${at}: "ladderLb" tops out at ${l[l.length - 1]} but "range.maxLb" says ${item.range.maxLb}. One of the two is wrong and the safe direction is the lower: a rung that is not on the rack sends him looking for it.`);
  }
  if (!item.ladderConfidence || !Object.keys(equipment.confidenceLevels || {}).includes(item.ladderConfidence)) {
    fail('equipment.json', `${at}: "ladderConfidence" must be one of ${Object.keys(equipment.confidenceLevels || {}).join(', ')}, got ${JSON.stringify(item.ladderConfidence ?? null)}. A list of weights with no provenance is exactly the kind of "you have this" the safe-defaults rule in this file's own header refuses.`);
  }
}

/** Every id the programme currently knows, slots and alts alike. Used by the `formerIds` gate, which
 *  has to be able to say "that id is still live, so its history is not orphaned". */
const ALL_IDS = new Set();
for (const day of Object.values(program.days ?? {})) {
  for (const b of day.blocks ?? []) {
    for (const e of b.exercises ?? []) {
      ALL_IDS.add(e.id);
      for (const a of e.alts ?? []) ALL_IDS.add(a.id);
    }
  }
}

/** The closed set of subjects an `open` question may be about. See the long note under
 *  `checkOpenRow` below for why this exists and what it makes representable. */
const OPEN_TOPICS = new Set(['placement', 'cue', 'prescription', 'equipment', 'volume']);

// The equipment map, flattened once. `station: null` is legal and means "occupies no fixture".
// Anything else must name a station that equipment.json actually lists, so a typo cannot invent a
// machine that is not in the building.
// ---------------------------------------------------------------------------------------------
const ZONES = equipment.zones;

/** One station's record, or undefined. Used by the shareable-station rule below, which must be able
 *  to tell "declared not shareable" from "this station does not exist": the second is already caught
 *  by the placement gate, and conflating them here would let a typo read as a permission. */
const stationOf = (zone, station) => {
  if (!zone || !station) return undefined;
  const s = ZONES[zone]?.stations?.[station];
  return s && typeof s === 'object' ? s : undefined;
};
const STATION_ZONE = new Map();
for (const [zoneKey, zone] of Object.entries(ZONES)) {
  for (const [stationKey, station] of Object.entries(zone.stations || {})) {
    if (STATION_ZONE.has(stationKey)) {
      fail('equipment.json', `station "${stationKey}" is declared in two zones`);
    }
    STATION_ZONE.set(stationKey, zoneKey);
    // A station may park a question too, and until 2026-08-29 nothing checked one. AGENTS.md has
    // documented `open: [{q, asked, due}]` as living in BOTH files since the day it was introduced.
    if (station && station.open !== undefined) {
      const at2 = `station "${stationKey}"`;
      if (!Array.isArray(station.open) || !station.open.length) {
        fail('equipment.json', `${at2}: "open" must be a non-empty array of questions. Delete the field when the question is answered; do not leave an empty one.`);
      } else {
        station.open.forEach((q, qi) => {
          const at = `"open"[${qi}] on ${at2}`;
          if (typeof q.q !== 'string' || q.q.trim().length < 30) {
            fail('equipment.json', `${at}: "q" must be a question of at least 30 characters, got ${JSON.stringify(q.q ?? null)}`);
          }
          for (const f of ['asked', 'due']) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(q[f]))) {
              fail('equipment.json', `${at}: "${f}" must be YYYY-MM-DD, got ${JSON.stringify(q[f] ?? null)}`);
            }
          }
          checkOpenRow('equipment.json', at, q);
        });
      }
    }
  }
}

/* ------ AN OPEN QUESTION HAS TO BE A QUESTION. Added 2026-08-29, on his ruling.
 *
 * His words, reading the nineteen the file held on 2026-08-28: "I feel like most of the questions
 * are either badly phrased or badly explained and for some of them I think you can come up with the
 * answer." Measured against the file he was right, and three of the nineteen contained NO QUESTION
 * AT ALL. Verbatim, whole rows:
 *
 *   "Same reason: the shoulder press machine and the pec deck are two separate fixtures."
 *   "Same reason: the pushdown holds the high pulley and a cable curl needs the low one. ..."
 *   "Moved to the cable on 2026-08-27 and moved back the same hour: ... which is why the partner
 *    is a dumbbell."
 *
 * Every one is a true, useful station fact. None of them asks him anything. They were parked in a
 * question slot because that slot was the nearest place to write a sentence, and `gym-notes.mjs`
 * then printed them to him under a heading that says OPEN QUESTION(S) FOR SILVIO with a due date on
 * each. Three of the nineteen things he was told he owed an answer on were not answerable. That is
 * the co-build protocol's own rule 3 ("he is never asked twice") failing at the other end: he was
 * asked once for something that was never a question.
 *
 * The gate is that the last character is a question mark. It is crude on purpose. Nine more rows
 * failed it the day it landed, all of them ending in an instruction rather than an ask ("Read it on
 * the machine and say what it should say."), and rewriting those nine into actual questions is the
 * "badly phrased" half of his complaint, done by the same edit.
 *
 * `topic` is the second half. See the partner gate below for what it makes representable; here it
 * is only checked for shape. Adding a value means teaching this list, deliberately, rather than a
 * free-text label whose set nobody can enumerate. It is declared above the equipment sweep rather
 * than here because a `const` does not hoist and that sweep runs at module top level; the function
 * below does hoist, which is why only the set had to move. */

/** The shape rules shared by an `open` row wherever it lives: on an exercise in program.json or on
 *  a station in equipment.json. Equipment's rows were checked by NOTHING until today, which is how
 *  one sat there for two days with a premise its own file had already falsified. */
function checkOpenRow(where, at, q) {
  if (!OPEN_TOPICS.has(q.topic)) {
    fail(where, `${at}: "topic" must be one of ${[...OPEN_TOPICS].join(', ')}, got ${JSON.stringify(q.topic ?? null)}. The topic is what lets the partner gate tell "nobody has written down why this is here" from "the reason is written and he is asking about the cue".`);
  }
  /* AND A CEILING, added 2026-08-30 because he asked for one: "these questions are wañls of text,
   * are them simple and to the point". The four live rows were 1362, 919, 569 and 538 characters.
   *
   * The floor above exists so a question carries enough context to answer without reconstructing it,
   * and that was read as licence to put the entire argument in the question. It is not: the reasoning
   * belongs in the block's `why`, which is on the same card, already sourced, already behind a tap.
   * A question is what he is being ASKED, the options, and one clause of cost each.
   *
   * 400 is not a magic number. It is roughly four lines in the terminal and in the email, which is
   * what "simple and to the point" looked like when the four were rewritten: they landed at 169 to
   * 276. If a question genuinely cannot fit, that is a sign the decision behind it has not been
   * reduced far enough to put to anybody. */
  const MAX_Q = 400;
  if (typeof q.q === 'string' && q.q.length > MAX_Q) {
    fail(where, `${at}: "q" is ${q.q.length} characters and the ceiling is ${MAX_Q}. His words: "these questions are wañls of text, are them simple and to the point". Put the reasoning in the block's "why" and leave the question, the options, and one clause of cost each.\n    starts: ${JSON.stringify(q.q.slice(0, 90))}`);
  }
  if (typeof q.q === 'string' && !/\?\s*$/.test(q.q)) {
    fail(where, `${at}: "q" does not end in a question mark, so it is a statement parked in a question slot. gym-notes.mjs prints it to him under "OPEN QUESTION(S) FOR SILVIO" with a due date, and he cannot answer a fact. Either ask him something, or move the sentence to the "why" or the cue where an explanation belongs.\n    ends: ...${JSON.stringify(q.q.slice(-70))}`);
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
  if (item.station === null || item.station === undefined) {
    checkAgainstCatalogue(where, item, kind);
    return;
  }
  const zoneOfStation = STATION_ZONE.get(item.station);
  if (!zoneOfStation) {
    fail(where, `${kind} "${item.id}" names station "${item.station}", which is not in equipment.json`);
    return;
  }
  if (zoneOfStation !== item.zone) {
    fail(where, `${kind} "${item.id}" is in zone "${item.zone}" but station "${item.station}" lives in zone "${zoneOfStation}"`);
  }
  checkAgainstCatalogue(where, item, kind);
}

/* A SLOT MAY NOT DISAGREE WITH THE CATALOGUE ABOUT WHERE IT IS DONE. Added 2026-08-27.
 *
 * Until today nothing compared a slot's zone and station against the ones movements.json gives the
 * same exercise, so any slot could claim any placement and pass every gate. Four disagreed, and one
 * of them was load-bearing: Thursday's calf raise carried `station: null` while the catalogue
 * correctly said it holds the calf machine, and that null is the only reason a leg-curl-machine
 * plus calf-machine block passed the one-station rule. Two selectorised machines in one rest window
 * is the exact arrangement he rejected in August ("you're saying on the fore exercise I should use
 * two machines"). The block passed BECAUSE THE DATA LIED, which is the worst direction per
 * equipment.json's own safe-defaults rule: a false "you can do this here" sends him to a fixture
 * somebody else is using.
 *
 * THE RULE IS DERIVED, NOT A NEW FIELD. An earlier plan added `travels: true` to implement-carried
 * variants. It was not needed: `station: null` ALREADY means "occupies nothing another member could
 * want", which is exactly what makes a thing portable. So:
 *
 *   station in the catalogue    the slot must name that station, in that zone. A fixture is
 *                               somewhere. It cannot be somewhere else on Thursday.
 *   station null                the slot must be null too, and its ZONE is free: a dumbbell is
 *                               carried to whatever lift it partners, which is the whole reason
 *                               dumbbells and kettlebells live under `portable` in equipment.json
 *                               rather than under a zone.
 *
 * That last line is what the unmodelled "traveling dumbbell" convention was: three slots claimed
 * zone `cable` or `machines` for a dumbbell the catalogue files under `benchDb`, and they were
 * right to. Now it is a rule instead of a habit.
 *
 * AN ALIAS MAY NOT CARRY A DIFFERENT PLACEMENT, and that is not an extra rule, it falls out of this
 * one. An alias means "the same job by another name". Three alts were aliased onto a variant that
 * stands somewhere else entirely: a SEATED lateral raise holds the bench, a side plank is on the
 * floor where the Copenhagen it pointed at holds the bench, and a banded straight-arm pulldown
 * anchors to a rack post while the cable version is at the high pulley across the gym. Those are
 * different fixtures, which is the one thing an alias cannot express, so all three are their own
 * variants now. If this check fires on an alias, the answer is a new variant, never a changed slot.
 */
function checkAgainstCatalogue(where, item, kind) {
  if (!MOVEMENTS) return;                       // absent catalogue is reported at its own call site
  const v = MOVEMENTS[item.id];
  if (!v) return;                               // unknown ids are the shared-muscle rule's business
  const catStation = v.station ?? null;
  const slotStation = item.station ?? null;
  if (catStation === null) {
    if (slotStation !== null) {
      fail(where, `${kind} "${item.id}" claims station "${slotStation}", but movements.json says it holds no fixture. One of the two is wrong, and a slot that claims a fixture the catalogue does not know about is how a block passes the one-station rule while being impossible to do. If this is genuinely a different way of doing it, at a different fixture, it is a new variant in movements.json rather than a placement typed into a slot.`);
    }
    return;                                     // it travels: the zone is the slot's to choose
  }
  if (slotStation !== catStation) {
    fail(where, `${kind} "${item.id}" says station "${slotStation}", movements.json says "${catStation}". A fixture is in one place. Fix whichever is wrong, and if they are two different exercises, give the second one its own variant instead of an alias.`);
  }
  if (item.zone !== v.zone) {
    fail(where, `${kind} "${item.id}" is in zone "${item.zone}" but movements.json places it in "${v.zone}". Only an exercise holding NO fixture may be carried into another zone.`);
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

/* WALK THE GYM ONCE. Added 2026-08-22, from the session he actually did rather than the one he was
 * given.
 *
 * He said it like this: "if I'm already on the bench, I should take advantage of the bench as much
 * as I can ... then I have to use the bench, go do something else, and then come back. Maybe I lost
 * the bench already."
 *
 * The log proves it. Tuesday was prescribed benchDb, cable, cable, benchDb, cable: four zone changes
 * and a walk back to the dumbbells for the fourth block. What he actually did was bench, then the
 * overhead press, then all three cable blocks. One trip. He also ran out of time and never reached
 * the lat pulldown, and while he blamed himself for arriving late, the prescribed route was making
 * him pay for it twice.
 *
 * So: once a day's blocks LEAVE a zone, they may not go back to it. Ordering the blocks costs
 * nothing and the walking is real.
 *
 * The primer's zone is exempt, and only the primer's. It is pinned first because it has to be done
 * fresh (Deng 2024), it occupies a plyo box or nothing at all, and it holds no fixture anybody needs
 * later, so coming back past it costs nothing. Every other return is somebody else taking the bench
 * while you were at the cables.
 *
 * This does NOT say which zone to start in, and it must not: that is what `role` and the exercise
 * order evidence decide (Nunes 2021, 11 studies: strength gains are largest in the exercises done at
 * the beginning of a session). This rule only forbids the route from doubling back. */
function checkZoneRoute(dayKey, day) {
  const blocks = (day.blocks || []).filter((b) => Array.isArray(b.exercises) && b.exercises.length);
  if (blocks.length < 2) return;
  const primerZone = blocks[0].role === 'primer' ? blocks[0].exercises[0].zone : null;
  const route = blocks.map((b) => ({ zone: b.exercises[0].zone, label: b.label }));
  const left = new Set();
  for (let i = 1; i < route.length; i++) {
    const prev = route[i - 1].zone;
    const here = route[i].zone;
    if (here === prev) continue;
    left.add(prev);
    if (left.has(here) && here !== primerZone) {
      fail(
        `${dayKey}/${route[i].label}`,
        `the route doubles back. This day goes ${route.map((r) => r.zone).join(' -> ')}, and this block returns to "${here}" after leaving it. `
        + `Reorder the blocks so each zone is visited once: whatever he is standing at, he finishes with before walking away. `
        + (primerZone ? `(The primer's zone "${primerZone}" is exempt; it is pinned first and holds nothing.)` : ''),
      );
      return;
    }
  }
}

for (const [dayKey, day] of Object.entries(program.days)) {
  checkZoneRoute(dayKey, day);
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

  /* THE DAY CHIP IS THE TEXT BEFORE THE FIRST COLON, and nothing said so until 2026-08-31.
   * `splitName` in src/lib/gym/program-shared.ts is `d.title.split(/:\s/)[0] || d.name`, so a title
   * with no colon renders WHOLE into the chip row. The whole-week rebuild wrote four titles like
   * "Squat heavy, hinge second" with no colon, and the four chips went from "Lower A" to a
   * full-width sentence each, turning a two-line chip row into four stacked rows above the sets
   * count. Nothing failed: typecheck, lint, build, 46 validator cases, 28 probe checks and 36 tap
   * surfaces all passed, because the fallback is legal and the row does not overflow. The
   * screenshot caught it, which is the gate this repo keeps rediscovering.
   *
   * A SILENT FALLBACK IS THE DEFECT, so the requirement is stated here instead: the head has to be
   * short enough to be a chip. 14 characters fits four chips in two rows at 390px, measured. */
  const CHIP_MAX = 14;
  const head = String(day.title).split(/:\s/)[0]?.trim() ?? '';
  if (head.length > CHIP_MAX) {
    fail(dayKey, `the day chip renders "${head}" (${head.length} chars). splitName() takes the text `
      + `before the first ": " in the title and falls back to the WHOLE title when there is no colon, `
      + `so this becomes a full-width chip. Give the title a short head, e.g. "${day.name}: ${String(day.title).toLowerCase()}". `
      + `Keep the head to ${CHIP_MAX} characters or fewer: that is what fits four chips in two rows at 390px.`);
  }
  if (!warmups[day.warmup]) fail(dayKey, `warmup "${day.warmup}" not found in warmups.json`);

  /* ------ THE WARMUP MUST MATCH WHAT THE SESSION STARTS WITH. Added 2026-09-02, on his note.
   *
   * His words, note #43: "the warmp did change, still seems like upper". He was reading Session D,
   * which opens with a barbell back squat and was handing him band pull-aparts, wall slides, band
   * external rotations and arm circles. Session A had the mirror of it: an overhead press first and
   * the clamshell/frog-pump/deep-squat/ankle-rocker set.
   *
   * WHY IT DRIFTED, and it is a consequence of a change nobody followed through. While the split was
   * upper/lower, `warmup: "lower"` on a lower day was true by construction. Every session is FULL
   * BODY now, so the label describes nothing on its own and both wrong answers survived four gates,
   * two probes and a screenshot: nothing in this repo related the warmup to the exercises.
   *
   * The rule that is left is the one that matters at the rack: warm up what he does FIRST, because
   * that is the lift that has to be ready. The primer is skipped, for the same reason gym-order
   * skips it: a box jump is not what the day is about. This is a judgement, and it is written here
   * rather than in prose so a future full-body reshuffle cannot quietly break it again. */
  const WARMUP_REGION = { lower: 'lower', upper: 'upper' };
  const firstWorking = (day.blocks || []).find((b) => b.role !== 'primer' && (b.exercises || []).length);
  const leadId = firstWorking?.exercises?.[0]?.id;
  const leadInfo = leadId && MOVEMENTS ? MOVEMENTS[leadId] : null;
  if (leadInfo && WARMUP_REGION[day.warmup]) {
    const LOWER = ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'];
    const region = (leadInfo.primary ?? []).some((m) => LOWER.includes(m)) ? 'lower' : 'upper';
    if (region !== WARMUP_REGION[day.warmup]) {
      fail(dayKey, `this session opens with "${firstWorking.exercises[0].name}", which is a ${region}-body lift, and its warmup is "${day.warmup}". `
        + `Every session is full body now, so the warmup label says nothing on its own: the rule is that it prepares whatever is done FIRST. `
        + `Set warmup to "${region}", or move an ${WARMUP_REGION[day.warmup]}-body lift to the front of the session.`);
    }
  }
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
    /* A BLOCK'S `why` MAY NOT NAME AN EXERCISE THAT IS NOT IN THE BLOCK.
     *
     * Note #21, 2026-08-27, from the gym floor: "There's still old text in the why is here things."
     * He was right, and it was twelve blocks. The 2026-08-27 rebuild removed the glute bridge, both
     * pushup primers, two of three dead bugs, the plank taps and two of four reverse flys, and left
     * every `why` still explaining why they were there. A reason that describes an exercise he
     * cannot see is worse than no reason: it is the app telling him something false about the screen
     * in front of him, which is the one thing this project cannot afford.
     *
     * THIS IS THE CLASS, NOT THE TWELVE INSTANCES. Any future edit that removes an exercise now
     * fails the build unless the reasoning is updated in the same commit. That is the only reliable
     * ordering, because the removal and the prose live in different parts of the file and nobody has
     * ever remembered to do both.
     *
     * Matching is on the catalogue's own names, lowercased, longest first so "single-leg glute
     * bridge" is checked before "glute bridge". A name that also appears in the block is fine: the
     * rule is about ABSENT exercises only. */
    if (block.why && MOVEMENTS) {
      /* Two refinements, both found by running the first version against the real file.
       *
       * ALIASES. The catalogue name is "DB Reverse Fly" but the prose says "the reverse fly", so
       * matching whole names alone missed five of the twelve stale clauses. Every name is therefore
       * also matched with its implement prefix stripped.
       *
       * CROSS-REFERENCES ARE LEGAL. "the assisted pull-up on Friday is the second" is a true and
       * useful sentence in a Tuesday block. A mention is only stale if its SENTENCE does not also
       * name another day, which is what a cross-reference always does. */
      const stripImplement = (n) => n
        .replace(/^(db|bb|ez bar|ez|cable|machine|smith|kb|barbell|dumbbell|single-leg|seated|standing|incline|assisted)\s+/i, '')
        .trim();

      const present = new Set();
      for (const ex of block.exercises) {
        const info = MOVEMENTS[ex.id];
        for (const n of [info?.name, ex.name].filter(Boolean)) {
          present.add(String(n).toLowerCase());
          present.add(stripImplement(String(n).toLowerCase()));
        }
      }

      /* Three forms per exercise, because prose does not use full names. "Single-Leg Glute Bridge"
       * is written as "the glute bridge" and as "Bridge in the rest gaps", and the first version of
       * this gate caught neither. Full name, implement stripped, and the trailing noun. */
      const catalogue = new Set();
      for (const v of Object.values(MOVEMENTS)) {
        const full = v.name.toLowerCase();
        catalogue.add(full);
        catalogue.add(stripImplement(full));
        const words = stripImplement(full).split(/[\s-]+/);
        if (words.length > 1) catalogue.add(words[words.length - 1]);
      }
      // 6, not 8: the first version missed "Bridge in the rest gaps" because "bridge" is six letters.
      // Short generic words are excluded by name below rather than by length.
      const TOO_GENERIC = new Set(["pull-up", "pushup", "plank", "carry", "squat", "row", "curl", "hinge", "press", "jump", "machine", "raise", "extension", "fly", "bound", "lunge", "hold"]);
      const named = [...catalogue].filter((n) => n.length >= 6 && !TOO_GENERIC.has(n)).sort((a, b) => b.length - a.length);

      /* `upper b` MATCHED "UPPER BACK", AND THAT IS HOW TWO STALE CLAUSES SURVIVED THIS GATE.
       *
       * Silvio found one of them on the card, 2026-08-29: Thursday's front squat block is a SOLO
       * lift and its reason read "The reverse fly rides in the rest because a front squat uses
       * nothing in the UPPER BACK except to hold position". There is no reverse fly in that block.
       * The gate skips any sentence naming another day, because a cross-reference is legal, and
       * "upper b" is a substring of "upper back". So the sentence exempted ITSELF, using a body part.
       * `lower b` does the same to "lower back", and `upper a`/`lower a` would to any word starting
       * with those letters.
       *
       * Word boundaries, and an explicit refusal of the two body words that follow. A gate whose
       * escape hatch can be opened by an anatomical noun is a gate that checks less than it claims,
       * which is theme T6 of the 2026-08-28 audit and is now three for three on this file. */
      const DAY_WORD = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:lower|upper) [ab])\b(?!\s*(?:back|body))/i;

      /* AND NAMING A DAY IS NO LONGER A BLANK CHEQUE. 10-gym P1-9 proposed this and it was never
       * built: a `why` that names a weekday must name something ACTUALLY ON THAT DAY. Thursday's
       * lunge block read "Single-leg work, dead bugs in the rest gaps for the same knee-valgus
       * reason as Tuesday" and there are no dead bugs in it. The cross-reference was doing two jobs
       * at once, one true (Tuesday has dead bugs) and one false (so does this block), and the
       * exemption covered both. So a mention is forgiven only if the exercise is in THIS block or on
       * the day the sentence names. */
      const DAY_OF = { monday: 'monday', tuesday: 'tuesday', thursday: 'thursday', friday: 'friday',
        'lower a': 'monday', 'upper a': 'tuesday', 'lower b': 'thursday', 'upper b': 'friday' };
      const namesOn = (dayKey) => {
        const s = new Set();
        for (const b of program.days?.[dayKey]?.blocks ?? []) {
          for (const ex of b.exercises ?? []) {
            for (const nm of [MOVEMENTS[ex.id]?.name, ex.name, ...(ex.alts ?? []).map((a) => a.name)].filter(Boolean)) {
              s.add(String(nm).toLowerCase());
              s.add(stripImplement(String(nm).toLowerCase()));
            }
          }
        }
        return s;
      };

      const sentences = block.why.split(/(?<=[.!?])\s+/);
      const absent = new Map();

      for (const sentence of sentences) {
        const low = sentence.toLowerCase();
        const m = low.match(DAY_WORD);
        const target = m ? DAY_OF[m[1].toLowerCase()] : null;
        const elsewhere = target ? namesOn(target) : null;
        let remaining = low;
        for (const n of named) {
          if (!remaining.includes(n)) continue;
          remaining = remaining.split(n).join(' ');           // longest name wins over its suffix
          if ([...present].some((pn) => pn.includes(n) || n.includes(pn))) continue;
          if (elsewhere && [...elsewhere].some((pn) => pn.includes(n) || n.includes(pn))) continue;
          absent.set(n, target);
        }
      }

      /* A BLOCK OF ONE HAS NO REST FOR ANYTHING TO RIDE IN, and that is checkable without knowing
       * which exercise is meant.
       *
       * The clause above catches "names an exercise that is not here". It does NOT catch Thursday's
       * lunge block, whose whole `why` is "Single-leg work, dead bugs in the rest gaps for the same
       * knee-valgus reason as Tuesday": dead bugs really are on Tuesday, so the cross-reference is
       * true, and it is wrapped around a claim about THIS block that is false. Telling those two
       * readings apart is semantics and any proximity rule for it would produce the kind of
       * confident wrong finding this file has been bitten by twice.
       *
       * This is the part that needs no semantics. If the block holds one exercise, nothing is in its
       * rest, whatever the sentence calls it. */
      if (block.exercises.length === 1) {
        const RIDES = /\b(rides in the rest|in the rest gaps?|in its rest|during the (?:first|lead)|goes in (?:its|the) rest|in the rest window)\b/i;
        const m = block.why.match(RIDES);
        if (m) {
          fail(where, `this block holds ONE exercise (${block.exercises[0].name}), and its "why" says something "${m[0]}". Nothing is in its rest. The partner was removed and the reasoning was left behind, which is the state he reads as the app having lost track of itself.`);
        }
      }

      if (absent.size) {
        const parts = [...absent].map(([n, t]) => `"${n}"${t ? ` (the sentence points at ${t}, and it is not there either)` : ''}`);
        fail(where, `the block's "why" names ${parts.join(', ')}, which ${absent.size === 1 ? 'is' : 'are'} not in this block. Its exercises are: ${block.exercises.map((e) => e.name).join(', ')}. Remove the clause, or name the day it is actually on. A reason that describes something he cannot see on the card is a false statement about his own screen.`);
      }
    }

    /* A PARTNER MAY NOT SHARE A MUSCLE WITH THE LIFT IT SITS BEHIND.
     *
     * THIS REPLACES "EVERY BLOCK IS A PAIR", which was here from 2026-08-22 to 2026-08-27 and made
     * a single-exercise block a build failure. He asked for that rule for a good reason: he had
     * questioned three one-exercise blocks in two days and got a local excuse each time. But it was
     * sourced to Iversen 2021, which the 2026-08-27 audit could not verify, and it had a cost
     * nobody counted. Every new block needed a partner; a partner may hold no fixture; so the only
     * candidates left were dumbbell isolation and floor holds. The week ended up with 12 sets of
     * rear delts and 12 of lateral raises against 4 of back squat, and 23 weekly sets of work with
     * no weight column at all sitting inside blocks labelled `main`.
     *
     * His own words, 2026-08-27: "when I said superset the agents started pairing everything, like
     * every single exercise needs a superset, which might also not be the best approach."
     *
     * THE REPLACEMENT IS SOURCED, WHICH THE OLD RULE WAS NOT. Zhang X, Weakley J, Li H, et al.
     * Superset Versus Traditional Resistance Training Prescriptions. Sports Med. 2025;55(4):953-975.
     * 19 studies, 313 participants. Verbatim: "similar biomechanical supersets led to significantly
     * less volume load than traditional sets", while agonist-antagonist pairs showed "no significant
     * difference" and "a significantly greater total number of repetitions". Supersets cut session
     * time by about 37%.
     *
     * So pairing is still good and still the mechanism that makes a long day fit. What is banned is
     * the pairing that taxes the lift in front of it. A block of one is now legal; a block whose
     * partner shares the lead's primary muscle is not.
     *
     * The muscle data is content/gym/movements.json. If a block's exercise is not in that
     * catalogue this check cannot run, and says so rather than passing quietly. */
    if (block.exercises.length >= 2 && MOVEMENTS) {
      const lead = block.exercises[0];
      const leadInfo = MOVEMENTS[lead.id];
      for (const partner of block.exercises.slice(1)) {
        const pInfo = MOVEMENTS[partner.id];
        if (!leadInfo || !pInfo) {
          fail(where, `"${!leadInfo ? lead.id : partner.id}" is not in content/gym/movements.json, so the shared-muscle check cannot run on this block. Add it to the catalogue in this commit.`);
          continue;
        }
        const shared = pInfo.primary.filter((m) => leadInfo.primary.includes(m));
        if (shared.length) {
          fail(where, `partner "${partner.name}" works ${shared.join(', ')}, which is also what "${lead.name}" works. Zhang 2025: a superset of two exercises hitting the same muscle significantly REDUCES the volume load of the lead lift. Either pick a partner that uses a different muscle, or run the lead on its own, which is now allowed.`);
        }

        /* "DOES NOT USE" IS A CLAIM ABOUT THIS CATALOGUE, AND THREE OF THEM WERE FALSE.
         *
         * The partner clause reads "<partner> goes in the rest because the <lead> does not use
         * <something>". On 2026-09-01 an adversarial review checked those sentences against
         * movements.json for the first time and found three the catalogue directly contradicts:
         *
         *   "the Front Squat does not use the trunk"      front-squat secondary: glutes, abs, erectors
         *   "the Overhead Press does not use the arms"    push-vertical secondary: triceps, side-delts, abs
         *   "the Lat Pulldown does not use them"          pull-vertical secondary: ..., rear-delts, ...
         *
         * The front squat is the worst of the three, because that same catalogue entry's own note
         * reads "more trunk than the back squat". The overhead press one contradicts the programme's
         * own arithmetic: its `$comment` says the presses deliver 6 fractional triceps sets before any
         * extension exists, and that 6 IS the overhead press's triceps secondary credit.
         *
         * WHY NOTHING CAUGHT IT FOR A DAY. The verbatim-span gate proves the clause appears in the
         * block's `why`. It cannot tell whether the sentence is TRUE. The noun was hand-written into a
         * builder argument, so an assertion about anatomy sat next to the data file that answers it.
         * Fifth law exactly: a reviewer asked to check the pairings confirmed them, and one asked to
         * find where they LIE found three.
         *
         * THE TEST NEEDS NO ENGLISH. Whatever noun the sentence uses, the claim is "the lead does not
         * train what the partner trains", so the lead's primary AND secondary must not contain any of
         * the partner's PRIMARY muscles. Deliberately stricter than the Zhang rule above, which
         * compares primary against primary only: this sentence claims more than Zhang requires. A pair
         * that is genuinely clean is untouched, and 12 of the 15 clauses passed on the first run. */
        if (/does not use/i.test(String(partner.whyHere ?? ''))) {
          const leadTrains = new Set([...(leadInfo.primary ?? []), ...(leadInfo.secondary ?? [])]);
          const overlap = (pInfo.primary ?? []).filter((m) => leadTrains.has(m));
          if (overlap.length) {
            fail(where, `"${partner.name}" says the ${lead.name} "does not use" what it trains, and `
              + `movements.json disagrees: ${lead.id} carries ${overlap.join(', ')} `
              + `(primary ${(leadInfo.primary ?? []).join(', ') || 'none'}; secondary `
              + `${(leadInfo.secondary ?? []).join(', ') || 'none'}), and ${partner.id} trains `
              + `${overlap.join(', ')} as a PRIMARY mover. The sentence is false. A lead that loads the `
              + 'muscle as a helper while the partner trains it directly is a perfectly good pairing and '
              + 'a different sentence, so say that instead. Change the block "why" in the same edit, '
              + 'because whyHere has to stay a verbatim span of it.');
          }
        }
      }
    }

    // `alternate` means the two share one rest window, which only makes sense for exactly two.
    // A block of ONE is fine and is not an alternate; only a block of three or more is an error.
    if (CONCURRENT.has(block.pairing) && block.exercises.length > 2) {
      fail(where, `${block.pairing} block has ${block.exercises.length} exercises, expected at most 2`);
    }

    /* ------ THE PARTNER SAYS WHY IT IS THERE, ON ITS OWN ROW. Added 2026-08-27, on his ruling.
     *
     * Five of his eighteen gym notes ask a version of "why is this here", and every exercise they
     * name resolves to a PARTNER at position 2, never a lead lift. The reason was already written:
     * `why` above is required, present on all 24 blocks, and names the questioned partner in 10 of
     * the 11 cases. It was collapsed behind a summary reading "Why this is here" while he was
     * looking at a calf raise, so nothing told him the tap would explain the calf raise. He asked
     * five more times over nine days, after the fix shipped.
     *
     * THE FAILURE WAS REACH, NOT REASONING, and that is the only reason this is not a second `why`.
     * `whyHere` may not say anything new. It must be a VERBATIM SPAN of the block's own `why`, the
     * one licence being the case of the first character so a mid-sentence span reads as a sentence.
     *
     * That gate is the point of the field. Note #12, eight days after the others: "Walls of text
     * again why do I need all this, just leave the cue and thats it, it can even be hidden". A
     * per-exercise prose field is exactly how an agent rebuilds that wall one honest-looking clause
     * at a time, and no reviewer reading a diff would catch it. Here it cannot start: text that is
     * not already in the accepted `why` does not compile.
     *
     * A partner with no such span in its block's `why` is not given one. It gets an `open` question
     * instead, which is the honest state: nobody has written down why it is there.
     *
     * THE QUESTION HAS TO BE ABOUT THE PLACEMENT, and until 2026-08-29 this read `open.length` and
     * did not care what the question said. Three consequences, all live:
     *
     *   - A partner whose only open row asked about its CUE or its next dumbbell satisfied a gate
     *     about why it is there. The card then rendered "No reason recorded yet, a question about
     *     this is open" while the reason sat one tap above it in the block's own `why`. That is the
     *     reach failure this whole feature exists to fix, produced by the gate meant to prevent it.
     *   - The reverse clause refused BOTH together, on the theory that "either the reason is
     *     written or it is not". That is a false dichotomy. Tuesday's overhead extension has a
     *     written reason AND he has skipped it twice and wants it dropped: the reason is written and
     *     under challenge, which is a real state the file could not express.
     *   - So a partner with a written reason could not also carry a progression question about
     *     itself, and Tuesday's lateral raise carries exactly one of those.
     *
     * `topic` makes the distinction representable rather than guessed from the prose. A `placement`
     * row is the honest "nobody has written this down yet"; every other topic is orthogonal to it. */
    if (block.exercises.length >= 2) {
      const partner = block.exercises[block.exercises.length - 1];
      const clause = partner.whyHere;
      const open = Array.isArray(partner.open) ? partner.open : [];
      const placement = open.filter((q) => q && q.topic === 'placement');

      if (clause === undefined && !placement.length) {
        fail(where, `partner "${partner.id}" has no "whyHere" and no open question with topic "placement". It sits at position 2 and every "why is this here" note he has written names a position-2 exercise. Either lift a verbatim span out of this block's "why" that explains this exercise, or, if the "why" does not explain it, record an open question with topic "placement" on the exercise rather than inventing a reason.${open.length ? ` It carries ${open.length} open question(s), but about ${[...new Set(open.map((q) => q && q.topic))].join(', ')}, which is a different subject.` : ''}`);
      }
      if (clause !== undefined) {
        if (typeof clause !== 'string' || clause.trim().length < 20) {
          fail(where, `"whyHere" on "${partner.id}" must be a string of at least 20 characters, got ${JSON.stringify(clause)}`);
        } else {
          // Modulo the first character's case, in EITHER direction, and nothing else. Both
          // directions because a span can be lifted from mid-sentence (needs capitalising) or from
          // the start of one (needs lowering if it lands mid-clause). Only one direction was
          // implemented first, and validate.test.mjs caught it on its first run.
          const variants = [
            clause,
            clause[0].toLowerCase() + clause.slice(1),
            clause[0].toUpperCase() + clause.slice(1),
          ];
          if (!variants.some((v) => block.why.includes(v))) {
            fail(where, `"whyHere" on "${partner.id}" is NOT a verbatim span of this block's "why". This field exists to move reasoning he has already accepted onto the row where he asks for it, and for no other purpose. Nothing new may be said here. Either quote the "why" exactly, or change the "why" first.\n    whyHere: ${JSON.stringify(clause)}\n    why:     ${JSON.stringify(block.why)}`);
          }
        }
      }
      // One field, one meaning. The lead lift's reason is the block label plus the `why`.
      block.exercises.slice(0, -1).forEach((lead) => {
        if (lead.whyHere !== undefined) {
          fail(where, `"whyHere" on "${lead.id}", which is a lead lift, not the partner. The lead's reason is the block label and the "why"; this field answers "why is this second thing here", which is the only question he has actually asked.`);
        }
      });
    }

    /* ------ AN OPEN QUESTION LIVES ON THE THING IT IS ABOUT. Added 2026-08-27, on his ruling.
     *
     * Four of his notes were equipment facts nobody could have known without standing at the rack:
     * kettlebells stop at 50 lb, the cable does the overhead tricep, the barbell station could have
     * held more of Friday. KitchenOS/UNKNOWNS.md solves the same problem with a file whose one job
     * is "Silvio should never be asked the same question twice", and it works.
     *
     * He ruled against a second file here: the question goes on the exercise or station it is about,
     * where the next agent is already reading, and a gate keeps it honest. This validator checks the
     * SHAPE only. The DUE DATE is checked by scripts/gym-notes.mjs, which AGENTS.md already requires
     * before any /gym edit, because a build that goes red overnight with no file edited would block
     * an unrelated deploy: the same reason check-ladder.mjs is not in here. */
    /* ------ A RENAMED SLOT SAYS WHAT IT USED TO BE CALLED. Added 2026-08-29, 10-gym P1-2.
     *
     * On 2026-08-27 six slot ids were rewritten so partners sat at the right fixture. Nothing warned
     * that an id had changed and its HISTORY had not followed, so three cards now say "First time:
     * log your working weight" for movements he did on 2026-08-25, and the trend line, which needs
     * three points under one name, disappeared with it.
     *
     * "He has never done this" and "he did this under another name three days ago" look identical in
     * program.json and have opposite fixes. `formerIds` is what makes them different, and
     * `check-ladder.mjs`, which has the database this file deliberately does not, reports any id in
     * `gym_set` that program.json no longer knows and no slot claims.
     *
     * NOT AN ALIAS, and the distinction is load-bearing. An alias in movements.json means one
     * movement and one history, and `equivalent-ids.ts` merges the sets on every read. That is right
     * for a machine calf raise and a standing calf raise, and wrong here: 50 lb of dumbbell is not
     * 50 lb of cable. So this gate refuses a `formerId` that is a LIVE id, which would be an alias
     * written in the wrong field, and refuses one that equals its own slot. */
    for (const ex of block.exercises) {
      if (ex.formerIds !== undefined) {
        const at = `"formerIds" on "${ex.id}"`;
        if (!Array.isArray(ex.formerIds) || !ex.formerIds.length || !ex.formerIds.every((s) => typeof s === 'string' && s)) {
          fail(where, `${at}: must be a non-empty array of the ids this slot used to carry, got ${JSON.stringify(ex.formerIds)}. Delete the field rather than leaving an empty one.`);
        } else {
          for (const f of ex.formerIds) {
            if (f === ex.id) {
              fail(where, `${at}: names "${f}", which is the slot's own id. A slot did not used to be called what it is called.`);
            } else if (ALL_IDS.has(f)) {
              fail(where, `${at}: names "${f}", which is STILL a live id in program.json. Then its history is not orphaned and this is not a rename. If the two are one movement with one load scale, make it an alias in movements.json, which merges the histories on every read. If they are two movements, they are two histories and neither points at the other.`);
            }
          }
        }
      }
      if (ex.open === undefined) continue;
      if (!Array.isArray(ex.open) || !ex.open.length) {
        fail(where, `"open" on "${ex.id}" must be a non-empty array of questions, got ${JSON.stringify(ex.open)}. Delete the field when the question is answered; do not leave an empty one.`);
        continue;
      }
      ex.open.forEach((q, qi) => {
        const at = `"open"[${qi}] on "${ex.id}"`;
        if (typeof q.q !== 'string' || q.q.trim().length < 30) {
          fail(where, `${at}: "q" must be a question of at least 30 characters, got ${JSON.stringify(q.q ?? null)}. He answers in one word; the question has to carry the context so he does not have to reconstruct it.`);
        }
        checkOpenRow(where, at, q);
        for (const f of ['asked', 'due']) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(q[f]))) {
            fail(where, `${at}: "${f}" must be YYYY-MM-DD, got ${JSON.stringify(q[f] ?? null)}`);
          }
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.asked)) && /^\d{4}-\d{2}-\d{2}$/.test(String(q.due)) && q.due <= q.asked) {
          fail(where, `${at}: "due" (${q.due}) is not after "asked" (${q.asked}). A question with no runway is a question nobody will surface.`);
        }
      });
    }

    // ------ THE HEADER MAY NOT PROMISE WHAT THE BLOCK DOES NOT CONTAIN. See PAIR_PROMISE above.
    const label = String(block.label || '');

    /* ------ A BLOCK LABEL MAY NOT COUNT.
     *
     * His note #34, at the rack on 2026-08-28: "You are saying secon horizontal pull on seated rows,
     * second to what?" Nothing on Tuesday is a first horizontal pull. The one it was counting from is
     * BB Row, three days LATER on Friday, so the label was unanswerable from the day in front of him
     * and, taken chronologically, false: Tuesday's row is the week's first.
     *
     * SEVEN LABELS CARRIED AN ORDINAL AND ONE OF THEM CONTRADICTED ITS OWN CARD. "Second Pattern:
     * Vertical Pull" sat directly above a `why` opening "The week's first vertical pull", so the chip
     * and the explanation under it disagreed about the same lift. Every one of the seven whys already
     * named the counterpart, which is the answer to his question: the reason was there and the LABEL
     * was what sent him looking for something that was not.
     *
     * So the ordinal moves to the `why`, where the referent can be named, and the label says what the
     * block is. Same shape as the reach failure AGENTS.md records for `whyHere`: there was already
     * more reasoning than he had ever seen, and nothing told him where to find it.
     *
     * A word list rather than a movement lookup on purpose. A gate that resolved "second" against the
     * week's real order would need the catalogue, would have to guess whether "Second Pattern:" counts
     * the day or the week, and would fire on labels that are fine. This one has no judgement in it:
     * a label counts, or it does not. */
    const ORDINAL = /\b(second|third|fourth|2nd|3rd|4th)\b/i;
    const counting = label.match(ORDINAL);
    if (counting) {
      fail(
        where,
        `label "${label}" counts ("${counting[0]}"), and a block label is read on one day. `
        + 'Whatever it is counting from is on another day and he cannot check it from the card: note #34, '
        + '"second to what?". Name the pattern in the label and put the other exposure in the "why", '
        + 'which is where every one of these already was.',
      );
    }

    /* ------ A SEQUENCE SAYS "THEN". Added 2026-08-29, and he found it by reading his own card.
     *
     * Six blocks are `sequence`, which means finish the first exercise and then walk to the second.
     * Three were labelled "A, then B" and three "A + B", and the page renders the two identically
     * apart from one thin vertical rule down the side of a pair. His words: "if its a superset
     * theres a line on the side thats not present on the last superset", and in the same breath
     * "impossible leg curl with calf machine raise" about "Hamstrings + Calves", which is a sequence
     * and always was.
     *
     * SO THE ONE SIGNAL THAT SEPARATES THEM WAS READ AS A FORMATTING BUG. The data was right, the
     * one-station gate was right, and `howToRun` printed the correct sentence under both, in the same
     * grey, in the same place, saying opposite things. That is the reach failure this whole surface
     * keeps producing: note #27 was fixed on 2026-08-28 by making Tuesday's pulldown block a
     * sequence, and he saw a screen that looked exactly like the one he had complained about.
     *
     * A `+` between two exercises means "these two go together". A sequence is the opposite claim,
     * so it may not use one, and it must say the word that carries the meaning. */
    if (block.pairing === 'sequence' && block.exercises.length >= 2) {
      const joined = `${label} ${block.tag || ''}`.toLowerCase();
      if (/\s[+&]\s/.test(label)) {
        fail(where, `sequence block labelled "${label}", and a "+" between two exercises reads as "do these together". This block is the opposite: the second starts after the first is finished. Say "then".`);
      }
      if (!/\bthen\b/.test(joined)) {
        fail(where, `sequence block "${label}" ${block.tag ? `tagged "${block.tag}" ` : ''}never says "then". On the page a sequence and a superset differ by one vertical rule, and he read that rule as a formatting inconsistency while calling a sequence "impossible". The label or the tag has to carry the word.`);
      }
    }

    if (block.exercises.length === 1) {
      const promise = PAIR_PROMISE.find((c) => label.toLowerCase().includes(c));
      if (promise) {
        fail(where, `one-exercise block, but its label "${label}" contains "${promise.trim()}", which reads as a pair. Either add the second exercise or say what is actually there.`);
      }
      if (label.trim().toLowerCase() === String(block.exercises[0].name || '').trim().toLowerCase()) {
        fail(where, `label "${label}" is the name of its only exercise, printed a second time. A block label says why the slot exists ("Vertical Pull"); the exercise says what fills it.`);
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

      /* CASE (c), "ADJACENT EQUIPMENT IN ARM'S REACH", WAS NEVER IMPLEMENTED. Added 2026-08-30.
       *
       * equipment.json's own header quotes his rule of 2026-05-23 in full: superset partners must be
       * "(a) same equipment, (b) bodyweight/floor partner of the main lift, or (c) adjacent equipment
       * in arm's reach". This validator implemented (a) and (b). The word "adjacent" appeared nowhere
       * in it, so every pairing across two fixtures was refused however close together they stood,
       * and the file that documents the omission is the one that documents the rule.
       *
       * THAT IS THE MECHANICAL REASON HE KEPT BEING TOLD NO PARTNER EXISTED. Nine blocks are a single
       * lift with an empty rest, and `--fill` finds 25 to 43 legal candidates for each of them; the
       * ones in the cable and machine zones were being thrown out by this clause, not by a shortage
       * of exercises. His words, 2026-08-30: "why in the world moving an exercise means the other
       * lift stay solo, is there no more exercises in the world? ... that just seems to me to be a
       * lazy answer."
       *
       * ADJACENCY IS DECLARED, NOT ASSUMED, and only where he has said so. Today that is the three
       * cable columns and nothing else: the machine bank is not adjacent because he called leg curl
       * plus calf raise impossible, and the rack's pull-up bar is not because he said that walk works
       * "only when the gym is not busy", which is a condition no card can check. Same safe-defaults
       * rule as the rest of the file: an undeclared pair refuses. */
      const adjacent = (x, y) => {
        const sx = stationOf(a.zone, x);
        const sy = stationOf(b.zone, y);
        return Boolean(sx?.adjacentTo?.includes(y)) && Boolean(sy?.adjacentTo?.includes(x));
      };
      if (stations.length > 1 && !adjacent(a.station, b.station)) {
        fail(where, `${block.pairing} block occupies ${stations.length} stations (${stations.join(' + ')}). Two exercises done in one window may occupy at most one, unless the two fixtures are declared adjacent in equipment.json, which is case (c) of the rule that file quotes. Either give the partner no fixture, or declare the two adjacent WITH his words for it.`);
      }
      if (stations.length > 1 && adjacent(a.station, b.station) && a.zone !== b.zone) {
        fail(where, `${block.pairing} block claims adjacent stations "${a.station}" and "${b.station}" but they are in different zones ("${a.zone}" and "${b.zone}"). Adjacency is arm's reach, which is a fact about one place.`);
      }

      /* THE DEDUPE ABOVE IS WHY THIS KEPT PASSING, and he found it at the rack on 2026-08-28.
       *
       * HIS WORDS, note #27: "You are still making pairings of two machines lat pull down and overhead
       * triceps cable can't be done at the same time, could be straight arm pull down not sure why
       * this same thing keeps happening after all the audits."
       *
       * He is right about all three parts. `new Set` collapses two exercises on ONE station to a
       * single entry, so `stations.length > 1` can never fire on them and the block passes. Every
       * audit that checked this checked the station, and the stations matched. The rule read "at most
       * one station" and was silently enforcing "at most one station NAME".
       *
       * The comment above is correct about the bench and wrong as a generalisation. A bench is shared
       * without touching it: you lie on it for one exercise and put a foot on it for the other. A
       * cable column is not, because the attachment and the seat change between a lat pulldown and an
       * overhead tricep extension, so alternating means reconfiguring the machine every single set.
       * That is two exercises with setup in between, not a superset. The model had stations and no
       * concept of what has to be UNCLIPPED, so the two cases were indistinguishable.
       *
       * FAIL-CLOSED, and that is the whole design. `sharedInOneWindow` is declared per station in
       * equipment.json and defaults to false, so a station nobody has ruled on refuses rather than
       * permits. The safe-defaults rule in equipment.json's own header says a wrong "you can" costs a
       * session and a wrong "you cannot" costs a walk. Today exactly two stations are shareable, the
       * bench and the plyo box, and both carry the reason. Answering the open question on
       * cable-pulldown UNLOCKS pairings rather than removing them. */
      if (stations.length === 1 && a.station != null && b.station != null) {
        const st = stationOf(a.zone, a.station);
        if (!st?.sharedInOneWindow) {
          fail(where, `${block.pairing} block puts two exercises on "${a.station}" at once, and that station is not declared shareable. `
            + `Two exercises on ONE station is only a superset when neither has to reconfigure it: a bench is shared without touching it, a cable column is not. `
            + `Set sharedInOneWindow on that station in equipment.json WITH the reason, or make this block a sequence. `
            + `This rule exists because the check above deduped the two stations into one and passed, which is how a lat pulldown ended up paired with an overhead tricep extension on the same pulley (his note #27, 2026-08-28).`);
        }
      }

      if (a.zone !== b.zone) {
        fail(where, `${block.pairing} block spans two zones ("${a.zone}" and "${b.zone}"). Doing both in one window means walking back and forth between them every set.`);
      }

      /* ------ CAN THE PARTNER ACTUALLY FIT IN THE LEAD'S REST. Added 2026-08-31.
       *
       * `fill` means, in the programme's own words, "do the partner IN the lift rest gaps, it adds no
       * time". That is a claim with arithmetic behind it and nothing was checking the arithmetic.
       *
       * The 2026-08-31 candidate had two blocks where it was false by a factor of two: a calf raise
       * at 3x12 with 45s rest offers 135 seconds of gap, and a suitcase carry at 3x30s per side needs
       * 180 seconds of WORK alone, before any rest of its own. The labels were backwards, with the
       * 45-second-rest calf raise called the lead and the three-minute carry called the free partner.
       * At the machine that is not a superset, it is two exercises and a day that runs long.
       *
       * WORK ONLY, AND DELIBERATELY GENEROUS. Three seconds a rep, per-side doubled, timed sets at
       * their stated seconds, and zero credit taken for walking, picking up dumbbells, or the
       * partner's own inter-set rest. So a block that fails this is failing on the most favourable
       * reading available, which is the only kind of refusal worth having: a checker whose first real
       * finding is arguable is a checker nobody runs.
       *
       * A FAILING BLOCK IS NOT NECESSARILY WRONG, it is mislabelled. The fix is usually to swap lead
       * and partner so the long item owns the clock, or to declare the block a `sequence`, which is
       * exempt because a sequence never claimed to be free. */
      if (block.pairing === 'fill' && block.exercises.length === 2) {
        const restSeconds = (r) => {
          const m = /(\d+(?:\.\d+)?)\s*min/.exec(String(r));
          if (m) return Number(m[1]) * 60;
          const t = /(\d+)\s*s/.exec(String(r));
          if (t) return Number(t[1]);
          return 90;
        };
        const workSeconds = (ex) => {
          const reps = String(ex.reps ?? '');
          const n = parseInt(reps, 10);
          if (!Number.isFinite(n)) return (ex.sets || 0) * 30;
          const perSide = /\/(side|leg|arm)/.test(reps);
          const timed = /^\d+\s*s/.test(reps) || /s\/(side|leg|arm)/.test(reps) || ex.timed;
          const one = timed ? n : n * 3;
          return (ex.sets || 0) * one * (perSide ? 2 : 1);
        };
        const gap = (a.sets || 0) * restSeconds(a.rest);
        const need = workSeconds(b);
        if (need > gap) {
          fail(where, `${b.name} cannot fit in ${a.name}'s rest. The lead offers ${gap}s of gap across `
            + `${a.sets} sets at ${a.rest}; the partner needs ${need}s of WORK alone, before any rest of its own. `
            + `A "fill" block claims the partner adds no time and this one adds at least ${need - gap}s. `
            + `Swap the lead and the partner so the long item owns the clock, or make this a sequence.`);
        }
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

/* THE SWIM CHECKS LEFT THIS FILE on 2026-08-26 and are content/swim/validate.mjs, which the build
 * runs beside this one. They moved with their content: swim-standards.json, swim-teaching.json and
 * swim-coaching.json are content/swim/{standards,teaching,coaching}.json now, because swim stopped
 * being a tab on /gym/conditioning and became its own route.
 *
 * What went with them: the provenance rule on every tier, the tier-ordering check that caught the
 * 5 km parse bug, the safety-block requirement on the teaching handbook, and `checkGroundedCues`,
 * which is the "no sourced cue without a verbatim quote" rule he asked for in his own words.
 *
 * The planned-week check ABOVE stays here, deliberately. It reads week.assignedDays, and the swim
 * slot is still one of the things arranged across seven days: swim left the gym page, not the week.
 * src/lib/gym/week.ts still counts a swim toward the training streak for the same reason. */

/* ---------------------------------------------------------------------------------------------
 * EVERY {PEAK_*} PLACEHOLDER MUST BE ONE THE RENDERER KNOWS HOW TO FILL. Added 2026-08-28.
 *
 * WHY. Five rendered strings on /bike asserted "your highest recorded swim heart rate is 175". The
 * export's highest is higher and 23 of his last 60 swims beat 175; six tie at exactly 175, which is
 * where the number came from, so it was the most common ceiling rather than the ceiling. The worst
 * consequence was not credibility: the only stop rule anywhere in the week told him to abort an
 * interval above a heart rate he passes routinely, under a sentence claiming he had never recorded it.
 * Found by 12-run-bike B1 and verified against Neon before anything was changed.
 *
 * The figures are interpolated from the database now (`getPeakHr`, `src/lib/gym/hr-anchor.ts`), which
 * removes the stale-number class. It introduces a new one: a placeholder nobody wired up renders as
 * literal braces, in a stop rule, on a page he reads out of breath. So the two lists are COMPARED
 * rather than trusted, which is the same construction `scripts/lint-probe-routes.mjs` uses for write
 * routes and `scripts/lint-auth.mjs` for the cookie.
 *
 * This is in the validator and therefore in `pnpm build`, because it reads a content file and nothing
 * else. It needs no database, unlike `check-ladder.mjs`.
 * ------------------------------------------------------------------------------------------- */
{
  /* Kept in step with HR_PLACEHOLDERS in src/lib/gym/hr-anchor.ts. Reading the TS file for the list
     would couple a build gate to a module graph; naming them twice is acceptable only because the
     check below fails loudly on a mismatch in either direction, which is what a second copy has to
     earn. */
  const KNOWN = new Set(['{PEAK_BPM}', '{PEAK_DATE}', '{PEAK_KIND}']);
  const found = new Map();
  const walk = (node, path) => {
    if (typeof node === 'string') {
      for (const m of node.matchAll(/\{[A-Z][A-Z0-9_]*\}/g)) {
        if (!found.has(m[0])) found.set(m[0], path);
      }
      return;
    }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    }
  };
  walk(conditioning, 'conditioning');

  for (const [ph, where] of found) {
    if (KNOWN.has(ph)) continue;
    fail('conditioning.json', `${where} carries the placeholder ${ph}, which no renderer fills. `
      + 'It would print as literal braces on his phone. Add it to HR_PLACEHOLDERS and to `fill` in '
      + 'src/lib/gym/hr-anchor.ts, and to KNOWN in this check, or write the value out.');
  }

  /* THE OTHER DIRECTION, and it is the one that matters more. A placeholder the renderer supports and
     the content no longer uses means somebody retyped a figure back into a sentence that exists
     because a typed figure was wrong. That is exactly how 175 got there. */
  for (const ph of KNOWN) {
    if (found.has(ph)) continue;
    fail('conditioning.json', `nothing uses ${ph} any more. The renderer still fills it, so either a `
      + 'heart-rate figure has been typed back into the prose it was derived out of, or the '
      + 'placeholder is dead and should come out of src/lib/gym/hr-anchor.ts. Check which.');
  }
}

/* ---------------------------------------------------------------------------------------------
 * A SLOT MAY NOT DISAGREE WITH THE CATALOGUE ABOUT WHAT THE EXERCISE IS CALLED. Added 2026-08-28.
 *
 * The 2026-08-27 gate made a slot agree with the catalogue about WHERE an exercise is done. It said
 * nothing about the NAME, and the name is copied into every slot, so the two drifted while both
 * files kept reading correctly on their own.
 *
 * Found by renaming one variant. His note #26 that morning: "whatever history is on standing db has
 * always been seated, ive never done standing db". The catalogue became Seated DB Overhead Press and
 * the SLOT went on rendering Standing DB Overhead Press on the live page, because the slot copy is
 * what the card shows. Three more were already wrong: the calf raise slot says DB Standing Calf
 * Raise for a machine he works at 180 to 210 lb, which his own open question is about, and the
 * Copenhagen plank slot carried a qualifier its own cue explains far better than a name can.
 *
 * This is the inProgramme disease exactly. 103 variants carried a copied flag, nine were wrong the
 * day the file shipped, and the fix was to delete the copy and derive it. Every copy of a fact is a
 * fact that goes stale silently.
 *
 * THE BETTER FIX IS DELETION AND IT IS NOT DONE HERE. `ex.name` is read by GymClient, the log page
 * and coverage.mts, so removing it from the slots means teaching every consumer to resolve the name
 * from the catalogue. That is a cross-cutting change in a surface another session was editing on
 * 2026-08-28, and shipping a refactor inside a behaviour change is how the refactor gets read as a
 * no-op. Whoever picks it up: delete the key, resolve from movements.json, and turn this check into
 * the same refusal inProgramme gets.
 * ------------------------------------------------------------------------------------------- */
if (MOVEMENTS) {
  for (const [dayKey, day] of Object.entries(program.days)) {
    for (const nameBlock of day.blocks || []) {
      for (const ex of nameBlock.exercises || []) {
        if (!ex.name) continue;
        const v = MOVEMENTS[ex.id];
        if (!v) continue;   // an id the catalogue does not know is the placement gate's finding
        if (v.name === ex.name) continue;
        fail(
          dayKey + '/' + nameBlock.label,
          'slot "' + ex.id + '" is called ' + JSON.stringify(ex.name)
            + ' but movements.json calls it ' + JSON.stringify(v.name)
            + '. The CARD renders the slot copy, so that is what he reads at the rack while every'
            + ' tool and report reads the other one. The catalogue owns the name: make them match,'
            + ' or rename the variant if the catalogue is the one that is wrong.',
        );
      }
    }
  }
}

/* ---------------------------------------------------------------------------------------------
 * AN ALT MAY NOT RESOLVE TO THE SLOT ITSELF. Added 2026-08-28, and he found it at the rack.
 *
 * The calf raise card offered him about 5 lb for a machine he works at 180 to 210. His words:
 * "the calf raise thing I swapped to machine calf raise, so it was not DB calf raise."
 *
 * The slot is `standing-calf-raise` and one of its ALTS is `machine-calf-raise`, which movements.json
 * lists as an ALIAS of that same variant. So the alt offered him a choice between an exercise and
 * itself. Choosing it was not a swap in any real sense, but it wrote a different string into
 * gym_set.exercise_id, and the progression read only the slot id: twelve bodyweight sets at weight 0,
 * top weight zero, suggest the smallest step above it. The 210 lb from the previous evening sat in
 * the same table under the other name and no query asked for it.
 *
 * TWO FIXES AND THIS IS THE ONE THAT PREVENTS IT. src/lib/gym/equivalent-ids.ts makes every history
 * read resolve aliases, so the rows already in his log read correctly. This stops the shape being
 * expressible at all: an alt has to be a genuine alternative, and an alternative to itself is not one.
 *
 * AGENTS.md already carries the neighbouring rule from 2026-08-27: an alias means the same JOB, not
 * the same FIXTURE, and if the placement gate fires on an alias the answer is a new variant rather
 * than a changed slot. This is the case that rule did not cover, because here the alias is the same
 * job AND the same fixture, which makes it not an alias at all but a duplicate name.
 * ------------------------------------------------------------------------------------------- */
if (MOVEMENTS) {
  for (const [dayKey, day] of Object.entries(program.days)) {
    for (const altBlock of day.blocks || []) {
      for (const ex of altBlock.exercises || []) {
        const slotVariant = MOVEMENTS[ex.id];
        if (!slotVariant) continue;
        for (const alt of ex.alts || []) {
          const altVariant = MOVEMENTS[alt.id];
          if (!altVariant) continue;
          if (altVariant.id !== slotVariant.id) continue;
          fail(
            dayKey + '/' + altBlock.label,
            'slot "' + ex.id + '" offers "' + alt.id + '" as an alternative, and movements.json'
              + ' resolves both to the variant "' + slotVariant.id + '". That is a choice between an'
              + ' exercise and itself. Picking it writes a different exercise_id into gym_set while'
              + ' meaning the same movement, which splits the history and makes the weight suggestion'
              + ' read the wrong half: this is how the calf raise came to offer 5 lb for a machine he'
              + ' loads to 210. Drop the alt, or make it a genuinely different variant.',
          );
        }
      }
    }
  }
}

/* ---------------------------------------------------------------------------------------------
 * A CUE MAY NOT NAME AN IMPLEMENT THE CARD IS NOT. Added 2026-08-28 for 10-gym P1-7.
 *
 * The 2026-08-27 placement gate made a slot agree with the catalogue about WHERE an exercise is
 * done. Six slot ids were rewritten to sit at the right fixture, the gate went green, and SEVEN
 * CUES went on describing the old implement. He was standing at a cable column being told to cup
 * the end of a dumbbell like a mug.
 *
 * The sharpest one: Thursday's calf raise cue said the exercise "needs no fixture of its own"
 * above a slot declaring station calf-raise. That is the precise falsehood the placement gate was
 * built to make unrepresentable, and the handoff's own words for it were "The block passed because
 * the data lied". The FIELD was corrected and the identical claim survived in prose, where no gate
 * read it. Monday's said "NOT on the calf machine" while its own block why said "it is a machine
 * across the floor" and his ruling that morning was that it is the machine. Four statements about
 * one exercise and two of them wrong.
 *
 * SO THE CUE IS DATA TOO. It names an object, and which object is a fact the catalogue already
 * holds. This checks that one fact and nothing else: it says nothing about whether an instruction
 * is followable, which is his to judge and stays his.
 *
 * Only the OPENING of the cue is read, because that is where the setup sentence lives and because
 * a later mention is usually a contrast worth keeping ("heavier than a standing curl"). A rule that
 * fired on those would be turned off, and a checker nobody runs protects nothing.
 * ------------------------------------------------------------------------------------------- */
if (MOVEMENTS) {
  /* NOT "does this word appear", but "is this cue telling him to PICK ONE UP".
   *
   * The first version matched the bare nouns and got three out of three wrong on its first run, on
   * cues that are all correct: the lat pulldown says "bring the bar to your upper chest", which is
   * the lat bar; the assisted pull-up says "chin over the bar", which is the pull-up bar; and the
   * machine chest press says "so a tired chest does not have to balance dumbbells", which is a
   * CONTRAST explaining why it is the machine. A checker whose first new findings are all false is
   * one nobody runs, and this repo has now learned that three separate times in one day.
   *
   * So the patterns are CONSTRUCTIONS, not nouns. Every one of the seven real defects said the
   * implement was in his hands or was the thing being set up: "ONE dumbbell held in both hands",
   * "A dumbbell in each hand", "Done holding dumbbells", "The zed bar with the seat", "Bar touching
   * your legs". None of the correct cues does that about an implement it is not. A bar he pulls
   * toward his chest is not a bar he is holding as the load. */
  const NAMES = {
    dumbbell: /\b(?:a |one |the )?dumbbells?\b(?=[^.]{0,24}\b(?:in (?:each|both) hands?|held|holding|hanging|touching|by your sides?))|\bholding (?:a |one |the )?dumbbells?\b/i,
    barbell: /\b(?:the )?bar(?:bell)?\b(?=[^.]{0,20}\b(?:touching|stays|in your hands|on your back))|\bholding (?:the )?bar(?:bell)?\b/i,
    cable: /\b(?:a |the )?cables?\b(?=[^.]{0,20}\b(?:in (?:each|both) hands?|held|holding))/i,
    kettlebell: /\b(?:a |one |the )?kettlebells?\b(?=[^.]{0,24}\b(?:in (?:each|both) hands?|held|holding))/i,
    ez: /\b(?:the )?(?:zed|ez)[- ]bar\b/i,
  };
  const LENIENT = new Set([undefined, null, "bodyweight", "band", "none"]);

  for (const [dayKey, day] of Object.entries(program.days)) {
    for (const cueBlock of day.blocks || []) {
      for (const ex of cueBlock.exercises || []) {
        if (typeof ex.cue !== "string" || !ex.cue) continue;
        const v = MOVEMENTS[ex.id];
        if (!v || LENIENT.has(v.implement)) continue;
        const opening = ex.cue.slice(0, 240);
        for (const [implement, re] of Object.entries(NAMES)) {
          if (implement === v.implement) continue;
          /* A machine mention is fine on anything that DECLARES a station: he is standing at one. */
          if (implement === "machine" && ex.station) continue;
          if (!re.test(opening)) continue;
          fail(
            dayKey + "/" + cueBlock.label,
            "the cue on \"" + ex.id + "\" opens by naming a " + implement
              + " and movements.json says this exercise uses a " + v.implement
              + ". The cue is the one thing on the card that tells him what to pick up, and it is read"
              + " at the machine. Correct the noun, or give the slot the variant it actually is.",
          );
          break;
        }
      }
    }
  }
}

console.log(out.join('\n'));
console.log('-'.repeat(70));

console.log(`${Object.keys(program.days).length} days checked, the planned week checked against its rest rule, ${FAIL} failures`);
process.exit(FAIL ? 1 : 0);
