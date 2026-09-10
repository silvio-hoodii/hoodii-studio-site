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

const sha = flag('--sha') || spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
if (!/^[0-9a-f]{7,40}$/.test(sha)) {
  console.error(`wait-deploy: no usable commit sha (${sha || 'empty'}). Pass --sha.`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + TIMEOUT_S * 1000;

/** The Vercel REST API through the CLI's own credentials. Returns null on any failure, because a
 *  transient CLI error must not read as "the deploy failed": only a real terminal state does. */
function deployments() {
  const res = spawnSync('vercel', ['api', '/v6/deployments?limit=10&target=production'], {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });
  if (res.status !== 0 || !res.stdout) return null;
  try {
    return JSON.parse(res.stdout).deployments ?? null;
  } catch {
    return null;
  }
}

/* STEP 1: the build. `state` is READY, BUILDING, QUEUED, INITIALIZING, ERROR or CANCELED. A sha that
   never appears is its own failure: the push did not reach the project this CLI is pointed at. */
let seen = false;
let state = null;
while (Date.now() < deadline) {
  const list = deployments();
  if (list) {
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

const failures = [];
const ok = [];
for (let i = 0; i < paths.length; i++) {
  const url = paths[i].startsWith('http') ? paths[i] : `${BASE}${paths[i]}`;
  const want = expects[i] ?? null;
  let res;
  try {
    res = await fetch(url, { headers: { 'user-agent': 'wait-deploy (hoodii-studio-site)' } });
  } catch (e) {
    failures.push(`${url}: fetch failed (${e.message})`);
    continue;
  }
  if (!res.ok) {
    failures.push(`${url}: HTTP ${res.status}`);
    continue;
  }
  if (want) {
    const text = strip(await res.text());
    if (!text.includes(want)) {
      failures.push(`${url}: 200, but "${want}" is not on the page`);
      continue;
    }
  }
  ok.push(want ? `${url} 200 and says "${want}"` : `${url} 200`);
}

if (failures.length) {
  console.error(`wait-deploy: RED. ${sha.slice(0, 7)} is READY on Vercel, but the live page disagrees:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`wait-deploy: GREEN. ${sha.slice(0, 7)} READY${ok.length ? `, ${ok.join('; ')}` : ''}.`);
