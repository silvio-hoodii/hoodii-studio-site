#!/usr/bin/env node
/**
 * THE SWAP OPTIONS ON EVERY SLOT, DERIVED FROM THE CATALOGUE RATHER THAN TYPED.
 *
 *   node scripts/gym-alts.mjs            # report: what each slot would offer, and what it offers now
 *   node scripts/gym-alts.mjs --write    # rewrite the `alts` array on every logged slot
 *
 * WHY THIS EXISTS. The swap control on /gym reads `alts` off the slot, and he uses it: 13 distinct
 * swaps are recorded in `gym_set.swapped_from`, the most recent on 2026-08-27, four days before this
 * file was written (`db-calf-raise` to `machine-calf-raise`, an exercise the current programme
 * prescribes three times a week). The 2026-08-31 whole-week rebuild dropped all 82 alt entries
 * because it built every slot from scratch and nothing carried them across. Four probe-gym checks
 * caught it. Nothing else did, and no static gate would have: an absent optional field is
 * indistinguishable from a field nobody wanted.
 *
 * THE GROUPING IS DERIVED, THE CUE IS RECOVERED, and the split matters. `movements.json` groups
 * variants by JOB but carries no cue text: cues live in program.json, typed per slot. So the JOB
 * grouping comes from the catalogue and the cue comes from `content/gym/alt-cues.json`, which is
 * cue text recovered out of the pre-rebuild programme and holds NOTHING for a prescribed exercise.
 * That file's own header records its provenance and says where it should eventually live.
 *
 * A PRESCRIBED EXERCISE READS ITS CUE OFF ITS OWN SLOT, not out of alt-cues.json, and that is not a
 * duplicate: it is the single source. The front squat and the back squat are both prescribed and are
 * each a legitimate swap for the other, and the first run of this script skipped both for want of a
 * cue while their cues sat in program.json two blocks away.
 *
 * A VARIANT WITH NO CUE IN EITHER PLACE IS NOT OFFERED, and is reported instead. A swap he cannot
 * follow is worse than a swap he does not have, and per AGENTS.md an agent may DRAFT a cue from a
 * source but this script is not the place to invent one silently.
 *
 * `movements.json` already groups variants by JOB: the whole point of a
 * movement key is that its variants are different ways of doing the same thing, which is exactly
 * what a swap is. Typing the list into program.json makes a second copy of that grouping, and this
 * repo has the receipt for what a second copy costs: `inProgramme` was a flag on all 103 variants,
 * nine of them already wrong the day the file shipped, because a rebuild edited program.json and
 * never touched the flags. **Every copy of a fact is a fact that goes stale silently.** So the list
 * is regenerated from the catalogue instead, and re-running this after any programme change is
 * cheap and correct.
 *
 * WHAT IS EXCLUDED, and each exclusion is a rule the validator would otherwise refuse:
 *
 *   the slot itself             a swap to what you are already doing is not an option
 *   a variant with no cue       the card would render a swap he cannot follow
 *   needsFloor into a floorless zone   the cable section has no floor; this is a real gate
 *   a variant whose zone is `pool` or `cardio`   not a lifting substitute
 *
 * WHAT IS NOT EXCLUDED, deliberately: a variant at a different station or in a different zone. A
 * swap is what he does when the rack is taken, so an option in the same zone is the LEAST useful
 * kind. The live programme's own box-jump alts spanned two stations for that reason.
 *
 * THIS IS NOT A GATE and is not in verify.mjs. It writes content. What guards the result is
 * `validate.mjs`, which checks the shape of every alt, and `probe-gym.js`, which presses the swap
 * control in a real browser.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const write = argv.includes('--write');
const programPath = argv.find((a) => !a.startsWith('--')) || 'content/gym/program.json';

const program = JSON.parse(readFileSync(programPath, 'utf8'));
const cat = JSON.parse(readFileSync('content/gym/movements.json', 'utf8'));
const equip = JSON.parse(readFileSync('content/gym/equipment.json', 'utf8'));
const altCues = JSON.parse(readFileSync('content/gym/alt-cues.json', 'utf8')).cues ?? {};

/** id (and alias) -> {movementKey, variant}. */
const byId = new Map();
for (const [mk, m] of Object.entries(cat.movements)) {
  for (const v of m.variants) {
    byId.set(v.id, { mk, v });
    for (const a of v.aliases ?? []) byId.set(a, { mk, v });
  }
}

const hasFloor = (zone) => equip.zones?.[zone]?.floor === true;
const NOT_LIFTING = new Set(['pool', 'cardio']);

/* THE TWO CUE SOURCES MUST NOT OVERLAP. A prescribed slot's cue is the one the card renders; a copy
 * in alt-cues.json would be a second copy of the same fact, silently diverging. Refuse rather than
 * pick a winner. */
const prescribed = new Set();
for (const d of Object.values(program.days ?? {})) {
  for (const b of d.blocks ?? []) for (const e of b.exercises ?? []) prescribed.add(e.id);
}
const slotCue = new Map();
for (const d of Object.values(program.days ?? {})) {
  for (const b of d.blocks ?? []) {
    for (const e of b.exercises ?? []) if (typeof e.cue === 'string') slotCue.set(e.id, e.cue);
  }
}
const cueFor = (id) => altCues[id] ?? slotCue.get(id);

const overlap = [...prescribed].filter((id) => altCues[id]);
if (overlap.length) {
  console.error('content/gym/alt-cues.json carries a cue for exercise(s) the programme PRESCRIBES: '
    + `${overlap.join(', ')}. The slot in program.json is the one the card renders, so this is a `
    + 'second copy of a cue that will diverge. Delete them from alt-cues.json.');
  process.exit(1);
}

const noCue = new Set();

function altsFor(slotId) {
  const home = byId.get(slotId);
  if (!home) return [];
  return cat.movements[home.mk].variants
    .filter((v) => v.id !== home.v.id)
    .filter((v) => {
      const cue = cueFor(v.id);
      if (typeof cue === 'string' && cue.length > 20) return true;
      noCue.add(v.id);
      return false;
    })
    .filter((v) => !NOT_LIFTING.has(v.zone))
    .filter((v) => !(v.needsFloor && !hasFloor(v.zone)))
    .map((v) => {
      const a = { id: v.id, name: v.name, zone: v.zone, station: v.station ?? null, cue: cueFor(v.id) };
      if (v.progression) a.progression = v.progression;
      if (v.needsFloor) a.needsFloor = true;
      /* A TIMED ALT MUST DECLARE bodyweight EXPLICITLY, true or false: validate.mjs says so, because
         a timed set with no answer to "am I holding anything" cannot suggest a load or count as
         progressed. Derived from `loadable`, which is the same fact stated the other way round:
         loadable means weight gets added, so not loadable means bodyweight. `db-hold` is the case
         that found this, three times in one run. */
      if (v.timed) {
        a.timed = true;
        a.bodyweight = v.bodyweight ?? !v.loadable;
      } else if (v.bodyweight) {
        a.bodyweight = true;
      }
      return a;
    });
}

let slots = 0, changed = 0, totalAlts = 0;
const rows = [];
for (const [dayKey, day] of Object.entries(program.days ?? {})) {
  for (const b of day.blocks ?? []) {
    for (const ex of b.exercises ?? []) {
      if (ex.log === false) continue;
      slots++;
      const next = altsFor(ex.id);
      const had = (ex.alts ?? []).map((a) => a.id).join(',');
      const now = next.map((a) => a.id).join(',');
      if (had !== now) changed++;
      totalAlts += next.length;
      rows.push({ dayKey, id: ex.id, was: ex.alts?.length ?? 0, will: next.length, names: next.map((a) => a.name) });
      if (write) {
        if (next.length) ex.alts = next;
        else delete ex.alts;
      }
    }
  }
}

console.log(`${programPath}`);
console.log('Swap options derived from the movement grouping in movements.json.\n');
console.log('day'.padEnd(11) + 'exercise'.padEnd(30) + 'now'.padStart(4) + 'derived'.padStart(9) + '   options');
console.log('-'.repeat(110));
for (const r of rows) {
  console.log(r.dayKey.padEnd(11) + r.id.padEnd(30) + String(r.was).padStart(4) + String(r.will).padStart(9)
    + '   ' + (r.names.join(', ') || 'none in the catalogue'));
}
console.log('');
const bare = rows.filter((r) => r.will === 0);
console.log(`${slots} logged slot(s), ${totalAlts} alt entries derived, ${changed} slot(s) would change.`);
if (noCue.size) {
  console.log(`${noCue.size} sibling variant(s) were skipped because no cue text exists for them anywhere: `
    + `${[...noCue].sort().join(', ')}.`);
  console.log('Each is a real option in his gym with nothing written about how to do it. Draft a cue from');
  console.log('a source and add it to alt-cues.json to offer it; do not invent one to fill the list.');
}
if (bare.length) {
  console.log(`${bare.length} slot(s) have NO alternative the catalogue can offer: ${bare.map((r) => r.id).join(', ')}.`);
  console.log('That is a real state, not an error: some jobs have one way of being done in this gym.');
}

if (write) {
  writeFileSync(programPath, JSON.stringify(program, null, 2) + '\n');
  console.log(`\nwrote ${programPath}. Run node content/gym/validate.mjs and the gym probe.`);
} else {
  console.log('\nRun again with --write to apply. Nothing has been written.');
}
