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

      const DAY_WORD = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lower a|lower b|upper a|upper b)/i;
      const sentences = block.why.split(/(?<=[.!?])\s+/);
      const absent = new Set();

      for (const sentence of sentences) {
        if (DAY_WORD.test(sentence.toLowerCase())) continue;               // a cross-reference, and it says so
        let remaining = sentence.toLowerCase();
        for (const n of named) {
          if (!remaining.includes(n)) continue;
          remaining = remaining.split(n).join(' ');           // longest name wins over its suffix
          if (![...present].some((pn) => pn.includes(n) || n.includes(pn))) absent.add(n);
        }
      }

      if (absent.size) {
        fail(where, `the block's "why" names ${[...absent].map((a) => `"${a}"`).join(', ')}, which ${absent.size === 1 ? 'is' : 'are'} not in this block and not marked as being on another day. Its exercises are: ${block.exercises.map((e) => e.name).join(', ')}. Remove the clause, or name the day it is actually on. A reason that describes something he cannot see on the card is a false statement about his own screen.`);
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
     * instead, which is the honest state: nobody has written down why it is there. */
    if (block.exercises.length >= 2) {
      const partner = block.exercises[block.exercises.length - 1];
      const clause = partner.whyHere;
      const open = Array.isArray(partner.open) ? partner.open : [];

      if (clause === undefined && !open.length) {
        fail(where, `partner "${partner.id}" has no "whyHere" and no "open" question. It sits at position 2 and every "why is this here" note he has written names a position-2 exercise. Either lift a verbatim span out of this block's "why" that explains this exercise, or, if the "why" does not explain it, record an open question on the exercise rather than inventing a reason.`);
      }
      if (clause !== undefined && open.length) {
        fail(where, `partner "${partner.id}" carries both a "whyHere" and an "open" question. One of them is stale: either the reason is written or it is not.`);
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
    for (const ex of block.exercises) {
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

console.log(out.join('\n'));
console.log('-'.repeat(70));

console.log(`${Object.keys(program.days).length} days checked, the planned week checked against its rest rule, ${FAIL} failures`);
process.exit(FAIL ? 1 : 0);
