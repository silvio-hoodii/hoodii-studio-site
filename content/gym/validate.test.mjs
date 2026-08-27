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
/** The two blocks the fixtures use, named once. Any block with an `open` row works for the second. */
const SPAN_BLOCK = ['friday', 'Second Vertical Pull'];
const OPEN_BLOCK = ['friday', 'Main Lift: BB Row'];

/** @type {{name: string, mutate: (p: any) => void, expect: string | null}[]} */
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
      const b = blockBy(p, ...SPAN_BLOCK);
      partnerOf(b).whyHere = 'side delts go in the rest because a pull-up does not use them.';
    },
    expect: null,
  },
  {
    name: 'a span from ANOTHER block is refused',
    mutate: (p) => {
      partnerOf(blockBy(p, ...SPAN_BLOCK)).whyHere =
        blockBy(p, 'monday', 'Sideways + Calves').why.slice(0, 60);
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
];

let failed = 0;
for (const c of CASES) {
  const dir = mkdtempSync(join(tmpdir(), 'gymvalidate-'));
  try {
    cpSync(HERE, dir, { recursive: true });
    const file = join(dir, 'program.json');
    const program = JSON.parse(readFileSync(file, 'utf8'));
    c.mutate(program);
    writeFileSync(file, JSON.stringify(program, null, 2));

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
