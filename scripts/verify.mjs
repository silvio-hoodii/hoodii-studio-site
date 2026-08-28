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
