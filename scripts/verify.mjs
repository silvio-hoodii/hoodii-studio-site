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
 *   node scripts/verify.mjs           # the four gates
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
