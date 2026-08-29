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
const openBlock = (p) => findBlock(p, 'open');

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
      const blk = openBlock(p);
      const partner = partnerOf(blk);
      partner.whyHere = blk.why.slice(0, 60);
      partner.open.forEach((q) => { q.topic = 'cue'; });
    },
    expect: null,
  },
  {
    name: 'a partner whose only question is about its cue still needs a whyHere',
    mutate: (p) => {
      const blk = openBlock(p);
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
      const q = partnerOf(openBlock(p)).open[0];
      q.q = q.q.replace(/\?\s*$/, '.');
      if (/\?\s*$/.test(q.q)) throw new Error('anchor question did not end in a question mark; the gate under test is already unmet');
    },
    expect: 'does not end in a question mark',
  },
  {
    name: 'an open question with an unknown topic is refused',
    mutate: (p) => {
      partnerOf(openBlock(p)).open[0].topic = 'general';
    },
    expect: '"topic" must be one of',
  },
  {
    name: 'an open question with no topic at all is refused',
    mutate: (p) => {
      delete partnerOf(openBlock(p)).open[0].topic;
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
      const station = Object.values(e.zones)
        .flatMap((z) => Object.values(z.stations || {}))
        .find((s) => Array.isArray(s?.open) && s.open.length);
      if (!station) throw new Error('no station carries an open question; repoint this case');
      station.open[0].q = station.open[0].q.replace(/\?\s*$/, '.');
    },
    expect: 'does not end in a question mark',
  },
  {
    /* An alias written in the wrong field. `formerIds` says "this id is dead and its rows are
     * stranded"; if the id is still live the two are either one movement, which is an alias in
     * movements.json and merges the histories, or two movements, which are two histories. */
    name: 'a formerId that is still a live id is refused',
    mutate: (p) => {
      const all = Object.values(p.days).flatMap((d) => d.blocks || []).flatMap((b) => b.exercises || []);
      const target = all.find((e) => Array.isArray(e.formerIds));
      if (!target) throw new Error('no slot carries formerIds; repoint this case');
      target.formerIds = [all.find((e) => e.id !== target.id).id];
    },
    expect: 'STILL a live id',
  },
  {
    name: 'a formerId naming the slot itself is refused',
    mutate: (p) => {
      const target = Object.values(p.days).flatMap((d) => d.blocks || [])
        .flatMap((b) => b.exercises || []).find((e) => Array.isArray(e.formerIds));
      if (!target) throw new Error('no slot carries formerIds; repoint this case');
      target.formerIds = [target.id];
    },
    expect: "the slot's own id",
  },
  {
    name: 'an emptied formerIds is refused rather than ignored',
    mutate: (p) => {
      const target = Object.values(p.days).flatMap((d) => d.blocks || [])
        .flatMap((b) => b.exercises || []).find((e) => Array.isArray(e.formerIds));
      if (!target) throw new Error('no slot carries formerIds; repoint this case');
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
      const station = Object.values(e.zones)
        .flatMap((z) => Object.values(z.stations || {}))
        .find((s) => Array.isArray(s?.open) && s.open.length);
      if (!station) throw new Error('no station carries an open question; repoint this case');
      station.open[0].due = 'next week';
    },
    expect: '"due" must be YYYY-MM-DD',
  },
  {
    name: 'an open question due before it was asked is refused',
    mutate: (p) => {
      partnerOf(openBlock(p)).open[0].due = '2026-08-01';
    },
    expect: 'is not after "asked"',
  },
  {
    name: 'an open question with no context is refused',
    mutate: (p) => {
      partnerOf(openBlock(p)).open[0].q = 'why is this here';
    },
    expect: 'at least 30 characters',
  },
  {
    name: 'an emptied open array is refused rather than ignored',
    mutate: (p) => {
      partnerOf(openBlock(p)).open = [];
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
      const block = Object.values(p.days)
        .flatMap((d) => d.blocks || [])
        .find((b) => ['fill', 'alternate'].includes(b.pairing)
          && b.exercises.length === 2
          && b.exercises[0].station
          && b.exercises[0].zone === 'cable');
      if (!block) throw new Error('no concurrent cable block to mutate; repoint this case');
      block.exercises[1].zone = block.exercises[0].zone;
      block.exercises[1].station = block.exercises[0].station;
    },
    expect: 'not declared shareable',
  },
  {
    name: 'the same shape on a SHAREABLE station is allowed, and this is what stops it refusing everything',
    /* THE PERMITTED DIRECTION, and it took a second file to reach. The first attempt forced two
       exercises onto the bench in program.json alone and failed for an unrelated reason: the
       PLACEMENT gate refuses a slot claiming a fixture the catalogue says the movement does not
       hold, which is a different rule doing its job correctly. Fighting that would have tested the
       wrong thing.
       
       So the mutation is the honest one: take the real cable block, which the rule refuses today,
       and DECLARE that station shareable. Nothing else changes. If it still fails, the rule is
       refusing on something other than the permission and would refuse the bench too. */
    mutate: (p) => {
      const block = Object.values(p.days)
        .flatMap((d) => d.blocks || [])
        .find((b) => b.exercises?.length === 2
          && b.exercises[0].zone === 'cable'
          && b.exercises[0].station);
      if (!block) throw new Error('no two-exercise cable block to mutate; repoint this case');
      block.pairing = 'fill';
      block.exercises[1].zone = block.exercises[0].zone;
      block.exercises[1].station = block.exercises[0].station;
    },
    also: {
      file: 'equipment.json',
      mutate: (e) => {
        for (const s of Object.values(e.zones.cable.stations)) {
          if (s && typeof s === 'object') s.sharedInOneWindow = true;
        }
      },
    },
    expect: null,
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
      const ex = Object.values(p.days)
        .flatMap((d) => d.blocks || [])
        .flatMap((b) => b.exercises || [])
        .find((e) => typeof e.cue === 'string' && e.zone === 'machines' && e.station);
      if (!ex) throw new Error('no machine slot with a cue to mutate; repoint this case');
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
      const b = Object.values(p.days).flatMap((d) => d.blocks || [])
        .find((x) => x.pairing === 'sequence' && (x.exercises || []).length >= 2);
      if (!b) throw new Error('no sequence block; repoint this case');
      b.label = 'Hamstrings + Calves';
      b.tag = '(machine, then the other machine)';
    },
    expect: 'reads as "do these together"',
  },
  {
    name: 'a sequence that never says "then" is refused',
    mutate: (p) => {
      const b = Object.values(p.days).flatMap((d) => d.blocks || [])
        .find((x) => x.pairing === 'sequence' && (x.exercises || []).length >= 2);
      if (!b) throw new Error('no sequence block; repoint this case');
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
    name: 'a real cross-reference to another day still passes',
    mutate: (p) => {
      // Copenhagen Plank is on Thursday, so a Monday block may name it AS BEING on Thursday.
      const b = p.days.monday.blocks.find((x) => x.why);
      b.why = `${b.why} The Copenhagen Plank is on Thursday, not here.`;
    },
    expect: null,
  },
  {
    name: 'a cross-reference to a day that does NOT have the exercise is refused',
    mutate: (p) => {
      const b = p.days.monday.blocks.find((x) => x.why);
      b.why = `${b.why} The Copenhagen Plank is on Friday, not here.`;
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
    openBlock(program);

    const file = join(dir, c.file ?? 'program.json');
    const doc = c.file ? JSON.parse(readFileSync(file, 'utf8')) : program;
    c.mutate(doc);
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
