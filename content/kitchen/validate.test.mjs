/* REGRESSION SUITE FOR THE GATES IN content/kitchen/validate.mjs.
 *
 * Written 2026-08-28, on the day the bare-colour-endpoint gate was added, and its first case is the
 * one that gate needed most: it got FOUR OUT OF FOUR WRONG on its first live run, flagging four
 * doneness tests that all already discriminated ("They should not be brown", "foaming rather than
 * browning", "Brown is right. BLACK is burnt"). That was caught by reading the output rather than by
 * a test, which is luck, and luck is not a mechanism.
 *
 * `content/gym/validate.test.mjs` is the pattern and its own header states the principle: a gate that
 * has only ever been seen to PASS has not been seen to work, because it may be matching nothing.
 * The kitchen validator is older, larger and gates the surface where a defect ends up in someone's
 * mouth, and it had no such suite.
 *
 * Each case copies content/kitchen into a temp directory, mutates ONE recipe, and runs the real
 * validator against the copy, so nothing here can touch a live card. Both directions matter: a case
 * expecting `null` proves the gate lets correct data through, which is how a false positive gets
 * caught before it teaches somebody to ignore the checker.
 *
 *   node content/kitchen/validate.test.mjs
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ANCHORS ARE FOUND, NOT NAMED. The gym suite's own comment records what naming costs: it hardcoded
 * a block label, the label was renamed, and five cases stopped testing anything while continuing to
 * pass. A recipe id in a fixture is the same hazard, so these look for a card with the shape the
 * case needs and fail loudly when none exists. */
const recipePath = (dir, id) => join(dir, 'recipes', `${id}.json`);

/** Any authored recipe with a step carrying a `doneness.test`, which is what the colour gate reads. */
function findDonenessCard(dir) {
  for (const f of readdirSync(join(dir, 'recipes')).sort()) {
    const id = f.replace(/\.json$/, '');
    const r = JSON.parse(readFileSync(recipePath(dir, id), 'utf8'));
    const step = (r.steps || []).find((s) => s.doneness?.test);
    if (step) return { id, r, n: step.n };
  }
  throw new Error('no recipe carries a step with a doneness.test; repoint this fixture');
}

/** Set one step's doneness test on one card, keeping the readHash stamp valid.
 *
 *  `readHash` hashes the RENDERED text, so any mutation here would fail the read gate instead of the
 *  gate under test, and every case would pass for the wrong reason. Dropping the stamp is not an
 *  option either: the validator fails a `sourced` card that has none. So the mutation drops the card
 *  to tier `adapted`, where the read gate does not apply, and the colour gate still does. */
function setDoneness(dir, id, r, n, test) {
  const step = r.steps.find((s) => s.n === n);
  step.doneness = { ...(step.doneness || { kind: 'look' }), test };
  if (r.provenance) {
    r.provenance.tier = 'adapted';
    delete r.provenance.readHash;
    delete r.provenance.readAt;
    delete r.provenance.cookedResult;
  }
  writeFileSync(recipePath(dir, id), JSON.stringify(r, null, 2));
}

const CASES = [
  {
    name: 'unmodified content passes',
    run: () => {},
    expect: null,
  },

  /* ---- the bare colour endpoint, both directions ---------------------------------------- */
  {
    name: 'a doneness test that says only "brown" is refused',
    run: (dir) => {
      const { id, r, n } = findDonenessCard(dir);
      setDoneness(dir, id, r, n, 'Cook it until the pieces are brown.');
    },
    expect: 'bare word "brown"',
  },
  {
    name: 'the same test with the state named is allowed',
    run: (dir) => {
      const { id, r, n } = findDonenessCard(dir);
      setDoneness(dir, id, r, n, 'Cook until the red has gone grey-brown all the way through a cut piece.');
    },
    expect: null,
  },
  {
    name: 'ruling brown OUT is allowed, which is where the first version got it wrong',
    run: (dir) => {
      const { id, r, n } = findDonenessCard(dir);
      setDoneness(dir, id, r, n, 'The edges go see-through and they flop when pushed. They should not be brown.');
    },
    expect: null,
  },
  {
    name: 'contrasting brown with something else is allowed',
    run: (dir) => {
      const { id, r, n } = findDonenessCard(dir);
      setDoneness(dir, id, r, n, 'The butter covers the base and is foaming rather than browning.');
    },
    expect: null,
  },
  {
    name: 'brown against black is allowed, which is piccata step 11',
    run: (dir) => {
      const { id, r, n } = findDonenessCard(dir);
      setDoneness(dir, id, r, n, 'A brown stuck-on layer across the base. Brown is right. BLACK is burnt.');
    },
    expect: null,
  },
  {
    name: 'the word "browned" alone is refused too, not only "brown"',
    run: (dir) => {
      const { id, r, n } = findDonenessCard(dir);
      setDoneness(dir, id, r, n, 'Lift a piece and check it is browned.');
    },
    expect: 'bare word "brown"',
  },
  {
    name: 'a doneness test with no colour word at all is untouched by this gate',
    run: (dir) => {
      const { id, r, n } = findDonenessCard(dir);
      setDoneness(dir, id, r, n, 'Tilt the pan. If liquid runs to the low side it is not ready.');
    },
    expect: null,
  },

  /* ---- two gates that predate this suite, so it is not testing only the newest one ------- */
  {
    name: 'a dial position in a doneness test is refused',
    run: (dir) => {
      const { id, r, n } = findDonenessCard(dir);
      setDoneness(dir, id, r, n, 'Put it on the lowest setting and wait until the edges lift.');
    },
    expect: 'dial position',
  },
  {
    name: '"cook until done" is refused',
    run: (dir) => {
      const { id, r, n } = findDonenessCard(dir);
      setDoneness(dir, id, r, n, 'Cook until done.');
    },
    expect: 'banned cue',
  },
];

let failed = 0;
for (const c of CASES) {
  const dir = mkdtempSync(join(tmpdir(), 'kitchenvalidate-'));
  try {
    cpSync(HERE, dir, { recursive: true });
    c.run(dir);

    /* --strict, because that is what `pnpm build` runs and therefore what actually gates a deploy.
     * A suite that exercises the lenient mode proves nothing about the door that is locked. */
    const run = spawnSync(process.execPath, [join(dir, 'validate.mjs'), '--strict'], { encoding: 'utf8' });
    const out = `${run.stdout || ''}${run.stderr || ''}`;

    if (c.expect === null) {
      if (run.status === 0) console.log(`ok    ${c.name}`);
      else {
        failed++;
        const lines = out.split('\n').filter((l) => l.includes('FAIL')).slice(0, 2).join('\n      ');
        console.log(`FAIL  ${c.name}\n      expected a clean run, got exit ${run.status}:\n      ${lines}`);
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
