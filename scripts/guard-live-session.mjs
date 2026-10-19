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
 * OVERRIDE: GYM_GUARD_OFF=1. It prints what it is skipping.
 *
 * AN OPEN ROW FROM A PAST DAY IS STRANDED, NOT LIVE, AND IT USED TO BLOCK EVERY PUSH FOREVER.
 *
 * The app writes `finished_at` on Finish and on "ran out of time", and on nothing else, so a session
 * he simply walks away from stays open. Until 2026-09-09 this file refused on ANY unfinished row at
 * any age, and there is no way for him to close an old one: `/gym` opens on TODAY's session, so a
 * row from a previous day has no Finish button anywhere in the app. His words on finding one from
 * the night before still blocking a deploy: "stamp that session or wht should i dont i cant see it
 * now".
 *
 * That made this a gate that cries wolf, and a gate that cries wolf gets answered with
 * GYM_GUARD_OFF=1 by reflex, which is the same as not having it. So the window is explicit:
 *
 *   last activity under LIVE_HOURS ago  ->  REFUSE. He could be standing in the gym.
 *   older, or with no time recorded     ->  say so loudly, exit 0. Nobody is 22 hours into a workout.
 *
 * (Measured from started_at until 2026-10-18; from the latest set since. See the import below.)
 *
 * The age is computed by Postgres from a timestamptz, never in JS from a zone name, per the standing
 * rule in HOODII/CLAUDE.md that a timestamp without an offset is not a time.
 *
 * TO CLOSE STRANDED ROWS: `node scripts/guard-live-session.mjs --close-stranded`. It is a separate,
 * deliberate command and NOT something the pre-push path does, because a guard that writes to his
 * training log on every push is a worse thing than the problem it fixes. It stamps `finished_at` at
 * the LAST SET he actually logged rather than at now(): `page_open_min` in src/lib/gym/log.ts is
 * derived from that subtraction, and stamping now() would enter a 23-hour session into his record.
 * It refuses to touch anything inside the live window.
 */
import { neon } from '@neondatabase/serverless';
import { databaseUrl } from './lib/db-url.mjs';
/* THE LIVE WINDOW IS SHARED, since 2026-10-18. LIVE_HOURS was a private constant here; it moved to
 * src/lib/gym/session-end.mts so this guard, /gym, the log and the write path all mean the same thing
 * by "live". The age is now measured from his LAST ACTIVITY (latest set, or the start if none), not
 * from started_at: a session begun seven hours ago with a set ten minutes ago is live, and the old
 * rule called it stranded. Every reader in the app already treats a stranded row as ended at its last
 * activity, so --close-stranded below only writes down what is already read. */
import { LIVE_HOURS, isLiveHours, hoursSinceActivitySql, lastActivitySql } from '../src/lib/gym/session-end.mts';

/** Split open sessions into the ones that could be live and the ones that are stranded. Pure, so the
 *  self-test can watch it decide both ways: this gate had only ever been seen to refuse.
 *  `hours_open` is hours since last activity. */
export function partition(rows) {
  const live = [];
  const stranded = [];
  for (const r of rows) {
    const h = r.hours_open == null ? null : Number(r.hours_open);
    (isLiveHours(h) ? live : stranded).push({ ...r, hours_open: h });
  }
  return { live, stranded };
}

if (process.argv.includes('--selftest')) {
  const cases = [
    ['just started', [{ hours_open: 0.1 }], 1, 0],
    ['an hour in', [{ hours_open: 1 }], 1, 0],
    ['just inside the window', [{ hours_open: 5.9 }], 1, 0],
    ['just outside it', [{ hours_open: 6.1 }], 0, 1],
    ['last night', [{ hours_open: 22 }], 0, 1],
    ['no time recorded at all', [{ hours_open: null }], 0, 1],
    ['one of each', [{ hours_open: 0.5 }, { hours_open: 30 }], 1, 1],
  ];
  let bad = 0;
  for (const [name, rows, wantLive, wantStranded] of cases) {
    const { live, stranded } = partition(rows);
    if (live.length !== wantLive || stranded.length !== wantStranded) {
      bad++;
      console.error(`  selftest FAIL: ${name} -> live ${live.length}, stranded ${stranded.length}; want ${wantLive}, ${wantStranded}`);
    }
  }
  if (bad) {
    console.error(`guard-live-session selftest: ${bad} of ${cases.length} wrong.`);
    process.exit(1);
  }
  console.log(`guard-live-session selftest: ${cases.length} cases, all correct.`);
  process.exit(0);
}

const closeStranded = process.argv.includes('--close-stranded');
const url = databaseUrl();
if (!url) {
  console.log('guard-live-session: SKIPPED. No DATABASE_URL here, so whether a workout is open');
  console.log('guard-live-session: cannot be known from this machine. Not treating that as a pass.');
  process.exit(0);
}

const sql = neon(url);
let rows;
try {
  /* The age comes out of Postgres, off a timestamptz. Never `Date.now() - Date.parse(started_at)`
     in JS against a zone name: that is the class the whole workspace has one rule about. */
  rows = await sql`
    select s.date, s.day, s.day_title, s.status, s.started_at,
           ${sql.unsafe(hoursSinceActivitySql('s'))} as hours_open
    from gym_session s
    where s.finished_at is null
    order by s.started_at desc nulls last
    limit 10
  `;
} catch (err) {
  /* A DEAD QUERY IS NOT A GREEN LIGHT, but it is also not proof he is training. Report it and let
   * the push through: refusing every push whenever Neon is unreachable would make the first
   * outage the reason this guard gets deleted. */
  console.log(`guard-live-session: COULD NOT ASK. ${err instanceof Error ? err.message : String(err)}`);
  console.log('guard-live-session: letting the push through, but nobody checked. Say so out loud.');
  process.exit(0);
}

const { live, stranded } = partition(rows);
const describe = (r) => `  ${r.date}  ${r.day_title ?? r.day}  started ${r.started_at ?? 'unknown'}`
  + (r.hours_open == null ? '  (no start time)' : `  (${r.hours_open.toFixed(1)}h ago)`);

/* --close-stranded: the deliberate repair, and the only write in this file. Stamped at the last set
   he logged, not at now(), so page_open_min stays a plausible number. A stranded row with no sets at
   all is closed at its own started_at, which reads as a zero-length session: that is what it was. */
if (closeStranded) {
  if (!stranded.length) {
    console.log('guard-live-session: nothing stranded to close.');
    process.exit(0);
  }
  /* The same stamp every reader already derives (session-end.mts): last activity, never now(). A
     row with no time at all is left alone; there is nothing honest to write. */
  const last = sql.unsafe(lastActivitySql('s'));
  for (const r of stranded) {
    const [done] = await sql`
      update gym_session s
         set status = 'finished', finished_at = ${last}
       where s.date = ${r.date} and s.day is not distinct from ${r.day} and s.finished_at is null
         and ${last} <= now() - make_interval(hours => ${LIVE_HOURS})
      returning s.date, s.day_title, s.started_at, s.finished_at`;
    if (done) {
      console.log(`guard-live-session: closed ${done.date} ${done.day_title ?? ''} at ${done.finished_at}`);
    } else {
      console.log(`guard-live-session: left ${r.date} alone; it is inside the ${LIVE_HOURS}h live window or has no time recorded.`);
    }
  }
  process.exit(0);
}

if (!rows.length) {
  console.log('guard-live-session: ok, no unfinished session in gym_session.');
  process.exit(0);
}

/* STRANDED ROWS ARE REPORTED, NOT REFUSED. See the header: he cannot close one from the app, so
   blocking on it blocks every push until somebody overrides, and an override by reflex is the same
   as no gate. Loud, and it names the one command that fixes it. */
if (stranded.length) {
  console.log(`guard-live-session: ${stranded.length} STRANDED session(s), open but far too old to be live:`);
  for (const r of stranded) console.log(describe(r));
  console.log(`  Not blocking on these. Close them with: node scripts/guard-live-session.mjs --close-stranded`);
}

if (!live.length) {
  console.log('guard-live-session: ok, no session that could be running right now.');
  process.exit(0);
}

if (process.env.GYM_GUARD_OFF === '1') {
  console.log(`guard-live-session: OVERRIDDEN by GYM_GUARD_OFF while ${live.length} session(s) could be live:`);
  for (const r of live) console.log(describe(r));
  process.exit(0);
}

console.log('');
console.log('guard-live-session: REFUSED. A workout may be open right now:');
for (const r of live) console.log(describe(r));
console.log('');
console.log('Pushing to main deploys hoodii.studio, and the next thing he taps would be a different');
console.log('build: a swap he made, the day the rotation picked, and any set typed but not yet sent.');
console.log('Wait for Finish, or for "ran out of time", both of which stamp finished_at.');
console.log('If that row is abandoned rather than live: GYM_GUARD_OFF=1 git push');
process.exit(1);
