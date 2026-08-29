/* REGRESSION SUITE FOR THE PROGRESSION ENGINE.
 *
 *   node --experimental-strip-types src/lib/gym/progression.test.ts
 *
 * `suggest` decides what goes on the bar. It is the single highest-consequence pure function on this
 * site and it had NO tests, which is how three separate defects reached his cards at once and were
 * found by an audit reading the code rather than by anything running:
 *
 *   The bodyweight branch returned `reps: top` once he passed the top of the range, so the card asked
 *   him to do FEWER than he had just done, and the app wrote that number into his log. Straight from
 *   gym_set: box-jump 2026-08-27, three sets of 10 reps, suggested_reps 5, three times. Farmer carry
 *   2026-08-25, 130 seconds, suggested 40.
 *
 *   The stall detector counted a DATE as a session. Two dates holding one set each plus one holding
 *   three read as "stalled 3 sessions", and the front squat card said deload to 105 two days after he
 *   did three sets of eight against a prescription of two. /gym/log exists precisely because his
 *   sessions are under-logged: 31 lifting sessions in June and July have no app rows at all.
 *
 *   The weighted branch always ADDED an increment, including on the assisted pull-up, which logs
 *   COUNTERWEIGHT. Its own cue on the same card reads "it is the one number here that should go DOWN
 *   over time", so the app was about to print "+10 lb" directly above that sentence.
 *
 * EVERY CASE USES HIS REAL LOGGED NUMBERS, because a fixture invented to suit the fix proves the fix
 * agrees with itself. And every fix is paired with the case that would catch it OVERSHOOTING: the
 * deload must still fire on three genuine sessions, and an ordinary lift must still go up. A gate
 * watched refusing and never watched permitting is a gate that might refuse everything.
 */
/* THE EXTENSION IS REQUIRED, and it is the same trap `coverage.mts` documents from the other side.
 * Node's own ESM resolver does not guess extensions, so a bare './progression' specifier throws
 * ERR_MODULE_NOT_FOUND when node runs this file directly. tsconfig carries
 * `allowImportingTsExtensions` for exactly this, added when coverage.mts had to be runnable without a
 * build step. Typecheck and Next both accept it; node requires it. */
import { suggest } from './progression.ts';
import type { LastSession, PlanInput, Suggestion } from './progression.ts';

let failed = 0;

function check(name: string, got: Suggestion, want: (s: Suggestion) => boolean, expected: string) {
  if (want(got)) {
    console.log(`ok    ${name}`);
    return;
  }
  failed++;
  console.log(`FAIL  ${name}`);
  console.log(`        expected ${expected}`);
  console.log(`        got weight=${got.weight} reps=${got.reps}`);
  console.log(`        ${got.reason}`);
}

const sets = (n: number, weight: number | null, reps: number) =>
  Array.from({ length: n }, () => ({ weight, reps }));
const session = (date: string, n: number, weight: number | null, reps: number): LastSession =>
  ({ date, sets: sets(n, weight, reps) });
const plan = (p: PlanInput): PlanInput => ({ today: '2026-08-28', ...p });

/* ---- the bodyweight and timed branch ---------------------------------------------------------- */

check(
  'box jump: 10 reps done, never suggest fewer than 10',
  suggest(session('2026-08-27', 3, null, 10), plan({ type: 'bodyweight', targetReps: 3 })),
  (s) => s.reps >= 10,
  'reps at or above 10, his own last session (the card printed 5)',
);

check(
  'farmer carry: 130 seconds done, never suggest 42',
  suggest(session('2026-08-25', 2, 55, 130), plan({ type: 'timed', targetReps: 40 })),
  (s) => s.reps >= 130,
  'reps at or above 130 (the card printed 42 after the unit fix)',
);

check(
  'pushup: still asks for one more when he is INSIDE the range',
  suggest(session('2026-08-25', 3, null, 9), plan({ type: 'bodyweight', targetReps: 8 })),
  (s) => s.reps === 10,
  'reps 10, one above his 9: the fix must not flatten normal progression',
);

/* ---- the stall detector ------------------------------------------------------------------------ */

check(
  'front squat: two single-set days must not read as a stall',
  suggest(session('2026-08-27', 3, 115, 8), plan({
    type: 'weighted', targetReps: 8, increment: 5,
    recent: [session('2026-08-27', 3, 115, 8), session('2026-08-23', 1, 115, 8), session('2026-08-18', 1, 115, 8)],
  })),
  (s) => s.weight === 115,
  'hold at 115 (the card said deload to 105)',
);

check(
  'front squat: three FULL stalled sessions still deload',
  suggest(session('2026-08-27', 3, 115, 8), plan({
    type: 'weighted', targetReps: 8, increment: 5,
    recent: [session('2026-08-27', 3, 115, 8), session('2026-08-23', 3, 115, 8), session('2026-08-18', 3, 115, 8)],
  })),
  (s) => s.weight === 105,
  'deload to 105: the fix must not disable the detector',
);

/* ---- assistance lifts -------------------------------------------------------------------------- */

check(
  'assisted pull-up: hitting the top takes counterweight OFF',
  suggest(session('2026-08-22', 3, 40, 8), plan({
    type: 'weighted', targetReps: 6, increment: 10, assistance: true,
  })),
  (s) => s.weight === 30,
  '30 lb of assistance, down from 40 (it suggested 50, which is easier)',
);

check(
  'assisted pull-up: never below one increment, because zero is a different exercise',
  suggest(session('2026-08-22', 3, 10, 8), plan({
    type: 'weighted', targetReps: 6, increment: 10, assistance: true,
  })),
  (s) => s.weight === 10,
  '10, not 0: an unassisted pull-up is a milestone he reaches on purpose',
);

check(
  'back squat: an ordinary lift still goes UP',
  suggest(session('2026-08-22', 3, 155, 7), plan({ type: 'weighted', targetReps: 5, increment: 5 })),
  (s) => s.weight === 160,
  '160: the assistance flag must not leak into normal lifts',
);

/* ---- the rack, which is a list and not a step size --------------------------------------------- */

/** His rack, as he described it on 2026-08-28. Duplicated here ON PURPOSE rather than imported from
 *  equipment.json: a test that reads the same file as the code under test asserts only that the code
 *  agrees with itself, which is the fault `content/kitchen/validate.mjs` had for a week when it
 *  compared a step's text against a sourceText an agent had typed into the same object. */
const RACK = [10, 12.5, 15, 17.5, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];

check(
  'dumbbell at 12.5: the next rung is 15, not the 20 that rounding gave',
  suggest(session('2026-08-25', 3, 12.5, 14), plan({
    type: 'weighted', targetReps: 12, increment: 5, ladder: RACK,
  })),
  (s) => s.weight === 15,
  '15, a dumbbell that is on the rack. +5 then round-to-nearest-5 returned 20 and skipped two',
);

check(
  'dumbbell at 17.5: still 2.5 lb steps below 20',
  suggest(session('2026-08-25', 3, 17.5, 14), plan({
    type: 'weighted', targetReps: 12, increment: 5, ladder: RACK,
  })),
  (s) => s.weight === 20,
  '20',
);

check(
  'dumbbell at 20: the step becomes 5 without anything being told it changed',
  suggest(session('2026-08-25', 3, 20, 14), plan({
    type: 'weighted', targetReps: 12, increment: 5, ladder: RACK,
  })),
  (s) => s.weight === 25,
  '25, because 22.5 is not on this rack',
);

check(
  'dumbbell at 90: the answer is 90, not a dumbbell that does not exist',
  suggest(session('2026-08-25', 3, 90, 14), plan({
    type: 'weighted', targetReps: 12, increment: 5, ladder: RACK,
  })),
  (s) => s.weight === 90,
  '90, the heaviest in the building. 95 sends him looking for something that is not there',
);

check(
  'an unsorted rack still answers correctly, because the engine sorts what it is given',
  suggest(session('2026-08-25', 3, 12.5, 14), plan({
    type: 'weighted', targetReps: 12, increment: 5, ladder: [20, 10, 17.5, 15, 12.5],
  })),
  (s) => s.weight === 15,
  '15: read positionally, an unsorted array returns a wrong weight rather than throwing',
);

check(
  'a deload lands ON a rung, and never rounds UPWARD off one',
  suggest(session('2026-08-27', 3, 30, 8), plan({
    type: 'weighted', targetReps: 8, increment: 5, ladder: RACK,
    recent: [session('2026-08-27', 3, 30, 8), session('2026-08-23', 3, 30, 8), session('2026-08-18', 3, 30, 8)],
  })),
  (s) => s.weight === 25,
  '25: 90% of 30 is 27, and the rung at or below it is 25. A deload that rounds up is not one',
);

check(
  'no ladder supplied: the barbell and the cable stacks are untouched',
  suggest(session('2026-08-22', 3, 155, 7), plan({ type: 'weighted', targetReps: 5, increment: 5 })),
  (s) => s.weight === 160,
  '160, the same answer as before the ladder existed',
);

check(
  'a 2.5 lb cable stack with no ladder still steps by 2.5',
  suggest(session('2026-08-22', 3, 80, 14), plan({ type: 'weighted', targetReps: 12, increment: 2.5 })),
  (s) => s.weight === 82.5,
  '82.5: the pin positions the single increment already describes correctly',
);

/* ---- a rep count a person set, which the engine may not move ----------------------------------- */

check(
  'box jump: a fixed rep count holds at 3 even though his log says 10',
  suggest(session('2026-08-27', 3, null, 10), plan({ type: 'bodyweight', targetReps: 3, fixedReps: true })),
  (s) => s.reps === 3,
  '3. The "never suggest fewer than he did" floor is the right rule everywhere except here, where '
  + 'his 10 is the thing being corrected: "I never knew 3 reps was a thing"',
);

check(
  'box jump: the card says WHY it is three, because the bare number is what he read as a floor',
  suggest(session('2026-08-27', 3, null, 10), plan({ type: 'bodyweight', targetReps: 3, fixedReps: true })),
  (s) => /SETS/.test(s.reason) && /fast/.test(s.reason),
  'a reason naming sets as the lever and speed as the point',
);

check(
  'lateral bound: a per-side prescription says per side, and does not report half the work',
  suggest(session('2026-08-18', 3, null, 6), plan({
    type: 'bodyweight', targetReps: 4, fixedReps: true, repSuffix: '/side',
  })),
  (s) => /4\/side/.test(s.reason) && !/4 a set/.test(s.reason),
  '"4/side", not "4 a set". The card said 4 a set under a prescription reading 3x4/side',
);

check(
  'box jump: no suffix, so the sentence stays the plain one',
  suggest(session('2026-08-27', 3, null, 10), plan({ type: 'bodyweight', targetReps: 3, fixedReps: true })),
  (s) => /3 a set/.test(s.reason),
  '"3 a set": the unit fix must not leave a dangling suffix on a lift that has none',
);

check(
  'box jump: a long logging gap does not turn it into a probe either',
  suggest(session('2026-06-01', 3, null, 10), plan({
    type: 'bodyweight', targetReps: 3, fixedReps: true, today: '2026-08-29',
  })),
  (s) => s.reps === 3,
  '3: the gap probe adds a rep, which is the same defect arriving by another branch',
);

check(
  'a bodyweight lift WITHOUT the flag still progresses on reps',
  suggest(session('2026-08-25', 3, null, 9), plan({ type: 'bodyweight', targetReps: 8 })),
  (s) => s.reps === 10,
  '10: the flag must not leak into the pushup',
);

console.log('-'.repeat(70));
console.log(`22 cases, ${failed} failed`);
process.exit(failed ? 1 : 0);
