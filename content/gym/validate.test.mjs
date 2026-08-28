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

/* FIXTURES ADDRESS BLOCKS BY LABEL, NEVER BY INDEX.
 *
 * The first version used `days.tuesday.blocks[1]`. Inserting the Upper A primer at position 0 on
 * 2026-08-27 shifted every Tuesday index by one, and three cases then mutated the wrong block and
 * crashed the runner mid-suite. An index into a hand-edited content file is not a stable address.
 *
 * `partnerOf` also encodes what a partner IS in one place: the LAST exercise of the block. */
const blockBy = (program, day, label) => {
  const b = (program.days[day]?.blocks || []).find((x) => x.label === label);
  if (!b) throw new Error(`no block labelled "${label}" on ${day}; have: ${(program.days[day]?.blocks || []).map((x) => x.label).join(' | ')}`);
  return b;
};
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

/* A fixture that no longer holds what a case needs must stop the run, not skip it. */
function assertAnchor(program, anchor, needs) {
  const b = blockBy(program, ...anchor);
  if (!b) throw new Error(`anchor block ${anchor.join('/')} no longer exists; repoint it`);
  if (b.exercises.length < 2) throw new Error(`anchor block ${anchor.join('/')} is no longer a pair, so partnerOf() returns the lead lift; repoint it`);
  const partner = partnerOf(b);
  if (!partner[needs]) throw new Error(`anchor block ${anchor.join('/')} partner "${partner.id}" has no ${needs}; repoint it`);
}
/** The two blocks the fixtures use, named once. Any block with an `open` row works for the second. */
/* THESE TWO ANCHORS ARE FIXTURES AND THEY GO STALE. Repointed 2026-08-27: the 2026-08-27 programme
 * rebuild left `friday/Second Vertical Pull` and `friday/Main Lift: BB Row` as SINGLE-exercise
 * blocks, so `partnerOf` returned the lead lift and five of these cases silently stopped testing
 * anything. They did not error, they PASSED for the wrong reason, which is the failure mode this
 * suite exists to catch in the validator.
 *
 * SPAN_BLOCK must be a paired block whose partner carries a `whyHere`.
 * OPEN_BLOCK must be a paired block whose partner carries an `open` question.
 * If a future edit unpairs either one, the first case below fails loudly rather than passing. */
const SPAN_BLOCK = ['thursday', 'Hamstrings + Calves'];
const OPEN_BLOCK = ['tuesday', 'Second Pattern: Vertical Pull'];

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
      partnerOf(blockBy(p, ...SPAN_BLOCK)).whyHere =
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
      const b = blockBy(p, ...SPAN_BLOCK);
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
      const anchor = blockBy(p, ...SPAN_BLOCK);
      const donor = Object.values(p.days)
        .flatMap((d) => d.blocks || [])
        .find((b) => b !== anchor && typeof b.why === 'string' && b.why.length >= 60);
      if (!donor) throw new Error('no other block carries a why long enough to borrow from');
      partnerOf(anchor).whyHere = donor.why.slice(0, 60);
    },
    expect: 'NOT a verbatim span',
  },
  {
    name: 'a partner with neither whyHere nor open is refused',
    mutate: (p) => {
      delete partnerOf(blockBy(p, ...SPAN_BLOCK)).whyHere;
    },
    expect: 'no "whyHere" and no "open"',
  },
  {
    name: 'whyHere on a lead lift is refused',
    mutate: (p) => {
      blockBy(p, ...SPAN_BLOCK).exercises[0].whyHere =
        'The second vertical pull. Lat Pulldown on Tuesday was the only one in the week';
    },
    expect: 'which is a lead lift',
  },
  {
    name: 'both whyHere and open on one partner is refused',
    mutate: (p) => {
      const blk = blockBy(p, ...OPEN_BLOCK);
      partnerOf(blk).whyHere = blk.why.slice(0, 60);
    },
    expect: 'carries both',
  },
  {
    name: 'an open question due before it was asked is refused',
    mutate: (p) => {
      partnerOf(blockBy(p, ...OPEN_BLOCK)).open[0].due = '2026-08-01';
    },
    expect: 'is not after "asked"',
  },
  {
    name: 'an open question with no context is refused',
    mutate: (p) => {
      partnerOf(blockBy(p, ...OPEN_BLOCK)).open[0].q = 'why is this here';
    },
    expect: 'at least 30 characters',
  },
  {
    name: 'an emptied open array is refused rather than ignored',
    mutate: (p) => {
      partnerOf(blockBy(p, ...OPEN_BLOCK)).open = [];
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
    assertAnchor(program, SPAN_BLOCK, 'whyHere');
    assertAnchor(program, OPEN_BLOCK, 'open');

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
