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
let ran = 0;

function check(name: string, got: Suggestion, want: (s: Suggestion) => boolean, expected: string) {
  ran++;
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
  'an UNLOADED hold: 130 seconds done, never suggest 42',
  suggest(session('2026-08-25', 2, null, 130), plan({ type: 'timed', targetReps: 40 })),
  (s) => s.reps >= 130,
  'reps at or above 130 (the card printed 42 after the unit fix)',
);

/* HIS REAL CARRY, 2026-10-04: 50 lb a hand for 125 s twice on 2026-09-29, prescription 40 s. The card
   read "x 125s" with no weight. A loaded hold past the top earns the next dumbbell and the clock resets,
   which is the weighted lifts' double progression. */
check(
  'farmer carry at 50 lb for 125 s: the next dumbbell, back to 40 s',
  suggest(session('2026-09-29', 2, 50, 125), plan({ type: 'timed', targetReps: 40, ladder: [10, 12.5, 15, 17.5, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90], today: '2026-10-05' })),
  (s) => s.weight === 55 && s.reps === 40,
  '55 lb x 40 s (it printed x 125s with no weight)',
);

check(
  'a loaded hold inside the range shows its load and adds 5 s',
  suggest(session('2026-09-29', 2, 50, 30), plan({ type: 'timed', targetReps: 40, today: '2026-10-05' })),
  (s) => s.weight === 50 && s.reps === 35,
  '50 lb x 35 s: the load stays on the card, the clock moves',
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

/* WAS "the card says WHY it is three", asserting the reason named sets and speed. The four-kinds rule
 * in AGENTS.md (2026-09-15) cut the why off the card: it is a method explanation, and the block `why`
 * and the comment in progression.ts carry it. The card states the count and its unit. */
check(
  'box jump: the card states the count and nothing else',
  suggest(session('2026-08-27', 3, null, 10), plan({ type: 'bodyweight', targetReps: 3, fixedReps: true })),
  (s) => s.reason === '3 a set.',
  '"3 a set." (it carried a sentence about leaving the floor fast)',
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

/* ---- the rung the rep range cannot earn ------------------------------------------------------- */
/* HIS REAL LIFT. `a/db-lateral-raise` at 20 lb, window 12 to 20. Epley: 20 * (1 + 20/30) = 33.3
 * banked; the next dumbbell, 25 lb, demands 25 * (1 + 12/30) = 35.0. Margin -1.7, so topping the
 * range does not earn the jump. check-ladder.mjs exited 1 on this for six of the seven days to
 * 2026-09-04 and its warning went to a log file nobody opens. The fix it suggested, rangeWidth 11,
 * is refused by content/gym/validate.mjs, so the two gates in this repo disagreed and the lift sat
 * broken between them.
 *
 * Both directions are tested: the hold must fire on the FIRST time he tops the range and must get
 * out of the way on the second, or it is a lift that can never go up at all. */

check(
  'lateral raise at 20: the first time he tops the range, hold rather than promote',
  suggest(session('2026-09-03', 3, 20, 20), plan({
    type: 'weighted', targetReps: 12, rangeWidth: 8, increment: 5, ladder: RACK,
    recent: [session('2026-09-03', 3, 20, 20), session('2026-08-30', 3, 20, 16)],
  })),
  (s) => s.weight === 20 && s.reps === 20 && s.reason === 'Do 20 at 20 once more, then 25.',
  '20 lb again at 20 reps, worded as the instruction only: "Do 20 at 20 once more, then 25."',
);

check(
  'lateral raise at 20: the SECOND session at the top does take the jump',
  suggest(session('2026-09-05', 3, 20, 20), plan({
    type: 'weighted', targetReps: 12, rangeWidth: 8, increment: 5, ladder: RACK,
    recent: [session('2026-09-05', 3, 20, 20), session('2026-09-03', 3, 20, 20)],
  })),
  (s) => s.weight === 25,
  '25: a gate watched refusing and never watched permitting is a gate that refuses everything',
);

check(
  'the hold does not touch a lift whose ladder already closes',
  suggest(session('2026-09-03', 3, 185, 7), plan({
    type: 'weighted', targetReps: 5, increment: 5,
    recent: [session('2026-09-03', 3, 185, 7), session('2026-08-30', 3, 185, 5)],
  })),
  (s) => s.weight === 190,
  '190: at 185 lb a 5 lb step is 2.7%, banked 228 against demanded 222. Every barbell lift on the '
    + 'page is in this state and none of them should feel this rule',
);

check(
  'an assisted lift is exempt, because its number goes DOWN',
  suggest(session('2026-09-03', 3, 40, 10), plan({
    type: 'weighted', targetReps: 8, increment: 10, assistance: true, ladder: RACK,
    recent: [session('2026-09-03', 3, 40, 10), session('2026-08-30', 3, 40, 8)],
  })),
  (s) => s.weight != null && s.weight < 40,
  'less counterweight than 40: "the next rung demands a bigger max" is the wrong question on a '
    + 'machine where progress means the number falls',
);

/* ---- the long-gap probe must not climb from a weight he could not make the range at ------------ */
/* HIS REAL BENCH, read off the live plan route on 2026-09-06: last logged 2026-08-04 as 185x3, 185x3,
 * 165x8, range 6 to 10, 33 days ago. The old branch printed "probe: 185 up one step to 190" for six
 * reps. Both directions: the hold must fire here, and a gap after a session INSIDE the range must
 * still probe upward, or the probe is gone. */

check(
  'bench after 33 days, working weight below the range: start where he last made the range, not a step above',
  suggest({ date: '2026-08-04', sets: [{ weight: 185, reps: 3 }, { weight: 185, reps: 3 }, { weight: 165, reps: 8 }] },
    plan({ type: 'weighted', targetReps: 6, rangeWidth: 4, increment: 5, today: '2026-09-06' })),
  (s) => s.weight === 165 && s.reps === 6,
  '165 x 6: the heaviest weight he hit six or more at. The card said 190 x 6 above a 185 x 3',
);

/* THE UPWARD PROBE WAS REMOVED ON 2026-10-04, on his 2026-09-01 ruling (form over heavier). This case
   used to assert the step up; it now asserts the hold, and the next one is his real press. */
check(
  'a long gap after a session inside the range starts where he was, no step up',
  suggest(session('2026-08-04', 3, 165, 8), plan({ type: 'weighted', targetReps: 6, rangeWidth: 4, increment: 5, today: '2026-09-06' })),
  (s) => s.weight === 165 && s.reps === 6,
  '165 x 6: the weight he left at',
);

check(
  'standing DB press, 32 days after 60x9/9: the card offers 60, not 65',
  suggest({ date: '2026-09-03', sets: [{ weight: 60, reps: 9 }, { weight: 60, reps: 9 }] },
    plan({ type: 'weighted', targetReps: 8, rangeWidth: 4, today: '2026-10-05', ladder: [10, 12.5, 15, 17.5, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90] })),
  (s) => s.weight === 60,
  '60 (it printed "probe: 60 up one step to 65", above his seated 60x6/7/6 of 2026-09-28)',
);

/* ---- the working weight of a ramp ---------------------------------------------------------------- */
/* HIS REAL BENCH, 2026-10-03: 135x12, 155x9, 175x5, range 6 to 10. Every weight once, so the old
   heavier tie-break made 175 the working weight and the card asked for 175 x 6, his estimated max. */
const OCT3_BENCH: LastSession = { date: '2026-10-03', sets: [{ weight: 135, reps: 12 }, { weight: 155, reps: 9 }, { weight: 175, reps: 5 }] };
check(
  'bench 135x12, 155x9, 175x5: the working weight is 155, not the single top set',
  suggest(OCT3_BENCH, plan({ type: 'weighted', targetReps: 6, rangeWidth: 4, increment: 5, today: '2026-10-05', recent: [OCT3_BENCH] })),
  (s) => s.weight === 155 && s.reps === 10,
  '155 x 10: hold 155, build from his 9 (it printed 175 x 6)',
);

check(
  'a weight done for two sets still beats a heavier single set',
  suggest({ date: '2026-10-03', sets: [{ weight: 155, reps: 8 }, { weight: 155, reps: 7 }, { weight: 175, reps: 6 }] },
    plan({ type: 'weighted', targetReps: 6, rangeWidth: 4, increment: 5, today: '2026-10-05' })),
  (s) => s.weight === 155,
  '155: two sets at 155 are the work, one set at 175 is a top single',
);

check(
  'a ramp where nothing reached the range keeps the heaviest',
  suggest({ date: '2026-10-03', sets: [{ weight: 165, reps: 5 }, { weight: 185, reps: 3 }] },
    plan({ type: 'weighted', targetReps: 6, rangeWidth: 4, increment: 5, today: '2026-10-05' })),
  (s) => s.weight === 185,
  '185 held, the old behaviour where no set made the range',
);

/* ---- the first weight of a lift he has never logged ---------------------------------------------- */
check(
  'a slot with a first weight shows it the first time',
  suggest(null, plan({ type: 'weighted', targetReps: 10, firstWeight: { weight: 70, say: 'First time: 70 lb.' } })),
  (s) => s.weight === 70 && s.reps === 10 && s.reason === 'First time: 70 lb.',
  '70 x 10 with the slot\'s own sentence',
);

check(
  'a first weight is ignored once there is history',
  suggest(session('2026-10-01', 3, 80, 10), plan({ type: 'weighted', targetReps: 10, rangeWidth: 4, today: '2026-10-05', firstWeight: { weight: 70, say: 'First time: 70 lb.' } })),
  (s) => s.weight === 80,
  '80, his own log',
);

/* ---- the 2026-09-27 audit, run against this engine with edge cases -------------------------------
 * Each case is the audit's own input. Where the fix lives outside the engine (the assisted flag, the
 * cable increment) the case supplies what the plan route now derives and asserts what the engine does
 * with it. */

const DB = [5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const logged = (date: string, rows: [number | null, number][]): LastSession =>
  ({ date, sets: rows.map(([weight, reps]) => ({ weight, reps })) });
const TODAY = '2026-09-27';

check(
  'a weighted lift logged with no weight asks for the weight, not "at null"',
  suggest(logged('2026-09-20', [[null, 8], [null, 8], [null, 8]]), { targetReps: 8, rangeWidth: 2, today: TODAY, recent: [] }),
  (s) => s.weight === null && s.reason === 'First time: log your working weight.',
  '"First time: log your working weight." (it printed "Got 8/8/8 at null: hold, build to 10")',
);

check(
  'a weighted lift with no weight after a long gap does not say "Start at 0"',
  suggest(logged('2026-08-01', [[null, 8], [null, 8]]), { targetReps: 8, today: TODAY, recent: [] }),
  (s) => s.weight === null && s.reason === 'First time: log your working weight.',
  'the first-time line (it printed "Start at 0")',
);

check(
  'a weight of 0 on a weighted lift is no weight',
  suggest(logged('2026-08-01', [[0, 10], [0, 10]]), { targetReps: 8, today: TODAY, recent: [] }),
  (s) => s.weight === null && /First time/.test(s.reason),
  'the first-time line, not a probe from 0',
);

check(
  'the heaviest dumbbell at the top of the range holds at the top, never fewer reps at the same weight',
  suggest(logged('2026-09-20', [[90, 20], [90, 20], [90, 20]]), {
    targetReps: 12, rangeWidth: 8, ladder: DB, today: TODAY,
    recent: [logged('2026-09-20', [[90, 20], [90, 20], [90, 20]]), logged('2026-09-13', [[90, 20], [90, 20]])],
  }),
  (s) => s.weight === 90 && s.reps === 20 && !/up to/.test(s.reason),
  '90 x 20, held (it printed "up to 90, the top of the rack" with reps back to 12)',
);

check(
  'an assisted lift never deloads, because less counterweight is harder',
  suggest(logged('2026-09-20', [[40, 6], [40, 6], [40, 6]]), {
    targetReps: 6, rangeWidth: 2, assistance: true, today: TODAY,
    recent: [logged('2026-09-20', [[40, 6], [40, 6], [40, 6]]), logged('2026-09-16', [[40, 6], [40, 6]]), logged('2026-09-12', [[40, 7], [40, 6]])],
  }),
  (s) => s.weight === 40 && !/deload/i.test(s.reason),
  '40, hold and build (a "deload" to 35 is a HARDER set on this machine)',
);

check(
  'the lightest counterweight holds, and never says "take 0 lb off"',
  suggest(logged('2026-09-20', [[10, 8], [10, 8], [10, 8]]), {
    targetReps: 6, rangeWidth: 2, assistance: true, increment: 10, today: TODAY,
    recent: [logged('2026-09-20', [[10, 8], [10, 8], [10, 8]])],
  }),
  (s) => s.weight === 10 && s.reps === 8 && !/take 0/.test(s.reason),
  '10 x 8, held',
);

check(
  'a logged warm-up set does not drag the suggestion down to it',
  suggest(logged('2026-09-20', [[95, 5], [135, 8]]), { targetReps: 8, rangeWidth: 2, today: TODAY, recent: [] }),
  (s) => s.weight === 135,
  '135, the work weight (a tie went to the lighter 95)',
);

check(
  'a stall in older sessions does not deload a lift he has since moved up on',
  suggest(logged('2026-09-24', [[125, 8]]), {
    targetReps: 8, rangeWidth: 4, today: TODAY,
    recent: [logged('2026-09-24', [[125, 8]]), logged('2026-09-20', [[115, 8], [115, 8]]), logged('2026-09-16', [[115, 8], [115, 8]]), logged('2026-09-12', [[115, 9], [115, 8]])],
  }),
  (s) => s.weight === 125 && !/deload/i.test(s.reason),
  '125, hold (it said deload to 105 the week he moved to 125)',
);

check(
  'a timed hold steps by 5 seconds and is not told to add a rep',
  suggest(logged('2026-09-20', [[null, 20], [null, 25]]), { targetReps: 30, type: 'timed', repSuffix: 's/side', today: TODAY, recent: [] }),
  (s) => s.reps === 25 && !/rep/.test(s.reason) && /5 s/.test(s.reason),
  '25 s, "add 5 s" (it said "add a rep" and asked for 21)',
);

check(
  'a bodyweight lift below the range still adds one rep',
  suggest(logged('2026-09-20', [[null, 3], [null, 4]]), { targetReps: 10, type: 'bodyweight', today: TODAY, recent: [] }),
  (s) => s.reps === 4 && /add a rep/.test(s.reason),
  '4, one above his worst set',
);

check(
  'a working weight he could not make the range at is never stepped up',
  suggest(logged('2026-09-20', [[185, 3], [185, 3], [165, 8]]), { targetReps: 6, rangeWidth: 4, today: TODAY, recent: [] }),
  (s) => s.weight != null && s.weight <= 185,
  '185 or less: he made 3 reps there',
);

check(
  'a cable stack given its 2.5 lb step moves by 2.5',
  suggest(logged('2026-09-20', [[102.5, 10], [102.5, 10], [102.5, 10]]), {
    targetReps: 8, rangeWidth: 2, increment: 2.5, today: TODAY,
    recent: [logged('2026-09-20', [[102.5, 10], [102.5, 10], [102.5, 10]]), logged('2026-09-13', [[102.5, 10], [102.5, 10]])],
  }),
  (s) => s.weight === 105,
  '105 (with the default 5 it asked for 110, a pin two steps up)',
);

console.log('-'.repeat(70));
console.log(`${ran} cases, ${failed} failed`);
process.exit(failed ? 1 : 0);
