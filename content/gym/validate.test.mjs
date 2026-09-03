/* REGRESSION SUITE FOR THE GATES IN validate.mjs.
 *
 * Written 2026-08-27 with the `whyHere` / `open` gates, because a gate that has only ever been seen
 * to pass has not been seen to work. Per ENGINEERING.md, a rule that does not execute is decoration,
 * and a check nobody has watched FAIL is in the same category: it may be matching nothing.
 *
 * Each case mutates a COPY of content/gym in a temp directory and runs the real validator against
 * it, so nothing here can touch the live programme. The five that came first are the five ways an
 * agent could quietly reintroduce the wall of text note #12 rejected.
 *
 *   node content/gym/validate.test.mjs
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

/* What a partner IS, in one place: the LAST exercise of the block. The `blockBy(day, label)` helper
 * that used to sit here went with the named anchors below, unused: nothing addresses a block by name
 * any more, and a lookup helper kept for nobody is an invitation to start again. */
const partnerOf = (block) => block.exercises[block.exercises.length - 1];

/** The real movement catalogue, flattened by id and alias, so a case can ask "does the catalogue put
 *  this at a fixture?" instead of naming an exercise that a rebuild may move. Read from the repo
 *  rather than from the temp copy: the cases that use it mutate program.json, never this. */
const CATALOGUE = () => {
  const cat = JSON.parse(readFileSync(join(HERE, 'movements.json'), 'utf8'));
  const out = {};
  for (const m of Object.values(cat.movements)) {
    for (const v of m.variants) {
      out[v.id] = v;
      for (const a of v.aliases ?? []) out[a] = v;
    }
  }
  return out;
};

/* THE ANCHORS ARE FOUND, NOT NAMED, AND THAT IS THE THIRD LESSON THIS BLOCK HAS LEARNED.
 *
 * First it addressed blocks by INDEX, and inserting the Upper A primer at position 0 on 2026-08-27
 * shifted every Tuesday index by one. So it moved to labels. Then the 2026-08-27 rebuild left two
 * labelled blocks holding a single exercise, `partnerOf` returned the lead lift, and five cases
 * silently stopped testing anything while still printing ok. So `assertAnchor` was added to make
 * that loud. Then on 2026-08-28 seven block labels were renamed, one of them the OPEN_BLOCK anchor,
 * and the whole suite died on its first case with a stale string.
 *
 * A hand-edited content file has no stable address. Not an index, not a label. So the anchors are
 * now DESCRIBED by what the case needs and located at run time:
 *
 *   spanBlock  a paired block whose partner carries a `whyHere`
 *   openBlock  a paired block whose partner carries an `open` question
 *
 * The programme always has several of each, and if it ever has none the finder throws with the
 * requirement in the message, which is the same loud failure `assertAnchor` bought, without a
 * fixture to maintain. */
const findBlock = (program, needs) => {
  const b = Object.values(program.days || {})
    .flatMap((d) => d.blocks || [])
    .find((x) => (x.exercises || []).length >= 2 && partnerOf(x)?.[needs]);
  if (!b) {
    throw new Error(
      `no paired block in the programme has a partner carrying "${needs}". Either the programme `
      + 'changed shape or the gate under test no longer applies; do not "fix" this by weakening the case.',
    );
  }
  return b;
};
const spanBlock = (p) => findBlock(p, 'whyHere');

/* TWO ANCHORS WHERE THERE WAS ONE, and the suite told me so by dying rather than by passing.
 *
 * `openBlock` found a paired block whose PARTNER carries an `open` question, and every case that
 * needed any open row at all borrowed it. On 2026-08-30 fifteen questions were deleted at once (six
 * of them cue questions he refused to answer, correctly: "why are you asking me this? you are the
 * one that should find out") and no partner carried one any more. The finder threw with its own
 * instruction not to weaken the case, which is the second time that guard has earned its place.
 *
 * The right fix is not one anchor, it is two, because the cases were testing two different things:
 *
 *   anyOpenExercise  the SHAPE of an `open` row: topic, question mark, dates. Nothing about that is
 *                    specific to a partner, and pinning it to one was always incidental.
 *   partnerWithOpen  the PARTNER SEMANTICS: whether a question about the cue can stand in for a
 *                    written reason. That genuinely needs a partner carrying a question, so when the
 *                    programme has none the case BUILDS one rather than hunting for one. A gate is
 *                    being tested here, not the current contents of the file. */
const anyOpenExercise = (p) => {
  const all = Object.values(p.days || {})
    .flatMap((d) => d.blocks || [])
    .flatMap((b) => b.exercises || []);
  const ex = all.find((e) => Array.isArray(e.open) && e.open.length);
  if (ex) return ex;
  /* IT BUILDS THE SHAPE WHEN THE WEEK NO LONGER HAS ONE, added 2026-09-03, and that is the same
   * move `partnerWithOpen` and the shareable-station helper above already make. This threw instead
   * until today, and the day it fired was the day the last three exercise-level questions in
   * program.json were ANSWERED: he ruled on the pull-up bar, the knee raises and the dip, the rows
   * came out because a question with an answer is not open any more, and six shape cases died with
   * "park a question or repoint this" on a programme that is not wrong. **Answering his questions
   * must never be what turns the suite red.** The gate is what is under test, not the current
   * contents of the file, and a fixture the suite builds cannot be emptied by a ruling. */
  const host = all.find((e) => e && e.id);
  if (!host) throw new Error('the programme has no exercises at all, which is not a case this suite can repair');
  host.open = [{ q: 'A parked question, built by the suite because the week no longer carries one. Does it still validate?', asked: '2026-01-01', due: '2026-12-31', topic: 'equipment' }];
  return host;
};

/** A concurrent block whose two exercises sit on ONE station the equipment file declares shareable,
 *  read out of the real files rather than fabricated. Both halves of the shareable-station rule use
 *  it: one asserts this shape validates, the next withdraws the permission and requires a refusal.
 *  Reads the CATALOGUE station, not the slot's, because the placement gate already forces those to
 *  agree and the catalogue is the thing a mutation cannot quietly contradict.
 *
 *  IT BUILDS THE SHAPE WHEN THE WEEK NO LONGER HAS ONE, added 2026-09-01, and that is the same move
 *  `partnerWithOpen` above already makes. The programme had exactly one shareable-station pair, the
 *  split squat with the dumbbell bench press on one bench. He then read the live card and said the
 *  blocks led by accessories were "not actual lifts"; the fix pairs each of the week's 17 station
 *  lifts with one accessory, which is what made every block compound-led, and that pairing was the
 *  casualty. Both cases died with "repoint this case" on a programme that is not wrong.
 *
 *  WHAT IS UNDER TEST IS THE GATE, NOT THE CURRENT CONTENTS OF THE FILE. A rule that can only be
 *  exercised while some unrelated block happens to survive is a rule that goes untested the first
 *  time a programme changes shape, which is exactly what happened here. */
const sharedStationBlock = (p) => {
  const cat = JSON.parse(readFileSync(join(HERE, 'movements.json'), 'utf8'));
  const equip = JSON.parse(readFileSync(join(HERE, 'equipment.json'), 'utf8'));
  const place = new Map();
  for (const m of Object.values(cat.movements)) {
    for (const v of m.variants) {
      place.set(v.id, { zone: v.zone, station: v.station });
      for (const a of v.aliases ?? []) place.set(a, { zone: v.zone, station: v.station });
    }
  }
  const shareable = (zone, station) => Boolean(equip.zones?.[zone]?.stations?.[station]?.sharedInOneWindow);
  const found = Object.values(p.days || {})
    .flatMap((d) => d.blocks || [])
    .find((b) => {
      if (!['fill', 'alternate'].includes(b.pairing) || (b.exercises || []).length !== 2) return false;
      const [a, c] = b.exercises.map((e) => place.get(e.id));
      if (!a || !c || !a.station) return false;
      return a.zone === c.zone && a.station === c.station && shareable(a.zone, a.station);
    });
  if (found) return found;

  /* Nothing in the week has the shape, so build it. The pair is DERIVED rather than named: any two
     catalogue variants on one shareable station will do, and hardcoding two ids is how every other
     fixture in this file went stale. It still throws if the gym has no shareable station at all,
     because then the rule genuinely cannot be exercised and somebody has to know. */
  const primaries = new Map();
  for (const m of Object.values(cat.movements)) {
    for (const v of m.variants) primaries.set(v.id, v.primary ?? m.primary ?? []);
  }
  const onShareable = [];
  for (const [id, where] of place) {
    if (where.station && shareable(where.zone, where.station)) onShareable.push({ id, ...where });
  }
  /* THE DERIVED PAIR MUST ALSO SATISFY ZHANG, and the first run of this did not: it picked the split
     squat and the DB step-up, which are both quads and glutes, so the fixture tripped the
     shared-muscle gate and reported that correct refusal as a failure of the shareable-station rule.
     A fixture that has to be legal in every other respect has to be built that way on purpose. */
  let pair = null; let other = null;
  for (const a of onShareable) {
    const hit = onShareable.find((b) => b.id !== a.id && b.zone === a.zone && b.station === a.station
      && !(primaries.get(b.id) ?? []).some((mu) => (primaries.get(a.id) ?? []).includes(mu)));
    if (hit) { pair = a; other = hit; break; }
  }
  if (!pair || !other) {
    throw new Error('no two catalogue variants share one shareable station without sharing a muscle, so the shareable-station rule cannot be exercised at all. Do not weaken the case: check equipment.json still declares a shareable station.');
  }
  return rebuildBlockAs(p, pair.id, other.id);
};

/** Replace a two-exercise block's exercises with slots built from the CATALOGUE, and rewrite the
 *  block's `why` and the partner's `whyHere` so they stay consistent with the new names.
 *
 *  THIS EXISTS BECAUSE THE ALTERNATIVE CASCADED. The adjacency cases used to move a partner onto
 *  another station in program.json AND move its variant in movements.json, then walk the whole week
 *  moving every other slot holding that id so nothing disagreed with the catalogue. On 2026-08-31 the
 *  rebuilt week put that partner in two blocks whose leads are in different zones, so the cascade
 *  dragged one of them across the gym and the ZONE rule refused it: the case reported a failure of
 *  the adjacency rule that was actually the walking-route rule doing its job. Replacing a block's
 *  contents touches one block, needs no second file, and cannot reach any other day. */
const rebuildBlockAs = (p, leadId, partnerId) => {
  const cat = CATALOGUE();
  /* The OWNING DAY is tracked now, not just the block, because the warmup belongs to the day and
     has to stay consistent with what this helper puts at the front of it. See the warmup note at
     the bottom of this function. */
  let owner = null;
  let block = null;
  for (const d of Object.values(p.days || {})) {
    const hit = (d.blocks || []).find((b) => (b.exercises || []).length === 2);
    if (hit) { owner = d; block = hit; break; }
  }
  if (!block) throw new Error('no two-exercise block at all; repoint this case');
  const slot = (id, sets, reps, rest) => {
    const v = cat[id];
    if (!v) throw new Error(`${id} is not in movements.json; repoint this case`);
    return {
      id, name: v.name, sets, reps, rest, log: true,
      zone: v.zone, station: v.station,
      /* A LOGGED SLOT MUST DECLARE HOW IT PROGRESSES. Another gate says so, and correctly: the number
         he types has to be able to mean something next week. The helper's first run omitted it. */
      progression: v.progression ?? 'weight',
      cue: v.cue ?? 'Placeholder cue parked by the regression suite, long enough to read as a sentence.',
    };
  };
  const lead = slot(leadId, 3, '8', '2 min');
  const partner = slot(partnerId, 3, '10', '45s');
  /* A NEUTRAL CLAUSE. This said "because the <lead> does not use it" until 2026-09-01, and the
     false-absence gate added that day caught it immediately: the helper picked lat-pulldown plus
     cable-reverse-fly, which share the rear delts, so the fixture itself asserted something the
     catalogue contradicts. A helper that builds a block has no business claiming anatomy. */
  const clause = `${partner.name} goes in the rest, put there by the regression suite.`;
  partner.whyHere = clause;
  block.pairing = 'fill';
  block.exercises = [lead, partner];
  block.why = `Built by the regression suite to place two named fixtures in one rest window. ${clause}`;
  /* THE TAG MOVES WITH THE EXERCISES. A separate gate refuses a tag naming kit no exercise in the
     block uses, and the first run of this helper landed on Monday's squat block, whose tag reads
     "(rack, dumbbells in hand)": it reported that correct refusal as a failure of the adjacency
     rule. A helper that replaces a block's contents has to replace everything that describes them.
     THE TAG IS NOW DELETED RATHER THAN REBUILT, fixed 2026-09-01. It was `(${lead.zone})`, which
     happened to be legal for the zones this helper had been used on and is not a general truth:
     `benchDb` is not a word TAG_EQUIPMENT or TAG_PROSE knows, so the moment a case derived a bench
     pair the fixture failed on its own tag. A tag is optional and a synthetic block has no kit to
     announce, so the honest value is none. */
  block.label = 'Suite Pair';
  delete block.tag;
  /* AND SO DOES THE WARMUP, added 2026-09-02 with the gate that made it matter. A day's warmup has
     to prepare whatever it OPENS with, and this helper can put a new lift at the front of the day.
     It landed a split squat at the head of a session warmed up for the upper body and the new gate
     refused it correctly, which the case above then reported as a failure of the shareable-station
     rule. Third time this helper has had to learn the same lesson: replacing a block's contents
     means replacing everything that describes them. */
  const firstWorking = (owner?.blocks || []).find((b) => b.role !== 'primer' && (b.exercises || []).length);
  if (owner && firstWorking === block) {
    /* CATALOGUE() returns the bare VARIANT, and most variants carry no muscle list of their own:
       they inherit the group's. Reading `cat[leadId].primary` got undefined for the split squat and
       the warmup was set to "upper" for a leg exercise, which is the same bug in the fixture that
       the gate had just caught in the programme. Resolve the group fallback the way every other
       reader of this catalogue does. */
    const raw = JSON.parse(readFileSync(join(HERE, 'movements.json'), 'utf8'));
    let leadPrimary = [];
    for (const m of Object.values(raw.movements)) {
      const v = m.variants.find((x) => x.id === leadId || (x.aliases ?? []).includes(leadId));
      if (v) { leadPrimary = v.primary ?? m.primary ?? []; break; }
    }
    const LOWER = ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'];
    owner.warmup = leadPrimary.some((m) => LOWER.includes(m)) ? 'lower' : 'upper';
  }
  return block;
};

/** A two-exercise block turned into a `sequence`, built rather than hunted for.
 *
 *  THE WEEK HAS NO SEQUENCE BLOCK as of the 2026-08-31 rebuild: every block is a `fill` pair, which
 *  is the honest shape when the partner rides in the lead's rest. Both sequence cases used to hunt
 *  for one and died with "repoint this case" when it went. What they test is the LABEL rules on a
 *  sequence, and a sequence is one field. */
const asSequence = (p) => {
  const b = Object.values(p.days || {}).flatMap((d) => d.blocks || [])
    .find((x) => (x.exercises || []).length === 2);
  if (!b) throw new Error('no two-exercise block to turn into a sequence; repoint this case');
  b.pairing = 'sequence';
  /* A sequence's partner is done in turn, not in the rest, so the pair `why` would be a false
     statement about the new shape. Both cases assert on the LABEL, so the reason is neutralised. */
  const partner = partnerOf(b);
  const clause = `${partner.name} is done after the ${b.exercises[0].name}.`;
  partner.whyHere = clause;
  b.why = `Built by the regression suite as a sequence. ${clause}`;
  return b;
};

/** An exercise that appears on exactly ONE day, that day's key, and a day it is NOT on. This is
 *  what a block `why` on `hostDay` needs in order to make a cross-reference that is true, and the
 *  same three facts make one that is false. Derived, because naming an exercise goes stale: both
 *  cross-reference cases named the Copenhagen Plank until the 2026-08-31 rebuild removed it.
 *
 *  `hostDay` is EXCLUDED from being the home day, which the first version did not do. If the chosen
 *  exercise lived on the very day the clause is written on, the false case named some other day and
 *  the gate said nothing, because the exercise was right there in the week where the sentence sat.
 *
 *  AND `absentDay` MUST BE ABSENT THE WAY THE VALIDATOR MEANS IT, which is the third time this
 *  helper has been wrong about the same clause. The gate's `namesOn(day)` reads the slot names AND
 *  every ALT name on that day, because a `why` naming an exercise he can reach with one tap on that
 *  card is a true sentence. This helper only ever looked at slots. On 2026-09-01 it picked the Lat
 *  Pulldown, whose home is Tuesday, and offered Thursday as the absent day while Thursday's row
 *  carries the Lat Pulldown as an alt: the validator correctly permitted the clause and the case
 *  that asserts a REFUSAL failed. The fixture was stale, not the gate. So the absent day is now
 *  checked against the same name set the gate builds, by the same substring rule. */
const crossDayReference = (p, hostDay) => {
  const stripImplement = (n) => n
    .replace(/^(db|bb|ez bar|ez|cable|machine|smith|kb|barbell|dumbbell|single-leg|seated|standing|incline|assisted)\s+/i, '')
    .trim();
  /** Every name a `why` on this day may legally mention: slots and their alts, stripped and not. */
  const namesOn = (dayKey) => {
    const s = new Set();
    for (const b of p.days?.[dayKey]?.blocks ?? []) {
      for (const e of b.exercises ?? []) {
        for (const nm of [e.name, ...(e.alts ?? []).map((a) => a.name)].filter(Boolean)) {
          s.add(String(nm).toLowerCase());
          s.add(stripImplement(String(nm).toLowerCase()));
        }
      }
    }
    return s;
  };
  const days = new Map();
  for (const [k, d] of Object.entries(p.days || {})) {
    for (const b of d.blocks || []) {
      for (const e of b.exercises || []) {
        if (!days.has(e.name)) days.set(e.name, new Set());
        days.get(e.name).add(k);
      }
    }
  }
  for (const [name, on] of days) {
    if (on.size !== 1) continue;
    const homeDay = [...on][0];
    if (homeDay === hostDay) continue;
    const low = name.toLowerCase();
    const absentDay = Object.keys(p.days).find((k) => k !== homeDay && k !== hostDay
      && ![...namesOn(k)].some((pn) => pn.includes(low) || low.includes(pn)));
    if (!absentDay) continue;
    return { name, homeDay, absentDay };
  }
  throw new Error(`no exercise sits on exactly one day other than ${hostDay} while being absent, alts included, from a third day, so neither cross-reference case can be built; repoint them`);
};

/** A paired block whose partner carries an open question, creating one if the file has none. */
const partnerWithOpen = (p, topic = 'placement') => {
  const blk = Object.values(p.days || {})
    .flatMap((d) => d.blocks || [])
    .find((b) => (b.exercises || []).length >= 2);
  if (!blk) throw new Error('no paired block at all; repoint this case');
  const partner = partnerOf(blk);
  partner.open = [{
    topic,
    q: 'A question long enough to clear the thirty-character floor, parked by the test suite itself?',
    asked: '2026-08-01',
    due: '2026-09-30',
  }];
  return blk;
};

/** Scratch shared between a case's `mutate` and its `also.mutate`, which run on two different files
 *  and cannot otherwise agree on which exercise the case picked. Set in `mutate`, read in `also`.
 *  One case uses it; it exists because the alternative is naming an exercise, and every hardcoded
 *  name in this file has gone stale at least once. */
const TEST_STATE = {};

/** `file` names which content file the case mutates, and defaults to program.json. Added when the
 *  validator learned a rule about movements.json: a suite that can only mutate one file can only
 *  test the gates on one file, and the untested gate is the one that quietly matches nothing.
 *  @type {{name: string, file?: string, mutate: (p: any) => void, expect: string | null}[]} */
const CASES = [
  {
    name: 'unmodified programme passes',
    mutate: () => {},
    expect: null,
  },
  {
    name: 'agent prose in whyHere is refused',
    mutate: (p) => {
      partnerOf(spanBlock(p)).whyHere =
        'Side delts are important for shoulder health and balanced development.';
    },
    expect: 'NOT a verbatim span',
  },
  {
    name: 'a true span with a different first-character case is allowed',
    mutate: (p) => {
      // DERIVED from the anchor's own `why`, never a typed sentence. The hardcoded version of this
      // line was a true span of a block that stopped existing on 2026-08-27, and it then tested
      // nothing except that the validator still rejects strings. Take a real span and flip its
      // first character's case, which is exactly the tolerance under test.
      const b = spanBlock(p);
      const span = b.why.slice(0, 60);
      const flipped = (span[0] === span[0].toUpperCase() ? span[0].toLowerCase() : span[0].toUpperCase()) + span.slice(1);
      partnerOf(b).whyHere = flipped;
    },
    expect: null,
  },
  {
    name: 'a span from ANOTHER block is refused',
    mutate: (p) => {
      /* The donor block is FOUND, not named. Naming it hardcoded "Sideways + Calves", which was
       * renamed on 2026-08-27 and took the whole suite down with it. Any block with a `why` that is
       * not the anchor will do, and there are always several. */
      const anchor = spanBlock(p);
      const donor = Object.values(p.days)
        .flatMap((d) => d.blocks || [])
        .find((b) => b !== anchor && typeof b.why === 'string' && b.why.length >= 60);
      if (!donor) throw new Error('no other block carries a why long enough to borrow from');
      partnerOf(anchor).whyHere = donor.why.slice(0, 60);
    },
    expect: 'NOT a verbatim span',
  },
  {
    name: 'a partner with neither whyHere nor a placement question is refused',
    mutate: (p) => {
      delete partnerOf(spanBlock(p)).whyHere;
    },
    expect: 'no open question with topic "placement"',
  },
  {
    name: 'whyHere on a lead lift is refused',
    mutate: (p) => {
      spanBlock(p).exercises[0].whyHere =
        'The second vertical pull. Lat Pulldown on Tuesday was the only one in the week';
    },
    expect: 'which is a lead lift',
  },
  {
    /* THE PERMITTED DIRECTION FOR `topic`, and the reason the field exists. This case asserted the
     * OPPOSITE until 2026-08-29: a partner carrying both a written reason and an open question was
     * refused, on the theory that "either the reason is written or it is not". Tuesday's overhead
     * extension is both at once, and so is the lateral raise with a progression question on it. The
     * old rule forced the reason off the card, and the card then said "No reason recorded yet" with
     * the reason one tap above it. A gate that pushes true information off the screen is worse than
     * the state it was refusing. */
    name: 'a whyHere plus a question about something OTHER than placement is allowed',
    mutate: (p) => {
      const blk = partnerWithOpen(p);
      const partner = partnerOf(blk);
      partner.whyHere = blk.why.slice(0, 60);
      partner.open.forEach((q) => { q.topic = 'cue'; });
    },
    expect: null,
  },
  {
    name: 'a partner whose only question is about its cue still needs a whyHere',
    mutate: (p) => {
      const blk = partnerWithOpen(p);
      const partner = partnerOf(blk);
      delete partner.whyHere;
      partner.open.forEach((q) => { q.topic = 'cue'; });
    },
    expect: 'no open question with topic "placement"',
  },
  {
    /* THE THREE STATEMENTS PARKED IN A QUESTION SLOT, made unrepresentable. All three were true
     * station facts and none asked him anything, and gym-notes.mjs printed all three to him under a
     * heading promising questions, each with a due date. */
    name: 'an open question that does not end in a question mark is refused',
    mutate: (p) => {
      const q = anyOpenExercise(p).open[0];
      q.q = q.q.replace(/\?\s*$/, '.');
      if (/\?\s*$/.test(q.q)) throw new Error('anchor question did not end in a question mark; the gate under test is already unmet');
    },
    expect: 'does not end in a question mark',
  },
  {
    /* His words, 2026-08-30, from the gym: "these questions are wañls of text, are them simple and
     * to the point". The four live rows were 1362, 919, 569 and 538 characters. */
    name: 'an open question that is a wall of text is refused',
    mutate: (p) => {
      const q = anyOpenExercise(p).open[0];
      q.q = `${'Context he did not ask for. '.repeat(20)}Which?`;
    },
    expect: 'the ceiling is 400',
  },
  {
    name: 'a short question is still allowed, which is the point of the ceiling',
    mutate: (p) => {
      const q = anyOpenExercise(p).open[0];
      q.q = 'Do you want the hanging knee raise in this rest, or should the gap stay empty?';
    },
    expect: null,
  },
  {
    /* His words, 2026-09-03, on questions that were ALL under the 400 ceiling: "rephrase teb
     * questions I have no odea what it all means". Length was never the defect. Every one was
     * written in this repo's vocabulary rather than in his, which is invisible to the writer by
     * construction and therefore cannot be caught by re-reading. It was not: these four were
     * re-read, shortened and shipped three times. */
    name: 'an open question written in this repo\'s vocabulary is refused',
    mutate: (p) => {
      const q = anyOpenExercise(p).open[0];
      q.q = 'Triceps sit on the floor of 4 direct sets a week, so the dip has to come in set for set. Do you want it?';
    },
    expect: 'understands and he does not',
  },
  {
    /* THE OTHER DIRECTION, and it is the half that matters more here. A banned-word list is the
     * cheapest possible check to write and the easiest to make over-broad, and an over-broad one
     * fires on good questions until somebody deletes it. The first draft of the `floor` row listed
     * `the floor of` and flagged this sentence, which is a fine question about the floor of a room.
     * Precision over recall: a checker whose first live finding is wrong teaches people to dismiss
     * it, which is the 2026-08-26 bare-path lesson. */
    name: 'a plain question using a banned word in its ordinary sense is allowed',
    mutate: (p) => {
      const q = anyOpenExercise(p).open[0];
      q.q = 'Does the mat reach the floor of the squat rack area, or do your heels come off the floor at the bottom?';
    },
    expect: null,
  },
  {
    name: 'an open question with an unknown topic is refused',
    mutate: (p) => {
      anyOpenExercise(p).open[0].topic = 'general';
    },
    expect: '"topic" must be one of',
  },
  {
    name: 'an open question with no topic at all is refused',
    mutate: (p) => {
      delete anyOpenExercise(p).open[0].topic;
    },
    expect: '"topic" must be one of',
  },
  {
    /* equipment.json's `open` rows were checked by NOTHING until 2026-08-29, and one sat there for
     * two days asserting a premise the same file had already falsified. A gate on one of the two
     * files this feature lives in is a gate on half the feature. */
    name: 'a station question that is a statement is refused',
    file: 'equipment.json',
    mutate: (e) => {
      /* BUILT, not found. The only live station question was answered on 2026-08-30, and a
         case that hunts for one then fails is testing the contents of the file rather than the gate. */
      const station = Object.values(e.zones).flatMap((z) => Object.values(z.stations || {}))[0];
      if (!station) throw new Error('no stations at all; repoint this case');
      station.open = [{ topic: 'equipment', q: 'A question long enough to clear the thirty-character floor, parked by the suite?', asked: '2026-08-01', due: '2026-09-30' }];
      station.open[0].q = station.open[0].q.replace(/\?\s*$/, '.');
    },
    expect: 'does not end in a question mark',
  },
  {
    /* An alias written in the wrong field. `formerIds` says "this id is dead and its rows are
     * stranded"; if the id is still live the two are either one movement, which is an alias in
     * movements.json and merges the histories, or two movements, which are two histories. */
    /* BOTH formerIds CASES BUILD THEIR OWN FIXTURE, and did not until 2026-08-31. They used to hunt
       the live programme for a slot that already carried `formerIds` and throw "repoint this case"
       when none did. Three slots carried it; the whole-week rebuild the same day carries none, and
       correctly so, because the one id whose history was being forwarded (the DB overhead tricep
       extension, 6 rows) is now prescribed under its own id and nothing is stranded. Both cases then
       broke, and neither rule had changed. That is the fixture problem this file's own runner comment
       already names, and the fix is the same one: a regression case must not depend on what the
       production programme happens to contain today. */
    name: 'a formerId that is still a live id is refused',
    mutate: (p) => {
      const all = Object.values(p.days).flatMap((d) => d.blocks || []).flatMap((b) => b.exercises || []);
      const target = all[0];
      const other = all.find((e) => e.id !== target.id);
      if (!other) throw new Error('the programme has only one exercise; repoint this case');
      target.formerIds = [other.id];
    },
    expect: 'STILL a live id',
  },
  {
    name: 'a formerId naming the slot itself is refused',
    mutate: (p) => {
      const target = Object.values(p.days).flatMap((d) => d.blocks || [])
        .flatMap((b) => b.exercises || [])[0];
      target.formerIds = [target.id];
    },
    expect: "the slot's own id",
  },
  {
    name: 'an emptied formerIds is refused rather than ignored',
    mutate: (p) => {
      /* Builds its own fixture, for the reason written on the first formerIds case above. */
      const target = Object.values(p.days).flatMap((d) => d.blocks || [])
        .flatMap((b) => b.exercises || [])[0];
      target.formerIds = [];
    },
    expect: 'non-empty array',
  },
  {
    /* THE ORDER IS THE DATA. Both readers take the first entry above the working weight, so a rung
     * inserted in the wrong place returns a wrong dumbbell on a card and throws nowhere. */
    name: 'an out-of-order dumbbell ladder is refused',
    file: 'equipment.json',
    mutate: (e) => {
      const l = e.portable.dumbbells.ladderLb;
      if (!Array.isArray(l) || l.length < 3) throw new Error('no dumbbell ladder to mutate; repoint this case');
      [l[1], l[2]] = [l[2], l[1]];
    },
    expect: 'strictly ascending',
  },
  {
    name: 'a duplicated rung is refused, because ascending means strictly',
    file: 'equipment.json',
    mutate: (e) => {
      const l = e.portable.dumbbells.ladderLb;
      l[2] = l[1];
    },
    expect: 'strictly ascending',
  },
  {
    name: 'a ladder claiming a weight heavier than the rack holds is refused',
    file: 'equipment.json',
    mutate: (e) => {
      const d = e.portable.dumbbells;
      d.ladderLb = [...d.ladderLb, Number(d.range.maxLb) + 5];
    },
    expect: 'tops out at',
  },
  {
    name: 'a ladder with no provenance is refused',
    file: 'equipment.json',
    mutate: (e) => {
      delete e.portable.dumbbells.ladderConfidence;
    },
    expect: '"ladderConfidence" must be one of',
  },
  {
    name: 'a station question with a bad due date is refused',
    file: 'equipment.json',
    mutate: (e) => {
      /* BUILT, not found. The only live station question was answered on 2026-08-30, and a
         case that hunts for one then fails is testing the contents of the file rather than the gate. */
      const station = Object.values(e.zones).flatMap((z) => Object.values(z.stations || {}))[0];
      if (!station) throw new Error('no stations at all; repoint this case');
      station.open = [{ topic: 'equipment', q: 'A question long enough to clear the thirty-character floor, parked by the suite?', asked: '2026-08-01', due: '2026-09-30' }];
      station.open[0].due = 'next week';
    },
    expect: '"due" must be YYYY-MM-DD',
  },
  {
    name: 'an open question due before it was asked is refused',
    mutate: (p) => {
      /* THE DATE IS DERIVED FROM THE ROW, not typed. This case said `due = '2026-08-01'` until
       * 2026-09-03, which only put `due` before `asked` while every live question happened to have
       * been asked in late August. The day the suite started building its own fixture, `asked`
       * became a date before that literal and the case passed a programme it was meant to refuse:
       * it reported ok on the wrong thing rather than failing loudly. Same class as the block
       * labels and indices this file already stopped hardcoding, and the same class as the four
       * date columns in the swim data: a literal that is only correct relative to something it
       * does not read. One day before whatever the row says is unconditional. */
      const q = anyOpenExercise(p).open[0];
      const before = new Date(Date.parse(q.asked) - 86400000).toISOString().slice(0, 10);
      q.due = before;
    },
    expect: 'is not after "asked"',
  },
  {
    name: 'an open question with no context is refused',
    mutate: (p) => {
      anyOpenExercise(p).open[0].q = 'why is this here';
    },
    expect: 'at least 30 characters',
  },
  {
    name: 'an emptied open array is refused rather than ignored',
    mutate: (p) => {
      anyOpenExercise(p).open = [];
    },
    expect: 'non-empty array',
  },
  {
    /* THURSDAY'S CALF RAISE, in one line. It carried `station: null` while movements.json correctly
     * placed it on the calf machine, and that null was the only reason a leg-curl-machine plus
     * calf-machine block passed the one-station rule. The block passed because the data lied.
     *
     * Found generically rather than by name: any exercise the catalogue puts at a fixture will do,
     * so this case does not go stale the way a hardcoded block label does. */
    name: 'a slot that hides its fixture with station null is refused',
    mutate: (p) => {
      const cat = CATALOGUE();
      for (const d of Object.values(p.days)) {
        for (const b of d.blocks || []) {
          for (const e of b.exercises) {
            if (cat[e.id] && cat[e.id].station != null && e.station != null) {
              e.station = null;
              return;
            }
          }
        }
      }
      throw new Error('no exercise in the programme holds a fixture; repoint this case');
    },
    expect: 'movements.json says',
  },
  {
    name: 'a slot that invents a fixture the catalogue does not know is refused',
    mutate: (p) => {
      const cat = CATALOGUE();
      for (const d of Object.values(p.days)) {
        for (const b of d.blocks || []) {
          for (const e of b.exercises) {
            if (cat[e.id] && cat[e.id].station == null && e.station == null) {
              /* `bench` rather than an invented name, because an unknown station is already refused
                 by the equipment check one branch earlier and would test that instead of this. */
              e.station = 'bench';
              e.zone = 'benchDb';
              return;
            }
          }
        }
      }
      throw new Error('no exercise in the programme holds nothing; repoint this case');
    },
    expect: 'holds no fixture',
  },
  {
    /* The nine stale `inProgramme` flags of 2026-08-27, made unrepresentable. Deleting them from
     * movements.json fixed the instances; this asserts the class cannot come back, which is the only
     * part of that fix that survives the next author who wants a convenient boolean. */
    name: 'a restated inProgramme flag in the catalogue is refused',
    file: 'movements.json',
    mutate: (cat) => {
      const first = Object.values(cat.movements)[0];
      if (!first?.variants?.length) throw new Error('movements.json has no variants to mutate');
      first.variants[0].inProgramme = true;
    },
    expect: 'derived and must not be stored',
  },
  {
    name: 'two exercises on one non-shareable station in a fill block is refused',
    mutate: (p) => {
      /* HIS NOTE #27, 2026-08-28, made mechanical. The old rule deduped the two stations into one
         entry and could never fire on this shape, which is why three blocks like it were live and
         why he asked "why does this same thing keep happening after all the audits". Built from a
         real block rather than typed: take any concurrent pair whose lead holds a cable station and
         put the partner on the same one. */
      /* REPOINTED 2026-09-02, exactly as the line below it told the next person to do. This looked
         for a concurrent block led from the CABLE zone, and on 2026-09-02 the last one became a
         sequence: the lat pulldown and the new cable crunch hang off the same pulley and the
         attachment changes between them, which is what a sequence is. The case then threw instead
         of testing anything, and verify.mjs went red on a rule that was still working.
         The rule was never about cables. It is about a station two exercises cannot hold at once,
         so the fixture is now any concurrent pair whose lead holds a station that equipment.json
         does not declare shareable. That is what the rule says, and it cannot be emptied by one
         block changing its pairing. */
      const equipment = JSON.parse(readFileSync(join(HERE, 'equipment.json'), 'utf8'));
      const shareable = new Set();
      for (const zone of Object.values(equipment.zones ?? {})) {
        for (const [id, st] of Object.entries(zone.stations ?? {})) {
          if (st && typeof st === 'object' && st.sharedInOneWindow === true) shareable.add(id);
        }
      }
      if (!shareable.size) throw new Error('read no shareable stations; the equipment shape moved under this case');
      const block = Object.values(p.days)
        .flatMap((d) => d.blocks || [])
        .find((b) => ['fill', 'alternate'].includes(b.pairing)
          && b.exercises.length === 2
          && b.exercises[0].station
          && !shareable.has(b.exercises[0].station));
      if (!block) throw new Error('no concurrent block on a non-shareable station to mutate; repoint this case');
      block.exercises[1].zone = block.exercises[0].zone;
      block.exercises[1].station = block.exercises[0].station;
    },
    expect: 'not declared shareable',
  },
  {
    name: 'the same shape on a SHAREABLE station is allowed, and this is what stops it refusing everything',
    /* THE PERMITTED DIRECTION, REWRITTEN 2026-08-31, and the rewrite is the point.

       It used to take the real cable block and DECLARE the cable stack shareable, because the first
       attempt at forcing two exercises onto the bench had tripped the PLACEMENT gate: that gate
       refuses a slot claiming a fixture the catalogue says the movement does not hold, which is a
       different rule doing its job. So the case fabricated a permission that is false in his gym,
       and it broke the day the programme's cable block got a station-less partner, reporting the
       placement gate's correct refusal as a failure of the sharing rule.

       The shape needs no fabrication. `bulgarian-split-squat` and `db-bench-press` BOTH declare
       zone benchDb and station bench in movements.json, and equipment.json already declares
       benchDb/bench sharedInOneWindow. Two exercises on one shareable fixture, from the real
       catalogue, with no mutation required. This case asserts the shape is PRESENT and validates;
       the case after it withdraws the permission and requires the refusal. Together that is the
       rule watched in both directions on data that is true. */
    mutate: (p) => {
      const block = sharedStationBlock(p);
      if (!block) {
        throw new Error('no fill block puts two exercises on one shareable catalogue station; '
          + 'this case and the one after it both need that shape. If the programme genuinely no '
          + 'longer has it, build it from bulgarian-split-squat plus db-bench-press, which both '
          + 'hold benchDb/bench.');
      }
    },
    expect: null,
  },
  {
    /* THE PERMISSION IS LOAD-BEARING, so withdrawing it must flip the same block to a refusal. This
       is the other half of the case above, and it is what proves the rule reads
       `sharedInOneWindow` rather than special-casing the bench by name. Nothing in program.json
       changes; only the permission does. */
    name: 'withdrawing sharedInOneWindow turns that same allowed block into a refusal',
    mutate: (p) => {
      if (!sharedStationBlock(p)) throw new Error('the shareable-station block is gone; see the case above');
    },
    also: {
      file: 'equipment.json',
      mutate: (e) => {
        for (const z of Object.values(e.zones)) {
          for (const s of Object.values(z.stations || {})) {
            if (s && typeof s === 'object') delete s.sharedInOneWindow;
          }
        }
      },
    },
    expect: 'not declared shareable',
  },
  {
    name: 'a cue naming an implement the card is not is refused',
    mutate: (p) => {
      /* The real defect, in his own file's words: a cable exercise whose cue told him to hold "ONE
         dumbbell in both hands, cupping the top end like a mug". Built from a real cable slot rather
         than a named one, so a rebuild that moves ids does not quietly stop testing anything. */
      const ex = Object.values(p.days)
        .flatMap((d) => d.blocks || [])
        .flatMap((b) => b.exercises || [])
        .find((e) => typeof e.cue === 'string' && e.zone === 'cable' && e.station);
      if (!ex) throw new Error('no cable slot with a cue to mutate; repoint this case');
      ex.cue = 'ONE dumbbell held in both hands, cupping the top end like a mug. ' + ex.cue;
    },
    expect: 'opens by naming a dumbbell',
  },
  {
    name: 'a cue mentioning another implement as a CONTRAST is allowed',
    mutate: (p) => {
      /* THE DIRECTION THAT KEEPS THE RULE HONEST, and the one its first version got wrong three times
         out of three. The machine chest press cue reads "so a tired chest does not have to balance
         dumbbells", which is correct and useful; the lat pulldown says "bring the bar to your upper
         chest", which is the lat bar; the assisted pull-up says "chin over the bar". A rule matching
         bare nouns flagged all three, and a checker whose new findings are all false is one nobody
         runs. The patterns match HOLDING constructions, not mentions. */
      /* REPOINTED 2026-08-31, off `zone === 'machines'`. The whole-week rebuild that day contains no
         machine slot at all, so this case died with "repoint this case" while the rule it covers had
         not changed. The machine bank was never the point: the rule is about a cue that MENTIONS
         another implement without telling him to hold one, and any slot that is not itself a
         dumbbell exercise exercises it. A barbell slot is used, so "does not have to balance
         dumbbells" is a genuine contrast rather than a description of the card. */
      const ex = Object.values(p.days)
        .flatMap((d) => d.blocks || [])
        .flatMap((b) => b.exercises || [])
        .find((e) => typeof e.cue === 'string' && CATALOGUE()[e.id]?.implement === 'barbell');
      if (!ex) throw new Error('no barbell slot with a cue to mutate; repoint this case');
      ex.cue = 'Machine on purpose, so a tired chest does not have to balance dumbbells. '
        + 'Bring the bar to your upper chest and keep your chin over the bar. ' + ex.cue;
    },
    expect: null,
  },
  /* ---- A BLOCK LABEL MAY NOT COUNT. His note #34, 2026-08-28: "second to what?" ---------------- */
  {
    /* HIS OWN CARD, 2026-08-29. "Hamstrings + Calves" is a sequence, and he called it "impossible
     * leg curl with calf machine raise" in the same message that asked why the vertical rule was
     * missing from it. It was missing because the block is not a pair. */
    name: 'a sequence labelled with a plus is refused',
    mutate: (p) => {
      const b = asSequence(p);
      b.label = 'Hamstrings + Calves';
      b.tag = '(machine, then the other machine)';
    },
    expect: 'reads as "do these together"',
  },
  {
    name: 'a sequence that never says "then" is refused',
    mutate: (p) => {
      const b = asSequence(p);
      b.label = 'Hamstrings and Calves';
      b.tag = '(machine)';
    },
    expect: 'never says "then"',
  },
  {
    name: 'a fill block with a plus in its label is still fine, because it IS a pair',
    mutate: (p) => {
      const b = Object.values(p.days).flatMap((d) => d.blocks || [])
        .find((x) => x.pairing === 'fill' && (x.exercises || []).length >= 2);
      if (!b) throw new Error('no fill block; repoint this case');
      b.label = 'Single Leg + Anti-Lean';
    },
    expect: null,
  },
  {
    /* `upper b` MATCHED "UPPER BACK". Thursday's solo front squat carried "The reverse fly rides in
     * the rest because a front squat uses nothing in the upper back", and the sentence exempted
     * itself from the stale-exercise gate using an anatomical noun. */
    name: 'a body part may not stand in for a day and exempt a stale clause',
    mutate: (p) => {
      const b = Object.values(p.days).flatMap((d) => d.blocks || [])
        .find((x) => (x.exercises || []).length === 1 && x.why);
      if (!b) throw new Error('no solo block with a why; repoint this case');
      b.why = `${b.why} The Copenhagen Plank works the upper back here.`;
    },
    expect: 'not in this block',
  },
  {
    /* BOTH CROSS-REFERENCE CASES DERIVE THE EXERCISE AND THE DAY, and neither did until 2026-08-31.
       They named the Copenhagen Plank and Thursday, and the whole-week rebuild that day removed the
       Copenhagen entirely: the permitting case then failed because the sentence pointed at a day
       where the exercise genuinely was not, which is the gate working correctly on a stale fixture.
       Every hardcoded exercise name in this file has gone stale at least once. */
    name: 'a real cross-reference to another day still passes',
    mutate: (p) => {
      const elsewhere = crossDayReference(p, 'monday');
      const b = p.days.monday.blocks.find((x) => x.why);
      b.why = `${b.why} The ${elsewhere.name} is on ${elsewhere.homeDay}, not here.`;
    },
    expect: null,
  },
  {
    name: 'a cross-reference to a day that does NOT have the exercise is refused',
    mutate: (p) => {
      const elsewhere = crossDayReference(p, 'monday');
      const b = p.days.monday.blocks.find((x) => x.why);
      b.why = `${b.why} The ${elsewhere.name} is on ${elsewhere.absentDay}, not here.`;
    },
    expect: 'it is not there either',
  },
  {
    /* The lunge block, which the clause above cannot catch: "dead bugs in the rest gaps for the same
     * reason as Tuesday" names a day that really does have dead bugs. What is checkable without
     * semantics is that a block of one has no rest for anything to ride in. */
    name: 'a solo block whose why says something rides in its rest is refused',
    mutate: (p) => {
      const b = Object.values(p.days).flatMap((d) => d.blocks || [])
        .find((x) => (x.exercises || []).length === 1 && x.why);
      if (!b) throw new Error('no solo block with a why; repoint this case');
      b.why = `${b.why} The carry rides in the rest here.`;
    },
    expect: 'Nothing is in its rest',
  },
  {
    name: 'a PAIRED block whose why says something rides in its rest is fine',
    mutate: (p) => {
      const b = Object.values(p.days).flatMap((d) => d.blocks || [])
        .find((x) => (x.exercises || []).length === 2 && x.pairing === 'fill');
      if (!b) throw new Error('no paired fill block; repoint this case');
      b.why = `${b.why} The ${b.exercises[1].name} rides in the rest.`;
    },
    expect: null,
  },
  {
    /* CASE (c) OF HIS OWN RULE, which validate.mjs did not implement until 2026-08-30. Two fixtures
     * in arm's reach may hold one rest window. Built from the real cable block, whose two stations
     * are declared adjacent on his ruling. */
    name: 'a pair across two ADJACENT stations is allowed',
    /* CASE (c) OF HIS OWN RULE, which validate.mjs did not implement until 2026-08-30: two fixtures
       in arm's reach may hold one rest window. equipment.json declares cable-pulldown, cable-row and
       cable-adjustable mutually adjacent, on his ruling, and the catalogue already puts real
       exercises at two of them, so no file but program.json needs to move. See rebuildBlockAs. */
    mutate: (p) => { rebuildBlockAs(p, 'lat-pulldown', 'cable-reverse-fly'); },
    expect: null,
  },
  {
    name: 'a pair across two stations that are NOT adjacent is still refused',
    /* THE REFUSING DIRECTION, and the pair matters: without it the rule above could be permitting
       every two-station block rather than only the adjacent ones. No station in the machines zone
       declares adjacentTo, which is the honest state of that gym: the bank is a row of machines you
       walk between. */
    mutate: (p) => { rebuildBlockAs(p, 'leg-curl', 'standing-calf-raise'); },
    expect: 'occupies 2 stations',
  },
  {
    /* Adjacency is a fact about ONE place. Two fixtures in different zones cannot be in arm's reach,
     * and a file that said so would be describing a gym nobody has been in. */
    name: 'stations declared adjacent across two zones is refused',
    mutate: (p) => {
      const block = Object.values(p.days).flatMap((d) => d.blocks || [])
        .find((b) => b.exercises?.length === 2 && b.exercises[0].zone === 'cable' && b.exercises[0].station);
      if (!block) throw new Error('no two-exercise cable block; repoint this case');
      block.pairing = 'fill';
      block.exercises[1].zone = 'machines';
      block.exercises[1].station = 'cable-row';
    },
    expect: 'lives in zone',
  },
  {
    /* THE DAY CHIP, and it took a screenshot to find. `splitName` renders the text before the first
       ": " in a day's title and falls back to the WHOLE title when there is no colon, so four
       colon-free titles turned the chip row into four stacked full-width rows on 2026-08-31. Every
       other gate passed: the fallback is legal and the row does not overflow. */
    name: 'a day title with no short head is refused, because the chip renders the whole thing',
    mutate: (p) => {
      const day = Object.values(p.days)[0];
      if (!day) throw new Error('no days at all; repoint this case');
      day.title = 'A day title long enough to fill the chip row with no colon in it anywhere';
    },
    expect: 'the day chip renders',
  },
  {
    /* The permitting direction: a short head is what the chip wants, and the rule must not refuse
       one. Without this the length check could be refusing every title. */
    name: 'a day title with a short head before a colon still passes',
    mutate: (p) => {
      const day = Object.values(p.days)[0];
      day.title = `${day.name}: rebuilt by the regression suite to carry a short head`;
    },
    expect: null,
  },
  {
    /* THE FALSE-ABSENCE CLAIM. An adversarial pass on 2026-09-01 read every partner clause against
       movements.json for the first time and found THREE that the catalogue contradicts, including
       "the Front Squat does not use the trunk" beside a catalogue note reading "more trunk than the
       back squat". The verbatim-span gate proves the clause is IN the block why; it cannot tell
       whether the sentence is true. */
    name: 'a partner clause claiming the lead does not use what the partner trains is refused',
    mutate: (p) => {
      /* BUILDS THE OVERLAP RATHER THAN HUNTING FOR IT, because the live instances were fixed in the
         same commit that added this gate, so the programme has NONE and a hunting version would die
         on its own success.
         REPOINTED 2026-09-01, from lat-pulldown plus cable-reverse-fly. That pair worked because the
         pulldown carried rear-delts as a secondary muscle, and the attribution rewrite that day
         REMOVED that credit: a pulldown adducts the shoulder in the frontal plane while the posterior
         deltoid extends and horizontally abducts it, and the 2026-08-30 audit had already recorded
         that no source measures posterior deltoid in a pulldown. So the fixture stopped overlapping.
         The bench press and a triceps extension is the stable choice: elbow extension is what the
         triceps do, and a press extends the elbow. That will not be corrected away. */
      const target = rebuildBlockAs(p, 'db-bench-press', 'db-overhead-tricep-extension');
      const partner = target.exercises[1];
      const clause = `${partner.name} goes in the rest because the ${target.exercises[0].name} does not use it.`;
      partner.whyHere = clause;
      target.why = `Built by the regression suite. ${clause}`;
    },
    expect: 'does not use',
  },
  {
    /* THE PERMITTED DIRECTION. A pair with no muscle overlap may say exactly the same thing, and 12
       of the 15 live clauses do. Without this the rule could be refusing every partner clause. */
    name: 'the same clause on a pair with no shared muscle is allowed',
    mutate: (p) => {
      /* Also built rather than hunted, and the pair is chosen so the claim is TRUE: a lat pulldown
         carries lats, biceps, upper-back, rear-delts and grip, and a Pallof press trains the abs,
         which is none of those. Both sit in the cable zone at stations equipment.json declares
         adjacent, so the walking-route and one-station rules are satisfied and cannot mask the result.
         The first attempt paired it with a dumbbell calf raise and the zone rule refused it, which
         would have read as this rule rejecting a correct clause. If this case ever fails, the rule is
         refusing clauses that are true. */
      const target = rebuildBlockAs(p, 'lat-pulldown', 'cable-pallof');
      const partner = target.exercises[1];
      const clause = `${partner.name} goes in the rest because the ${target.exercises[0].name} does not use it.`;
      partner.whyHere = clause;
      target.why = `Built by the regression suite. ${clause}`;
    },
    expect: null,
  },
  {
    name: 'a label that counts is refused',
    mutate: (p) => {
      /* The block is FOUND rather than named, for the reason the donor block above is: seven labels
         were renamed the day this case was written, and a case that names one of them is a case that
         breaks on the next rename. Any block with a label will do. */
      const b = Object.values(p.days).flatMap((d) => d.blocks || []).find((x) => x.label);
      if (!b) throw new Error('no labelled block to mutate');
      b.label = `Second ${b.label}`;
    },
    expect: 'counts',
  },
  {
    name: 'an ordinary label without an ordinal still passes',
    mutate: (p) => {
      /* THE PAIRED PERMIT CASE, and it is not decoration here. The rule matches on a word list, so
         the way to get it wrong is a pattern too greedy: "Second Pattern" and "seconds" share five
         letters, and the carry blocks are measured in seconds. A gate watched refusing and never
         watched permitting is a gate that might refuse everything. */
      const b = Object.values(p.days).flatMap((d) => d.blocks || []).find((x) => x.label);
      if (!b) throw new Error('no labelled block to mutate');
      b.label = 'Horizontal Pull, 40 seconds of rest';
    },
    expect: null,
  },
];

let failed = 0;
for (const c of CASES) {
  const dir = mkdtempSync(join(tmpdir(), 'gymvalidate-'));
  try {
    cpSync(HERE, dir, { recursive: true });
    // Check the fixtures the program cases rely on BEFORE mutating, so a stale anchor is a loud
    // failure rather than five cases quietly passing against a lead lift. Done on every case,
    // whichever file it edits: an anchor that has gone stale is news either way.
    const program = JSON.parse(readFileSync(join(dir, 'program.json'), 'utf8'));
    spanBlock(program);
    /* `anyOpenExercise`, not the old `openBlock`. The pre-flight asserts the fixtures still exist,
       and what the shape cases need is an open question ANYWHERE, not one on a partner: requiring a
       partner here made every case in the suite fail the day the last partner question was answered,
       which is a fixture problem masquerading as a regression. */
    anyOpenExercise(program);

    const file = join(dir, c.file ?? 'program.json');
    const doc = c.file ? JSON.parse(readFileSync(file, 'utf8')) : program;

    /* A CASE THAT CANNOT FIND ITS FIXTURE IS A FAILURE, NOT AN ABORT. Added 2026-08-31. A `mutate`
       that throws "repoint this case" used to kill the whole process, so one whole-week rebuild that
       removed a `sequence` block, every machine slot and every `formerIds` slot took SIX runs to
       diagnose: each run reported one fixture problem and hid the rest behind it, and the run also
       hid the twenty-odd cases that were passing. That is the same shape of defect as verify.mjs
       stopping at its first red gate, except here the cases are independent and there is no reason
       to stop. It still fails the suite, loudly, with the case named. */
    try {
      c.mutate(doc);
    } catch (err) {
      failed++;
      console.log(`FAIL  ${c.name}\n      FIXTURE: ${err.message}`);
      continue;
    }
    writeFileSync(file, JSON.stringify(doc, null, 2));

    /* A SECOND FILE, for the rules that live across two of them. Added 2026-08-28 with the
       shareable-station rule, which reads a placement out of program.json and a permission out of
       equipment.json: a case that can only touch one of them can only test half the rule, and the
       half it cannot reach is the PERMITTED direction. A gate watched refusing and never watched
       permitting is a gate that might refuse everything. */
    if (c.also) {
      const alsoPath = join(dir, c.also.file);
      const alsoDoc = JSON.parse(readFileSync(alsoPath, 'utf8'));
      c.also.mutate(alsoDoc);
      writeFileSync(alsoPath, JSON.stringify(alsoDoc, null, 2));
    }

    const run = spawnSync(process.execPath, [join(dir, 'validate.mjs')], { encoding: 'utf8' });
    const out = `${run.stdout || ''}${run.stderr || ''}`;

    if (c.expect === null) {
      if (run.status === 0) console.log(`ok    ${c.name}`);
      else {
        failed++;
        console.log(`FAIL  ${c.name}\n      expected a clean run, got exit ${run.status}:\n      ${out.split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 2).join('\n      ')}`);
      }
    } else if (run.status !== 0 && out.includes(c.expect)) {
      console.log(`ok    ${c.name}`);
    } else {
      failed++;
      console.log(`FAIL  ${c.name}\n      expected exit 1 mentioning ${JSON.stringify(c.expect)}, got exit ${run.status}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('-'.repeat(70));
console.log(`${CASES.length} cases, ${failed} failed`);
process.exit(failed ? 1 : 0);
