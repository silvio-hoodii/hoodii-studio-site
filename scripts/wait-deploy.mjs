#!/usr/bin/env node
/* WAIT FOR THE COMMIT YOU JUST PUSHED TO BE LIVE, AND CHECK THAT IT SAYS THE THING.
 *
 * WHY THIS EXISTS. "Done means live, and reached, not just rendered" is a standing rule here, and
 * the only way anyone had to obey it was a shell loop of `curl` and `sleep 15` typed fresh every
 * time. That loop BLOCKS the session for as long as the deploy takes, so an agent sits there doing
 * nothing while Vercel builds, and Silvio watches it do nothing. His words, 2026-09-09, watching one
 * of them: "you are stuck waiting on production why [not] fix it for any future session".
 *
 * It also answered the wrong question. A 200 from hoodii.studio proves SOMETHING is deployed. It
 * does not prove YOUR commit is, and the previous build answers 200 the entire time yours is
 * building, so a poll that only checks status text can go green on the build you are replacing.
 *
 * So this asks two questions in order, and both have to be yes:
 *
 *   1. Is the deployment whose meta.githubCommitSha is MY commit in state READY? (the Vercel API,
 *      through the CLI's own login, so no token is needed here)
 *   2. Does the live URL now contain the string that only my change produces?
 *
 * RUN IT IN THE BACKGROUND. That is the whole point:
 *
 *   node scripts/wait-deploy.mjs --url /health/day --expect "under 5,000 steps"
 *
 * with the Bash tool's `run_in_background: true`. It prints one line and exits 0 or 1, and the
 * session carries on with the next piece of work instead of sleeping. Defaults to HEAD's sha and to
 * https://hoodii.studio, and takes as many --url/--expect pairs as you give it (they pair up in
 * order; a --url with no --expect is checked for HTTP 200 only).
 *
 * ON GIT BASH: the `vercel api` call needs MSYS_NO_PATHCONV=1 or the leading slash of the API path
 * gets rewritten into a Windows path. This file sets it on the child itself, so callers do not have
 * to remember, which is the difference between a mechanism and a note.
 */
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const many = (name) => argv.reduce((acc, a, i) => (a === name ? [...acc, argv[i + 1]] : acc), []);

const BASE = flag('--base', 'https://hoodii.studio').replace(/\/$/, '');
const TIMEOUT_S = Number(flag('--timeout', '900'));
const EVERY_MS = Number(flag('--every', '15')) * 1000;
const paths = many('--url');
const expects = many('--expect');

/* GIT BASH REWRITES A LEADING SLASH INTO A WINDOWS PATH, and this script's arguments are all
   leading-slash paths. `--url /health/day` arrives as `C:/Program Files/Git/health/day`, which
   concatenated onto the base gives a URL that cannot resolve. It is refused here rather than
   fetched, because the same mangling in scripts/probe-taps.mjs measured the wrong URL and reported
   OK: a checker that silently checks the wrong thing is worse than one that stops. */
for (const p of paths) {
  if (/^[A-Za-z]:[/\\]/.test(p)) {
    console.error(
      `wait-deploy: REFUSED. --url arrived as "${p}", which is Git Bash rewriting a leading slash.\n` +
      '  Prefix the command with MSYS_NO_PATHCONV=1, or pass the full https:// URL.',
    );
    process.exit(2);
  }
}

const sha = flag('--sha') || spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
if (!/^[0-9a-f]{7,40}$/.test(sha)) {
  console.error(`wait-deploy: no usable commit sha (${sha || 'empty'}). Pass --sha.`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + TIMEOUT_S * 1000;

/* THE API PATH IS QUOTED, AND THAT IS NOT STYLE. `vercel` is a .cmd on Windows, so spawnSync needs
   `shell: true` to find it at all, and cmd.exe reads the `&` in `?limit=10&target=production` as a
   COMMAND SEPARATOR. Unquoted, this ran `vercel api /v6/deployments?limit=10`, then tried to run
   `target=production` as a program, and exited 1 with "'target' is not recognized". Caught on the
   first live run of this script, by it producing no output at all rather than an error. */
const API = '/v6/deployments?limit=10&target=production';

/** The Vercel REST API through the CLI's own credentials. Returns null on a failure, because one
 *  transient CLI error must not read as "the deploy failed": only a terminal state does. Repeated
 *  failures are a different thing and are counted by the caller, not swallowed here. */
function deployments() {
  const res = spawnSync(`vercel api "${API}"`, {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });
  if (res.status !== 0 || !res.stdout) {
    lastApiError = (res.stderr || res.stdout || `exit ${res.status}`).toString().trim().split('\n').slice(-2).join(' ');
    return null;
  }
  try {
    return JSON.parse(res.stdout).deployments ?? null;
  } catch (e) {
    lastApiError = `unparseable response (${e.message})`;
    return null;
  }
}
let lastApiError = null;

/* STEP 1: the build. `state` is READY, BUILDING, QUEUED, INITIALIZING, ERROR or CANCELED. A sha that
   never appears is its own failure: the push did not reach the project this CLI is pointed at. */
let seen = false;
let state = null;
/* A RUN OF API FAILURES IS REPORTED, NOT WAITED OUT. The first version returned null on any CLI
   error and looped, so the shell-quoting bug above presented as a script that printed nothing for
   fifteen minutes and then said "gave up". A checker that cannot reach its source has to say so:
   that is a different fact from "the deploy is not ready yet", and it is the one that is actionable. */
let apiFails = 0;
while (Date.now() < deadline) {
  const list = deployments();
  if (list) {
    apiFails = 0;
    const mine = list.find((d) => (d.meta?.githubCommitSha ?? '').startsWith(sha.slice(0, 7)));
    if (mine) {
      seen = true;
      state = mine.state ?? mine.readyState;
      if (state === 'READY') break;
      if (state === 'ERROR' || state === 'CANCELED') {
        console.error(`wait-deploy: RED. Deployment of ${sha.slice(0, 7)} is ${state}. Nothing is live from this commit.`);
        process.exit(1);
      }
    }
  } else if (++apiFails >= 3) {
    console.error(
      `wait-deploy: RED. The Vercel API failed ${apiFails} times running, so this never checked anything.\n` +
      `  last error: ${lastApiError}\n` +
      '  Try `vercel whoami`; if that is fine, run the api call by hand and read what it says.',
    );
    process.exit(2);
  }
  await sleep(EVERY_MS);
}

if (state !== 'READY') {
  console.error(
    `wait-deploy: RED. Gave up after ${TIMEOUT_S}s. ${seen ? `Deployment of ${sha.slice(0, 7)} is still ${state}.` : `No production deployment carries ${sha.slice(0, 7)}: check the push actually landed.`}`,
  );
  process.exit(1);
}

/* STEP 2: the page. READY means Vercel finished, not that the thing he taps says what you changed.
   The text is compared tag-stripped, because a phrase that spans an element boundary in the source
   ("under 5,000 steps" wrapped around a <span>) is not a substring of the HTML. */
const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#x27;|&apos;/g, "'")
  .replace(/\s+/g, ' ');

/* READY IS NOT SERVED. Vercel reports a deployment READY before the production alias has finished
   swapping on every edge, so a single fetch at that instant can still get the previous build. This
   returned a FALSE RED on 2026-09-10: the string was on the page seconds later, and it was checked
   by hand to prove it. A false alarm is exactly how a checker stops being read, which is the whole
   reason this file exists, so the content check RETRIES before it fails.

   Only the negative is retried. A page that already says the thing is done, and a 200 carrying the
   string cannot become wrong by waiting. Cache-busting on the retries because an edge that served
   the old build once will serve it again from the same key. */
const CONTENT_TRIES = 6;
const CONTENT_GAP_MS = 10_000;

async function checkOne(url, want, attempt) {
  const bust = attempt === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}_wd=${Date.now()}`;
  let res;
  try {
    res = await fetch(bust, {
      headers: { 'user-agent': 'wait-deploy (hoodii-studio-site)', 'cache-control': 'no-cache' },
    });
  } catch (e) {
    return `fetch failed (${e.message})`;
  }
  if (!res.ok) return `HTTP ${res.status}`;
  if (!want) return null;
  return strip(await res.text()).includes(want) ? null : `200, but "${want}" is not on the page`;
}

const failures = [];
const ok = [];
for (let i = 0; i < paths.length; i++) {
  const url = paths[i].startsWith('http') ? paths[i] : `${BASE}${paths[i]}`;
  const want = expects[i] ?? null;
  let problem = null;
  for (let attempt = 0; attempt < CONTENT_TRIES; attempt++) {
    problem = await checkOne(url, want, attempt);
    if (problem == null) break;
    if (attempt < CONTENT_TRIES - 1) await sleep(CONTENT_GAP_MS);
  }
  if (problem) failures.push(`${url}: ${problem} (after ${CONTENT_TRIES} tries over ${(CONTENT_TRIES - 1) * CONTENT_GAP_MS / 1000}s)`);
  else ok.push(want ? `${url} 200 and says "${want}"` : `${url} 200`);
}

if (failures.length) {
  console.error(`wait-deploy: RED. ${sha.slice(0, 7)} is READY on Vercel, but the live page disagrees:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`wait-deploy: GREEN. ${sha.slice(0, 7)} READY${ok.length ? `, ${ok.join('; ')}` : ''}.`);
