#!/usr/bin/env node
/* Run every gate, capture every exit code, and print ONE unambiguous line.
 *
 * WHY THIS EXISTS. An audit of every archived handoff on 2026-08-17 found seven classes of failure
 * that were declared fixed and then happened again. This file kills the one with the dumbest cause
 * and the worst blast radius:
 *
 *   2026-08-11  a piped command swallowed a nonzero exit code and a real lint error reached production
 *   2026-08-13  the ADVERSARIAL VERIFIER built to catch that made the same `$?`-through-a-pipe mistake
 *   2026-08-16  "I pushed it because I read `pnpm build | tail -6` as green", shipping a failed build
 *   2026-08-17  a refusal test printed `exit=0` because `$?` belonged to `tail`, not to the script
 *
 * Four instances, and the fix each time was the sentence "capture the exit code first, then print",
 * which is a rule asking whoever is at the keyboard to remember. `.agents/ENGINEERING.md` says a rule
 * that does not execute is decoration, and this one was decoration four times.
 *
 * THE MECHANISM IS THAT THERE IS NOTHING LEFT TO PIPE. The output is short enough to read whole, so
 * nobody reaches for `| tail`. The last line is either GREEN or RED and says which gate failed. The
 * process exit code agrees with that line, so both readings give the same answer.
 *
 * Deliberately NOT wired into `pnpm build`. This RUNS the build. Its job is to be the thing a person
 * or an agent types before pushing, in place of four commands whose exit codes have to be watched.
 *
 *   node scripts/verify.mjs           # the five gates
 *   node scripts/verify.mjs --probe <base-url>   # and drive the real kitchen pages in a browser
 */
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const probeAt = argv.includes('--probe') ? (argv[argv.indexOf('--probe') + 1] || 'http://localhost:3007') : null;

/* `pnpm install --frozen-lockfile` is first and is not optional. On 2026-08-09 a dependency was
 * removed by editing package.json directly, every local command passed because node_modules was
 * already correct, and Vercel refused the mismatch and died in 5 seconds without reaching the build. */
const GATES = [
  ['install', 'pnpm', ['install', '--frozen-lockfile']],
  ['typecheck', 'pnpm', ['typecheck']],
  ['lint', 'pnpm', ['lint']],
  ['build', 'pnpm', ['build']],
  /* THE GYM VALIDATOR'S OWN REGRESSION SUITE. Added 2026-08-27 with the `whyHere` gate.
   *
   * A gate that has only ever been seen to PASS has not been seen to work: it may be matching
   * nothing at all. This suite mutates a copy of content/gym in a temp directory and asserts the
   * real validator refuses each mutation, so the checks are watched failing on purpose. It earned
   * its place on its first run by catching a hole in the gate it was written to cover: the
   * verbatim-span check normalised the first character's case in one direction only.
   *
   * Here rather than in `pnpm build`, on purpose. It spawns ten node processes and copies a
   * directory ten times, which belongs in the thing a person types before pushing, not in the
   * deploy path. The pre-push hook runs this file, so it executes on every push either way. */
  ['gym-validator-tests', process.execPath, ['content/gym/validate.test.mjs']],
  /* THE KITCHEN VALIDATOR'S REGRESSION SUITE. Added 2026-08-28, for the same reason and by the same
   * argument as the gym one above, and it earned its place the same way: the bare-colour-endpoint
   * gate it was written around got four out of four wrong on its first live run, and that was caught
   * by a person reading the output. A suite is what makes that not luck. Ten cases, five of which
   * assert the gate lets CORRECT data through, because a checker whose first real finding is false
   * is a checker nobody runs.
   *
   * Here rather than in `pnpm build`, for the gym suite's reason: it copies a directory and spawns a
   * process per case. */
  ['kitchen-validator-tests', process.execPath, ['content/kitchen/validate.test.mjs']],
  /* THE PROGRESSION ENGINE'S OWN SUITE. Added 2026-08-28.
   *
   * `suggest` decides what goes on the bar and had no tests at all, which is how three defects
   * reached his cards at once: a bodyweight branch that asked for FEWER reps than he had just done
   * and wrote the number into his log, a stall detector that read two single-set days as a stall and
   * put "deload to 105" on the front squat, and a weighted branch that ADDED counterweight to the
   * assisted pull-up directly above a cue saying that number should go down.
   *
   * Every case uses his real logged numbers, and each fix is paired with the case that catches it
   * overshooting: the deload must still fire on three genuine sessions, and an ordinary lift must
   * still go up.
   *
   * `--experimental-strip-types` because it imports the .ts directly. No build step, no tsx
   * dependency, same reasoning as `coverage.mts` being .mts. */
  ['progression-tests', process.execPath, ['--experimental-strip-types', 'src/lib/gym/progression.test.ts']],
  /* THE BODY-COMPOSITION SPLIT'S SUITE. Added 2026-08-28, the day the rule it guards was fixed.
   *
   * Two defects, both live on /health until that day. The fat share was `(dFat / dKg) * 100` through
   * `Math.abs()`, which printed 233% over one 2025 window and 119% over the 34-day trend the same
   * tab displays, because a ratio of two deltas stops being a share the moment lean mass moves the
   * other way. And the two endpoints could come off two different machines, which disagree about fat
   * mass by up to 2.45 kg on the same day.
   *
   * Four of the twelve cases assert the rules PERMIT: the ordinary cut must still print 75%, and an
   * all-Watch series must keep its full window. A gate watched refusing and never watched permitting
   * is a gate that might refuse everything, which is how the bare-colour-endpoint check shipped with
   * four false findings out of four on the same day. */
  ['health-split-tests', process.execPath, ['--experimental-strip-types', 'src/lib/health/split.test.ts']],
  /* THE DATE HELPERS BEHIND THE /health HEADLINE. Added 2026-08-28.
   *
   * `spanInMonths` does calendar arithmetic, and its month-end clamp CANNOT FIRE on today's data:
   * without a test it is a line nobody has ever seen work, which is the same shape as the {PEAK_*}
   * gate that sat dead after process.exit() and reported zero failures while checking nothing.
   *
   * The three clamp cases were chosen by running the function with the clamp removed, not by
   * reasoning about it, and the first three written turned out to pass on the broken version. One of
   * the three that survived prints a NEGATIVE remainder unclamped. Watched refusing before trusted. */
  ['format-tests', process.execPath, ['--experimental-strip-types', 'src/lib/format.test.ts']],
  /* THE TWO GYM GATES THAT NOBODY WAS TYPING. Added 2026-08-27.
   *
   * Both existed and both were documented in AGENTS.md as things to run before touching /gym, which
   * is the same enforcement the em dash rule had for four months while being violated constantly.
   * Neither is in `pnpm build`: they read content/gym and nothing else, they take under a second,
   * and they answer questions about the PROGRAMME rather than about the code, so failing a deploy
   * on them would block an unrelated push. Failing a push is exactly right.
   *
   * gym-coverage could not be here until today, because it exited 1 on every run by design. It
   * compares against content/gym/coverage-baseline.json now, so its exit code carries information.
   *
   * Still NOT here: scripts/check-ladder.mjs. It reads his real working weights out of Neon, so it
   * cannot run offline and it can go red with no file edited. The 07:15 sync task runs that one. */
  /* THE COVERAGE INSTRUMENT'S OWN SUITE. Added 2026-08-31, the day two bugs were found in it.
   *
   * `gym-coverage` below is a gate on the PROGRAMME (has a muscle dropped under its dose, has an
   * unsourced lift appeared). It cannot see a defect in the arithmetic doing the grading, and both
   * of the defects were exactly that:
   *
   *   the UNITS ERROR   `perLift.tier` graded a sum of Pelland's `direct` sets against Table 4,
   *                     which is denominated in `fractional`. Both numbers are plausible set counts,
   *                     so the baseline diff, the typecheck and the build all saw nothing.
   *   the TIER GAP      tiers carried a hand-typed `min` AND `max` from the paper's integer bands
   *                     while this file counts sets in halves, so 10.5, 18.5, 29.5, 42.5 and 4.5
   *                     matched no tier and were reported as the LAST tier in the list. Grip and
   *                     forearms sat at 18.5 reading "unclear: insufficient data, or potentially
   *                     less hypertrophy" in production.
   *
   * The load-bearing case reproduces Pelland's own worked example (5 squat + 5 squat + 5 leg press
   * = direct 10, fractional 12.5, frequency 2 and 2.5) from a two-lift catalogue built in the file,
   * so the instrument is checked against the paper rather than against itself. Watched refusing in
   * both directions before being trusted: restoring the max-based lookup fails 10 cases, restoring
   * the units bug fails 2. */
  ['coverage-tests', process.execPath, ['--experimental-strip-types', 'src/lib/gym/coverage.test.ts']],
  /* THE STRENGTH GATE. Added 2026-08-31, after three adversarial reviews found that nothing in this
   * repo graded the one thing the programme is for.
   *
   * gym-targets grades per-muscle fractional sets against Pelland's Table 3, which is HYPERTROPHY.
   * C2 says the project is for lower-body STRENGTH, which is Table 4, denominated per assessed
   * exercise on a scale of 1 to 5+ rather than 4 to 42. Graded only by the hypertrophy gate, a
   * candidate printed GREEN while moving the back squat from 19.5 to 28.5 fractional strength sets
   * against a point of detectable increments of about 4: a 46% regression on the priority, certified.
   *
   * It fails on two things only, and being past the top tier is not one of them. Pelland 4.3 says
   * sets past that point still buy strength, just less than the study could detect, and a fabricated
   * ceiling in this repo already cost 25 to 43 refused partner exercises per block once. So: a
   * priority lift below the minimum effective dose of 1, or a lift moving FURTHER from the optimum
   * than content/gym/strength-baseline.json accepted. A bad-but-stable number is a judgement someone
   * made; a number moving the wrong way is a new decision and needs a person. */
  ['gym-strength', process.execPath, ['--experimental-strip-types', 'scripts/gym-strength.mjs']],

  /* GYM-TARGETS WAS DESCRIBED IN THE COMMENT ABOVE FOR FOUR DAYS AND NEVER PUT IN THIS LIST. The
   * paragraph explaining what it grades, and why it is not sufficient on its own, was written when
   * gym-strength was added; the gate itself was left out of GATES, so nothing ran it and the whole
   * per-muscle band file could have drifted with every check passing. Wired 2026-08-31. This is the
   * meta-law in .agents/ENGINEERING.md in its purest form: a rule that does not execute is
   * decoration, and a paragraph of prose ABOUT a gate is not the gate. */
  /* GYM-TARGETS IS STILL OUT OF THIS LIST AS OF THE 2026-09-01 REBUILD, and it is out on ONE muscle
   * rather than five. The reason changed completely, so read this rather than the earlier version.
   *
   * It was rewritten that morning to grade DIRECT sets against one quoted floor (Iversen 2021: "at
   * least four sets per week" per muscle) instead of fractional sets against sixteen hand-tuned
   * bands. It failed on five muscles that had all passed the old gate. Four of those are fixed by
   * the rebuilt programme, and every muscle in the week now sits at 6 or more direct sets except
   * one:
   *
   *   adductors    3 -> 6      upper-back   3 -> 6      triceps   3 -> 6      front-delts  3 -> 6
   *   erectors     0 -> 0      STILL RED, and the programme is not what is wrong
   *
   * THE ERECTOR FAILURE IS A TRUE STATEMENT ABOUT HIS GYM. Nothing in the catalogue performs spinal
   * extension as its joint action. The one exercise that claimed to, the 45-degree back extension,
   * listed erectors as a prime mover on an override that carried a `jointActionNote` saying nobody
   * had confirmed it. Checked: with the spine held flat the joint action is HIP extension and the
   * erectors work isometrically, which is the same role they have in the squat, the row and the RDL,
   * where this catalogue calls them secondary. The rebuild was one commit from resting on that
   * claim. See the erectors entry in content/gym/targets.json for the whole reasoning.
   *
   * SO THE HONEST STATE IS A GATE THAT FAILS ON ONE MUSCLE, and the fix is a question that has been
   * put to him on the exercise in program.json rather than an edit to a number. IT GOES BACK IN THE
   * MOMENT HE ANSWERS: either the spinal-extension version becomes its own variant and the floor is
   * met, or it does not and the target comes out with his ruling written beside it.
   *
   * DO NOT "FIX" IT BY LOOSENING THE FLOOR, by deleting the target, or by putting the erector credit
   * back on the back extension. The floor is quoted from a saved paper, a deleted target is a fact
   * made invisible, and the third is the exact claim that was just found to be false.
   *
   * Run it by hand: node --experimental-strip-types scripts/gym-targets.mjs */

  /* GYM-ORDER, wired 2026-08-31, the day a programme first satisfied it. It asserts every movement
   * pattern gets a slot in the first two blocks of some day, on Nunes 2021: strength gains are
   * largest in whatever is performed first (ES 0.32, p = 0.034) while order does nothing for size
   * (ES 0.03, p = 0.862). It was written the same day and deliberately held out of this list,
   * because the programme then live FAILED it on single-leg and on chest and a gate expected to fail
   * cannot signal a regression. Same contract as the two dated baselines. */
  ['gym-order', process.execPath, ['scripts/gym-order.mjs']],

  /* THE ARITHMETIC BEHIND BOTH OF THOSE, watched refusing in both directions. 31 cases, including
   * Pelland's own worked example. Restoring the max-based tier lookup fails 10 of them and restoring
   * the direct-vs-fractional units bug fails 2. Neither bug was visible to any other gate here,
   * because both numbers are plausible set counts and the wrong one is simply smaller. */
  ['gym-coverage-tests', process.execPath, ['--experimental-strip-types', 'src/lib/gym/coverage.test.ts']],

  ['gym-coverage', process.execPath, ['scripts/gym-coverage.mjs']],
  ['gym-catalogue', process.execPath, ['scripts/gym-catalogue.mjs']],
];
if (probeAt) GATES.push(['probe', process.execPath, ['scripts/probe-kitchen.mjs', probeAt]]);

const results = [];
for (const [name, cmd, args] of GATES) {
  process.stdout.write(`  ${name} ... `);
  /* stdio 'pipe' and NOT inherit, so a gate cannot flood the terminal and push the verdict off the
   * top of the screen. Output is kept and printed only for whatever failed, which is the only output
   * anyone wanted anyway. */
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  const code = r.status === null ? 1 : r.status;
  results.push({ name, code, out: `${r.stdout || ''}${r.stderr || ''}` });
  console.log(code === 0 ? 'ok' : `FAILED (exit ${code})`);
  // Stop at the first failure. Running lint against a tree that will not typecheck wastes a minute
  // and buries the real error under a second one.
  if (code !== 0) break;
}

const failed = results.find((r) => r.code !== 0);
console.log('-'.repeat(70));

if (failed) {
  // The tail of the failing gate only, because that is where every one of these tools puts its error.
  const lines = failed.out.split(/\r?\n/).filter(Boolean);
  for (const l of lines.slice(-25)) console.log(`  ${l}`);
  console.log('-'.repeat(70));
  console.log(`RED. ${failed.name} exited ${failed.code}. Nothing after it ran. Do not push.`);
  process.exit(1);
}

console.log(`GREEN. ${results.map((r) => r.name).join(', ')} all exited 0.`);
if (!probeAt) {
  console.log('The probe did not run. Green here means the code is consistent with itself, which is');
  console.log('what every gate that missed a real bug also meant. For anything he will read or cook');
  console.log('from: pnpm start, then node scripts/verify.mjs --probe http://localhost:3007');
}
process.exit(0);
