/* Regression suite for src/lib/gym/session-end.mts.
 *
 *   node --experimental-strip-types src/lib/gym/session-end.test.ts          # the rule in JS (verify.mjs)
 *   node --experimental-strip-types src/lib/gym/session-end.test.ts --sql    # also the SQL fragments
 *
 * THE CLASS IT GUARDS. A gym session ended only when a button was pressed, and twice five sessions
 * sat open for weeks (closed by hand 2026-08-15 and 2026-10-18). The rule now: an open session whose
 * last activity is older than LIVE_HOURS has ended AT that activity, never at now().
 *
 * WHY `--sql` EXISTS AND IS NOT IN verify.mjs. The app reads session state in Postgres, so the SQL
 * fragments are what actually decide what he sees. `--sql` runs them against Neon with `gym_session`
 * and `gym_set` shadowed by CTEs of the same names, so it reads nothing of his and writes nothing, and
 * asserts the SQL and the JS give the same answer on every case. It needs a database, and verify.mjs
 * is offline by design, so it is a command for whoever edits the fragments.
 */
import { effectiveFinishedAt, sessionState, toInstant, LIVE_HOURS, isOpenSql, effectiveFinishedAtSql, effectiveStatusSql } from './session-end.mts';

const H = 3_600_000;
const NOW = new Date('2026-10-18T20:00:00Z');
const ago = (h: number) => new Date(NOW.getTime() - h * H);

interface Case {
  label: string;
  /** Hours before now, or null for no value. */
  started: number | null;
  finished: number | null;
  sets: number[];
  live: boolean;
  /** Hours before now the session reads as ended, or null. */
  endedAgo: number | null;
}

const CASES: Case[] = [
  { label: 'open, 2 hours old, with sets: LIVE', started: 2, finished: null, sets: [1.9, 1.5], live: true, endedAgo: null },
  { label: 'open, 30 hours old, with sets: ended at its last set', started: 30, finished: null, sets: [29.8, 29.25], live: false, endedAgo: 29.25 },
  { label: 'open, 30 hours old, no sets: ended at its start', started: 30, finished: null, sets: [], live: false, endedAgo: 30 },
  { label: 'finished session: unchanged', started: 30, finished: 28, sets: [29.5], live: false, endedAgo: 28 },
  { label: 'finished minutes ago: unchanged, not live', started: 1.5, finished: 0.25, sets: [0.3], live: false, endedAgo: 0.25 },
  { label: 'started 7 hours ago, set 10 minutes ago: LIVE (age is from the last set)', started: 7, finished: null, sets: [6.9, 0.17], live: true, endedAgo: null },
  { label: 'just inside the window', started: LIVE_HOURS - 0.1, finished: null, sets: [], live: true, endedAgo: null },
  { label: 'just outside the window', started: LIVE_HOURS + 0.1, finished: null, sets: [], live: false, endedAgo: LIVE_HOURS + 0.1 },
  { label: 'no time recorded at all: not live, nothing to stamp', started: null, finished: null, sets: [], live: false, endedAgo: null },
];

let bad = 0;
const check = (ok: boolean, label: string, detail: string) => {
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: ${detail}`}`);
};
const near = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) < 0.01);

for (const c of CASES) {
  const lastSet = c.sets.length ? ago(Math.min(...c.sets)) : null;
  const s = { startedAt: c.started == null ? null : ago(c.started), finishedAt: c.finished == null ? null : ago(c.finished) };
  const st = sessionState(s, lastSet, NOW);
  const fin = effectiveFinishedAt(s, lastSet, NOW);
  const gotAgo = fin ? (NOW.getTime() - fin.getTime()) / H : null;
  check(st.live === c.live && near(gotAgo, c.endedAgo), c.label, `live ${st.live}, ended ${gotAgo}h ago; want live ${c.live}, ended ${c.endedAgo}h ago`);
  /* The class itself: whatever the case, a derived finish is never now. */
  if (fin && c.finished == null) check(gotAgo! > 0.01, `${c.label} (not stamped now)`, `stamped ${gotAgo}h ago`);
}

/* A timestamp without an offset is not a time: refused, never read as local or as UTC. */
check(toInstant('2026-10-18 13:00:00') === null, 'naive timestamp refused', String(toInstant('2026-10-18 13:00:00')));
check(toInstant('2026-10-18 13:00:00-06:00') === Date.parse('2026-10-18T19:00:00Z'), 'Postgres text with offset read as that instant', String(toInstant('2026-10-18 13:00:00-06:00')));
check(
  sessionState({ startedAt: '2026-10-17 08:00:00', finishedAt: null }, null, NOW).finishedAt === null,
  'naive start: no derived finish invented from it',
  'derived one',
);

if (process.argv.includes('--sql')) {
  const { neon } = await import('@neondatabase/serverless');
  const dbUrlModule = '../../../scripts/lib/db-url.mjs';
  const { databaseUrl } = (await import(dbUrlModule)) as { databaseUrl: () => string | null };
  const url = databaseUrl();
  if (!url) {
    console.log('FAIL  --sql asked for, but no database URL here');
    bad++;
  } else {
    const sql = neon(url);
    const iv = (h: number | null) => (h == null ? 'null::timestamptz' : `now() - make_interval(secs => ${h * 3600})`);
    const sessions = CASES.map((c, i) => `(${i}, 'd${i}', 'fa', ${iv(c.started)}, ${iv(c.finished)}, '${c.finished == null ? 'active' : 'finished'}')`).join(',\n');
    const sets = CASES.flatMap((c, i) => c.sets.map((h) => `('d${i}', 'fa', ${iv(h)})`));
    /* An unrelated set on another day of the same date, which the rule must not count. */
    sets.push(`('d1', 'fb', now())`);
    const q = `
      with gym_session(id, date, day, started_at, finished_at, status) as (values ${sessions}),
           gym_set(date, day, logged_at) as (values ${sets.join(',\n')})
      select s.id,
             coalesce(${isOpenSql('s')}, false) as open,
             extract(epoch from (now() - ${effectiveFinishedAtSql('s')})) / 3600 as ended_ago,
             ${effectiveStatusSql('s')} as status
        from gym_session s order by s.id`;
    const rows = (await sql.query(q)) as unknown as { id: number; open: boolean; ended_ago: string | number | null; status: string }[];
    for (const r of rows) {
      const c = CASES[r.id]!;
      const got = r.ended_ago == null ? null : Number(r.ended_ago);
      const wantStatus = c.finished != null ? 'finished' : c.live ? 'active' : 'finished';
      check(r.open === c.live && near(got, c.endedAgo) && r.status === wantStatus, `SQL agrees: ${c.label}`,
        `open ${r.open}, ended ${got}h ago, status ${r.status}`);
    }
    check(rows.length === CASES.length, 'SQL returned every case', `${rows.length} of ${CASES.length}`);
  }
}

if (bad) {
  console.error(`session-end: ${bad} failed.`);
  process.exit(1);
}
console.log('session-end: all passed.');
