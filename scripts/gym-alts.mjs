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
 * A SWAP IS NOT LIMITED TO THE SLOT'S OWN MOVEMENT GROUP, AND IT WAS UNTIL 2026-09-01. That
 * restriction is the direct cause of his complaint that day: *"there's still I feel exercises that are
 * not even in the list for some reason. I don't want to have to point to an exercise... put it there,
 * paste it there and say, okay, that's done."*
 *
 * Because this script only walked the group of each PRESCRIBED slot, a movement group with no
 * prescribed member could never appear anywhere, cue or no cue. Five relevant groups were in that
 * state, measured the same day: hip-extension-isolation (holding the loadable Smith hip thrust HE
 * ASKED ABOUT BY NAME), knee-flexion, adduction, hip-abduction, and plyo-lateral. The swap control
 * physically could not offer any of them. He was right that the selection was narrower than his gym,
 * and the narrowing was in this file.
 *
 * THE RULE NOW: same group, OR every primary mover of the candidate is also a primary mover of the
 * slot. A glutes-only exercise stands in for a glutes-and-quads lift, because it trains a subset of
 * what the slot trains. The reverse is refused: a quads-and-adductors exercise is not a stand-in for
 * a glutes-only slot, because it brings work the slot did not ask for and would quietly change the
 * day's dose. Derived from the catalogue's own muscle attributions, so it cannot go stale separately.
 *
 * `movements.json` groups variants by JOB: the whole point of a
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
    const entry = { mk, v, primary: v.primary ?? m.primary ?? [] };
    byId.set(v.id, entry);
    for (const a of v.aliases ?? []) byId.set(a, entry);
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

/* THE PRESCRIPTION AN EXERCISE ALREADY CARRIES SOMEWHERE IN THE WEEK, if it is prescribed at all.
 * Preferred over anything parsed out of cue prose, because it is the real thing rather than a
 * regex's reading of a sentence. It matters for the per-side case: the back squat slot is `3x5` and
 * a Bulgarian split squat standing in for it is per LEG, so without its own numbers the card would
 * read "Bulgarian Split Squat 3x5" and ask for half the work. */
const slotPrescription = new Map();
for (const d of Object.values(program.days ?? {})) {
  for (const b of d.blocks ?? []) {
    for (const e of b.exercises ?? []) {
      if (!slotPrescription.has(e.id) && e.sets && e.reps) {
        slotPrescription.set(e.id, { sets: e.sets, reps: e.reps, rest: e.rest });
      }
    }
  }
}

const overlap = [...prescribed].filter((id) => altCues[id]);
if (overlap.length) {
  console.error('content/gym/alt-cues.json carries a cue for exercise(s) the programme PRESCRIBES: '
    + `${overlap.join(', ')}. The slot in program.json is the one the card renders, so this is a `
    + 'second copy of a cue that will diverge. Delete them from alt-cues.json.');
  process.exit(1);
}

const noCue = new Set();

/* HOW MANY SETS OF EACH EXERCISE HE HAS ACTUALLY PERFORMED, used to RANK the options.
 *
 * WHY A CAP AND A RANKING EXIST AT ALL. The cross-group rule above, on its first run, put 21 swap
 * options on the box jump card and 21 on each Bulgarian split squat. That is the opposite failure to
 * the one it fixed, and he has already named it: gym note #12, "Walls of text again why do I need all
 * this, just leave the cue and thats it, it can even be hidden". Fixing "too narrow" by shipping
 * "too wide" is not a fix. For scale, the programme this replaced carried 82 alt entries across about
 * 30 slots, roughly 3 a card.
 *
 * THE RANK IS: has he done it, then is it the same movement group, then can it be loaded, then name.
 * The first key is the one that matters, because a swap he has already performed is a swap he will
 * take. PERFORMED is `done = true OR reps > 0`, the definition src/lib/gym/db.ts uses everywhere.
 *
 * NEON IS OPTIONAL HERE. This script writes content and is not a gate, so reading his log is the same
 * pattern check-ladder.mjs uses. With no connection string it ranks on the two offline keys and SAYS
 * SO on stdout, rather than silently producing a different ordering than the last run did. */
async function loadHistory() {
  try {
    const env = {};
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    const url = env.GYM_DATABASE_URL || env.KITCHEN_DATABASE_URL;
    if (!url) return { rows: new Map(), live: false };
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    const rows = await sql`
      select exercise_id, count(*)::int as n from gym_set
       where done = true or (reps is not null and reps > 0)
       group by exercise_id`;
    return { rows: new Map(rows.map((r) => [r.exercise_id, r.n])), live: true };
  } catch {
    return { rows: new Map(), live: false };
  }
}
const history = await loadHistory();

/** Six. More than the three the old hand-typed lists carried, few enough to read on a phone. */
const MAX_ALTS = 6;

/* EVERY VARIANT, WITH ITS GROUP, so a candidate is not limited to the slot's own group. */
const ALL = [];
for (const [mk, m] of Object.entries(cat.movements)) {
  for (const v of m.variants) ALL.push({ mk, v, primary: v.primary ?? m.primary ?? [] });
}

/* A SWAP INHERITS THE SLOT'S NUMBERS, so the two must be the same SHAPE of prescription.
 *
 * `effectiveExercise` in src/lib/gym/program-shared.ts is `{ ...ex, ...swap }`: every field the alt
 * does not carry comes from the slot. Inside one movement group that was harmless, because the
 * variants of a job have the same shape. The cross-group rule broke it on the first screenshot, and
 * the card read:
 *
 *     BB Back Squat        3x3/side . 60s rest        BW
 *
 * That is the lateral bound's prescription with the back squat's name on it: three reps per side,
 * bodyweight, on a barbell lift. Nothing in any gate could see it. Reading the rendered screen could,
 * which is the third time this session that has been the gate that caught something.
 *
 * SO A CANDIDATE MUST MATCH THE SLOT ON `loadable`. A bodyweight slot offers bodyweight options and a
 * loaded slot offers loaded ones, which is also the honest reading of a swap: what he reaches for when
 * the rack is taken is another way to load the same pattern, not a different kind of set. The Smith
 * hip thrust survives this because the lifts it stands in for are loaded too.
 *
 * AND WHERE THE CUE STATES A PRESCRIPTION, the alt carries its own, so the numbers on the card belong
 * to the exercise named above them. Most of the recovered cues end in one ("3x15 each side"). */
const PRESCRIPTION = /(\d+)\s*x\s*(\d+)\s*(s\b|seconds?\b)?\s*((?:each|per)\s+side|\/side|\/leg|\/arm)?/i;
function prescriptionFromCue(cue) {
  const m = PRESCRIPTION.exec(String(cue ?? ''));
  if (!m) return null;
  const sets = Number(m[1]);
  const n = Number(m[2]);
  if (!Number.isFinite(sets) || !Number.isFinite(n) || sets < 1 || sets > 8) return null;
  const perSide = Boolean(m[4]);
  const timed = Boolean(m[3]);
  return { sets, reps: `${n}${timed ? 's' : ''}${perSide ? '/side' : ''}` };
}

/** Does `cand` train the same thing this slot trains, or a subset of it? */
function sameJob(home, cand) {
  /* Same movement group is the strongest form of "same job": that is what a group IS. */
  if (cand.mk === home.mk) return true;
  /* OTHERWISE: every primary mover of the candidate must be a primary mover of the slot. A glutes-only
     exercise is a legitimate stand-in for a glutes-and-quads lift; a quads-and-adductors exercise is
     NOT a stand-in for a glutes-only one, because it brings work the slot did not ask for. */
  const homePri = new Set(home.primary);
  return cand.primary.length > 0 && cand.primary.every((m) => homePri.has(m));
}

function altsFor(slotId) {
  const home = byId.get(slotId);
  if (!home) return [];
  const ranked = ALL
    .filter((c) => sameJob(home, c))
    .map((c) => c.v)
    .filter((v) => v.id !== home.v.id)
    .filter((v) => {
      const cue = cueFor(v.id);
      if (typeof cue === 'string' && cue.length > 20) return true;
      noCue.add(v.id);
      return false;
    })
    .filter((v) => !NOT_LIFTING.has(v.zone))
    .filter((v) => !(v.needsFloor && !hasFloor(v.zone)))
    /* SAME SHAPE OF PRESCRIPTION. See the note above PRESCRIPTION: the alt inherits every number the
       slot has, so a bodyweight slot may only offer bodyweight options and a loaded slot loaded ones.
       Without this the lateral bound card offered a barbell back squat at "3x3/side, BW". */
    .filter((v) => Boolean(v.loadable) === Boolean(home.v.loadable))
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
      /* Its own prescribed numbers first, then anything its cue states, then nothing (inherit). */
      const own = slotPrescription.get(v.id) ?? prescriptionFromCue(cueFor(v.id));
      if (own) {
        a.sets = own.sets;
        a.reps = own.reps;
        if (own.rest) a.rest = own.rest;
      }
      a._rank = [
        -(history.rows.get(v.id) ?? 0),
        byId.get(v.id)?.mk === home.mk ? 0 : 1,
        v.loadable ? 0 : 1,
        v.name,
      ];
      return a;
    })
    .sort((x, y) => {
      for (let i = 0; i < x._rank.length; i += 1) {
        if (x._rank[i] < y._rank[i]) return -1;
        if (x._rank[i] > y._rank[i]) return 1;
      }
      return 0;
    })
    /* TWO OF THE SIX ARE RESERVED FOR SOMETHING HE HAS NEVER DONE, and that reservation is the whole
       point of this change rather than a garnish.
       Ranking purely by logged history put the Smith hip thrust last on every card and the cap then
       cut it, which means the one exercise HE ASKED ABOUT BY NAME on 2026-09-01 would have been
       invisible again after all this work. History-ranking is conservative in exactly the wrong
       direction for a complaint about MISSING exercises: it can only ever surface what he already
       does. So the list is the top four he has performed, plus the best two he has not. */
    .reduce((acc, a) => {
      const done = (history.rows.get(a.id) ?? 0) > 0;
      (done ? acc.done : acc.fresh).push(a);
      return acc;
    }, { done: [], fresh: [] });
  const RESERVED_FOR_NEW = 2;
  const picked = [
    ...ranked.done.slice(0, MAX_ALTS - RESERVED_FOR_NEW),
    ...ranked.fresh.slice(0, RESERVED_FOR_NEW),
  ];
  /* If one side is short, the other fills the gap: a cap is a ceiling, not a quota to pad out. */
  for (const a of [...ranked.done, ...ranked.fresh]) {
    if (picked.length >= MAX_ALTS) break;
    if (!picked.includes(a)) picked.push(a);
  }
  return picked.map(({ _rank, ...rest }) => rest);
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
      rows.push({
        dayKey, id: ex.id, was: ex.alts?.length ?? 0, will: next.length,
        names: next.map((a) => a.name), inherited: next.filter((a) => !a.reps).length,
      });
      if (write) {
        if (next.length) ex.alts = next;
        else delete ex.alts;
      }
    }
  }
}

console.log(`${programPath}`);
console.log(`Swap options derived from movements.json, ranked by what he has performed, capped at ${MAX_ALTS} a card.`);
console.log(history.live
  ? `Ranked against ${history.rows.size} exercises that carry logged sets in gym_set.`
  : 'NO DATABASE REACHED: ranked on movement group and loadability only, so this ordering differs from a run with Neon.');
console.log('');
console.log('day'.padEnd(11) + 'exercise'.padEnd(30) + 'now'.padStart(4) + 'derived'.padStart(9) + '   options');
console.log('-'.repeat(110));
for (const r of rows) {
  console.log(r.dayKey.padEnd(11) + r.id.padEnd(30) + String(r.was).padStart(4) + String(r.will).padStart(9)
    + '   ' + (r.names.join(', ') || 'none in the catalogue'));
}
console.log('');
const bare = rows.filter((r) => r.will === 0);
console.log(`${slots} logged slot(s), ${totalAlts} alt entries derived, ${changed} slot(s) would change.`);
/* WHAT IS STILL INHERITED, reported rather than guessed. An alt with no prescription of its own takes
   the slot's, which is right when the two are the same shape and imprecise when the alt is per-side
   and the slot is not: a back squat slot at 3x5 offering a reverse lunge shows "3x5" where "5 each
   side" is meant. The qualifier is in the cue text, so it is not silent, and inventing a rep count
   for an exercise nothing prescribes and no source states would be worse. Fixed properly by giving
   the exercise a prescription somewhere, or a cue that ends in one. */
const inherited = rows.reduce((a, r) => a + r.inherited, 0);
if (inherited) {
  console.log(`${inherited} alt entr(y/ies) inherit the slot's sets and reps, having none of their own.`);
  console.log('Right where the shapes match, imprecise where the alt is per-side and the slot is not.');
  console.log('The cue carries the qualifier. Give the exercise a prescription to remove the ambiguity.');
}
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
