import Link from 'next/link';
import type { Metadata } from 'next';
import { getWatchLog, countWatchLog, watchLogSpan } from '@/lib/gym/log';
import SessionLog from '@/components/training/SessionLog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Running, the whole record',
  description: 'Every run and treadmill session the watch recorded.',
  alternates: { canonical: '/run/log' },
  robots: { index: false, follow: false },
};

/* THE RUNNING LOG. Built 2026-08-27, Decision 7.
 *
 * TWO KINDS IN ONE LIST. The watch files an outdoor run as `running` and a belt session as
 * `treadmill`, and both are running to him. `getRecentSessions` in src/lib/gym/session.ts already
 * makes the same mapping for the same reason, so this route matches it rather than inventing a
 * second definition of what a run is.
 *
 * WHY IT READS `health_watch_session` AND NOT `health_session_detail`. The detail table holds 4
 * treadmill rows and 1 running row, all since 2026-04-25. The watch table holds 260 and 58, going
 * back to 2023-01-18 and 2019-09-05. The /run page's existing "recent sessions" block reads the
 * shallow one, which is correct for drawing a cadence trend and wrong for answering "how much have I
 * run". Reading the shallow table for a history question is the live bug that has /bike telling him
 * he has ridden once when the watch holds 76 rides.
 *
 * SO CADENCE IS MOSTLY BLANK HERE, and that is the honest rendering: the column exists because
 * cadence IS measured indoors and is the one real piece of form feedback available, and it is null on
 * every row older than the detail table. The caption says so rather than the blanks implying zero. */

export default async function RunLogPage() {
  const KINDS = ['treadmill', 'running'];
  const [rows, total, span] = await Promise.all([
    getWatchLog(KINDS, 100),
    countWatchLog(KINDS),
    watchLogSpan(KINDS),
  ]);
  const withCadence = rows.filter((r) => r.avgCadence != null).length;

  return (
    <div className="wrap">
      <h1>Running, the whole record</h1>
      <p className="lede">
        <Link href="/run">Back to the plan</Link>
      </p>
      <p className="lede quiet" style={{ marginTop: 4 }}>
        {total} sessions the watch recorded, treadmill and outdoors together
        {span.first ? `, back to ${span.first}` : ''}.
      </p>

      <SessionLog
        rows={rows}
        total={total}
        variant="log-watch"
        columns={[
          { head: 'Kind', cell: (r) => r.kind },
          { head: 'Time', num: true, cell: (r) => (r.minutes != null ? `${r.minutes}m` : null) },
          { head: 'Cadence', num: true, cell: (r) => (r.avgCadence != null ? String(r.avgCadence) : null) },
        ]}
        caption={`Cadence is on ${withCadence} of these ${rows.length} rows. It comes from the per-second detail, which only reaches back to 2026-04-25, so every older session has a date and a duration and nothing else.`}
        emptyNote="The watch has recorded no runs."
      />
    </div>
  );
}
