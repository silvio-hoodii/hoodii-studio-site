import Link from 'next/link';
import type { Metadata } from 'next';
import { getWatchLog, countWatchLog, watchLogSpan } from '@/lib/gym/log';
import SessionLog from '@/components/training/SessionLog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cycling, the whole record',
  description: 'Every ride the watch recorded, and what it could not record.',
  alternates: { canonical: '/bike/log' },
  robots: { index: false, follow: false },
};

/* THE CYCLING LOG. Built 2026-08-27, Decision 7, and it exists to correct a live false claim.
 *
 * `/bike`'s Now tab calls `getRecentSessions('cycling', 10)`, which reads `health_session_detail`.
 * That table holds exactly ONE cycling row. So `RecentSessions` takes its `sessions.length <= 1`
 * branch and prints: "Nothing. This is the only one the watch has ever recorded, so there is no
 * trend to draw yet."
 *
 * THE WATCH HOLDS 76 RIDES, GOING BACK TO 2021-09-05. The page is accurate about its source and
 * wrong about his life, which is the worst combination available: it reads as a fact about him. Found
 * 2026-08-27 while specifying this route, and filed as finding 54 in
 * docs/GYM-AUDIT-AND-PLAN-2026-08-27.md. `AGENTS.md` repeats the same claim ("exactly one session
 * ever"), which is true of the detail table and false of his history.
 *
 * THE APP'S OWN RECORD IS EMPTY AND THIS PAGE SAYS SO. `bike_ride` has zero rows: the typed
 * resistance form shipped 2026-08-27 and has never been used. A history page that quietly showed only
 * the watch rows would hide that the one thing the watch CANNOT record, resistance, is also the one
 * thing nothing has ever captured. */

export default async function BikeLogPage() {
  const KINDS = ['cycling'];
  const [rows, total, span] = await Promise.all([
    getWatchLog(KINDS, 100),
    countWatchLog(KINDS),
    watchLogSpan(KINDS),
  ]);

  return (
    <div className="wrap">
      <h1>Cycling, the whole record</h1>
      <p className="lede">
        <Link href="/bike">Back to the plan</Link>
      </p>
      <p className="lede quiet" style={{ marginTop: 4 }}>
        {total} rides the watch recorded{span.first ? `, back to ${span.first}` : ''}. On a bike the
        watch stores a heart rate and nothing else: no cadence, no power, no resistance.
      </p>

      <SessionLog
        rows={rows}
        total={total}
        variant="log-watch"
        columns={[
          { head: 'Time', num: true, cell: (r) => (r.minutes != null ? `${r.minutes}m` : null) },
          { head: 'Avg HR', num: true, cell: (r) => (r.avgHr != null ? String(r.avgHr) : null) },
          { head: 'Easy', num: true, cell: (r) => (r.pctEasy != null ? `${r.pctEasy}%` : null) },
        ]}
        caption="Heart rate and percent-under-110 come from the per-second detail, which reaches back only to 2026-04-25. Every older row is a date and a duration, which is all the watch kept."
        emptyNote="The watch has recorded no rides."
      />

      <div className="count" style={{ marginTop: 30 }}>What you typed</div>
      <p className="lede quiet" style={{ marginTop: 4 }}>
        Nothing yet. The resistance form on the bike page writes the one thing the watch cannot see,
        and it has not been used. Until it is, the rows above are the whole record and none of them
        knows how hard you were pedalling.
      </p>
    </div>
  );
}
