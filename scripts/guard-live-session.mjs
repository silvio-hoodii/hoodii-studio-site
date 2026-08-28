#!/usr/bin/env node
/**
 * REFUSES A PUSH WHILE HE IS STANDING IN THE GYM WITH THIS APP OPEN.
 *
 *   node scripts/guard-live-session.mjs
 *
 * Exit 0: no session is open, or there is no database to ask (see below). Exit 1: a row in
 * `gym_session` has no `finished_at`, so a deploy would swap the page out from under a workout he
 * is halfway through.
 *
 * WHY IT IS A SCRIPT AND NOT A SENTENCE. "He trains off this app, do not deploy while he is
 * mid-session" was the FIRST warning in the handoff of 2026-08-27, and it was prose. The pre-push
 * hook runs scripts/verify.mjs, which is offline by design, so nothing executed the check. Per
 * .agents/ENGINEERING.md's meta-law that is decoration, and this repo's whole record is that every
 * fix which stuck was a gate and every one that came back was prose.
 *
 * WHAT A DEPLOY ACTUALLY DOES TO HIM. Next serves a new build under new asset hashes. A page open
 * on his phone keeps working until it navigates or refetches, and then it is a different build with
 * different client state: the swap he made, the day the rotation had selected, the sets typed but
 * not yet flushed. He has lost a session to this class of thing before, which is why the swap now
 * survives a reload at all.
 *
 * NO DATABASE_URL MEANS EXIT 0, LOUDLY. Same posture check-ladder.mjs takes with the 07:15 task: a
 * check that cannot run must not block a push from a machine that never had the credential, and it
 * must say so rather than passing silently. A CI runner and a fresh clone both land here.
 *
 * OVERRIDE: GYM_GUARD_OFF=1. It prints what it is skipping. Use it when the open row is stale
 * because a session was abandoned rather than finished, which does happen: the app writes
 * `finished_at` on Finish and on "ran out of time", and on nothing else.
 */
import { neon } from '@neondatabase/serverless';
import { databaseUrl } from './lib/db-url.mjs';

const url = databaseUrl();
if (!url) {
  console.log('guard-live-session: SKIPPED. No DATABASE_URL here, so whether a workout is open');
  console.log('guard-live-session: cannot be known from this machine. Not treating that as a pass.');
  process.exit(0);
}

const sql = neon(url);
let rows;
try {
  rows = await sql`
    select date, day, day_title, status, started_at
    from gym_session
    where finished_at is null
    order by started_at desc nulls last
    limit 3
  `;
} catch (err) {
  /* A DEAD QUERY IS NOT A GREEN LIGHT, but it is also not proof he is training. Report it and let
   * the push through: refusing every push whenever Neon is unreachable would make the first
   * outage the reason this guard gets deleted. */
  console.log(`guard-live-session: COULD NOT ASK. ${err instanceof Error ? err.message : String(err)}`);
  console.log('guard-live-session: letting the push through, but nobody checked. Say so out loud.');
  process.exit(0);
}

if (!rows.length) {
  console.log('guard-live-session: ok, no unfinished session in gym_session.');
  process.exit(0);
}

if (process.env.GYM_GUARD_OFF === '1') {
  console.log(`guard-live-session: OVERRIDDEN by GYM_GUARD_OFF while ${rows.length} session(s) are open:`);
  for (const r of rows) console.log(`  ${r.date} ${r.day_title ?? r.day} started ${r.started_at ?? 'unknown'}`);
  process.exit(0);
}

console.log('');
console.log('guard-live-session: REFUSED. A workout is open right now:');
for (const r of rows) console.log(`  ${r.date}  ${r.day_title ?? r.day}  started ${r.started_at ?? 'unknown'}`);
console.log('');
console.log('Pushing to main deploys hoodii.studio, and the next thing he taps would be a different');
console.log('build: a swap he made, the day the rotation picked, and any set typed but not yet sent.');
console.log('Wait for Finish, or for "ran out of time", both of which stamp finished_at.');
console.log('If that row is an abandoned session rather than a live one: GYM_GUARD_OFF=1 git push');
process.exit(1);
