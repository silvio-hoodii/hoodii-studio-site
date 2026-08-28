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

console.log('-'.repeat(70));
console.log(`8 cases, ${failed} failed`);
process.exit(failed ? 1 : 0);
