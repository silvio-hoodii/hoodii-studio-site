import { mmss, type SessionDetail, type SessionKind } from '@/lib/gym/session';
import { shortDate } from '@/lib/format';
import { Trace } from './SessionCharts';

/* THE LAST N SESSIONS, not just the last one. Phase D, 2026-08-27.
 *
 * `getRecentSessions` has existed in src/lib/gym/session.ts since 2026-08-22, correct, and imported
 * by nothing. Every discipline drew exactly one session and called it a page. This is the component
 * that spends it, and it is the change the redesign plan calls "the single change that turns four
 * shallow pages into four deep ones".
 *
 * WHAT EACH KIND GETS IS DECIDED BY WHAT ITS ROWS ACTUALLY HOLD, checked against Neon before this
 * was written rather than assumed, because a trend line through a column that is null half the time
 * is a chart with invisible holes in it:
 *
 *   strength   80 sessions, all carrying minutes, average heart rate and percent under 110 bpm.
 *   swimming   60 sessions. 8 of the last 10 carry lengths, SWOLF and stroke rate; the two that do
 *              not are short sessions with no distance recorded either.
 *   treadmill  5 sessions, ALL of them, and cadence on every one. Five is thin and it is real.
 *   cycling    ONE session, ever. One point is not a trend and this says so instead of drawing one.
 *
 * TWO PACES, NEVER ONE. A swim's moving pace comes from summing the lengths and its wall-clock pace
 * comes from the session duration, and they differ by every second spent on the wall: 2:04 against
 * 2:54 on the same swim. Mixing them is what put a "best pace" of 1:31 on /health, faster than his
 * official 100 m personal best, off a 300 m session that was 82% rest. The column here is moving
 * pace, it is labelled moving pace, and a session with no lengths shows nothing rather than
 * borrowing the other definition.
 *
 * THE TREND SAYS HOW MANY POINTS IT HAS. Where a metric is missing on some sessions the line is
 * drawn through the ones that have it and the caption gives the count, so a gap is a thing you can
 * see rather than a smooth line that quietly skipped a fortnight. */

/** Which single number is worth watching across sessions, per kind, and which way is better. */
const TREND: Partial<
  Record<
    SessionKind,
    {
      label: string;
      unit: string;
      of: (s: SessionDetail) => number | null;
      /** Drawn as a horizontal rule when it falls inside the range. A target he is aiming at. */
      floor?: number;
      /** One sentence under the chart. Says which direction is the good one, because a line going
       *  down is an improvement for SWOLF and a decline for cadence. */
      note: string;
    }
  >
> = {
  swimming: {
    label: 'SWOLF',
    unit: '',
    of: (s) => s.avgSwolf,
    note: 'SWOLF is seconds plus stroke cycles for one length, so DOWN is better: it falls when you get faster, more efficient, or both.',
  },
  treadmill: {
    label: 'Cadence',
    unit: 'spm',
    of: (s) => s.avgCadence,
    floor: 170,
    note: 'Steps a minute, averaged over each run. UP is the direction you want, and cadence is genuinely measured on a treadmill rather than estimated.',
  },
  strength: {
    label: 'Under 110 bpm',
    unit: '%',
    of: (s) => s.pctEasy,
    note: 'How much of each session your heart rate stayed under 110. That is the standing-around, so DOWN is a denser session. It is also the only thing a wrist heart rate can honestly say about lifting.',
  },
};

/** The columns each kind can fill, in the order they are worth reading. */
function columns(kind: SessionKind): { head: string; num: boolean; of: (s: SessionDetail) => string }[] {
  const hr = { head: 'HR', num: true, of: (s: SessionDetail) => (s.avgHr ? String(s.avgHr) : '') };
  const time = { head: 'Time', num: true, of: (s: SessionDetail) => (s.minutes ? `${s.minutes}m` : '') };
  if (kind === 'swimming') {
    return [
      { head: 'Distance', num: true, of: (s) => (s.distanceM ? `${Math.round(s.distanceM).toLocaleString()} m` : '') },
      {
        head: 'Moving pace',
        num: true,
        of: (s) => {
          /* Summed from the lengths, so it excludes rest. Null rather than a fallback: see the
             header. A session with no per-length detail genuinely does not have this number. */
          const swimSec = s.series.lengths?.reduce((a, l) => a + l.s, 0) ?? 0;
          return swimSec > 0 && s.distanceM ? mmss(swimSec / (s.distanceM / 100)) : '';
        },
      },
      { head: 'SWOLF', num: true, of: (s) => (s.avgSwolf != null ? String(s.avgSwolf) : '') },
    ];
  }
  if (kind === 'treadmill' || kind === 'running') {
    return [
      { head: 'Distance', num: true, of: (s) => (s.distanceM ? `${(s.distanceM / 1000).toFixed(2)} km` : '') },
      { head: 'Cadence', num: true, of: (s) => (s.avgCadence ? `${Math.round(s.avgCadence)}` : '') },
      hr,
    ];
  }
  if (kind === 'strength') {
    return [time, { head: 'Under 110', num: true, of: (s) => (s.pctEasy != null ? `${Math.round(s.pctEasy)}%` : '') }, hr];
  }
  /* cycling, other, other-auto: a heart rate and a duration is the whole of it. */
  return [time, hr];
}

export default function RecentSessions({
  sessions,
  kind,
}: {
  sessions: SessionDetail[];
  kind: SessionKind;
}) {
  /* ONE SESSION IS NOT A HISTORY, and drawing this block around it would repeat the card above it
     with worse formatting. Nothing at all is the wrong answer too: "you have ridden once" is a real
     and useful fact, and silence reads as a page that has not been built yet. */
  if (sessions.length <= 1) {
    return (
      <div className="exgroup">
        <div className="exgroup-label">Before that</div>
        <p className="ex-cue">
          {/* THE CLAIM IS ABOUT THIS BLOCK'S SOURCE, NOT ABOUT HIS LIFE. Corrected 2026-08-28
              (12-run-bike B3). It said "This is the only one the watch has ever recorded", and the
              watch has recorded 76 cycling sessions across 55 dates going back to 2021-09-05. What
              holds ONE is `health_session_detail`, the per-second table this block reads.

              /bike's own comment already said the sentence was false, and the mitigation shipped
              instead was a link placed BELOW it: "There are more than the block above can see." A
              correction underneath a wrong claim is the pattern that destroyed a dish on 2026-08-05,
              where the five-second test was written under the prescription. The claim itself has to
              stop being wrong.

              This component serves five surfaces, so it cannot know his real total without being
              told. It can stop asserting one: naming its own source is both honest and something it
              can actually check. */}
          {sessions.length === 1
            ? 'Only one session here so far. This block reads the per-second detail the watch exports, which holds one of these; the watch itself may hold more, and the log below is the fuller record.'
            : 'Nothing recorded yet. Sessions arrive with the daily watch export.'}
        </p>
      </div>
    );
  }

  /* Oldest first: a trend reads left to right, and Trace marks its LAST point as the current one. */
  const chrono = [...sessions].reverse();
  const cols = columns(kind);
  const trend = TREND[kind];
  const points = trend
    ? chrono.map(trend.of).filter((n): n is number => n != null && Number.isFinite(n))
    : [];

  /* A TRACE NORMALISES min TO max AND FILLS THE HEIGHT, so a series that barely moves is drawn as
     dramatically as one that doubles. On a single session that never mattered: a heart rate over an
     hour has a wide natural range. Across sessions it does. His last ten swims run SWOLF 35.5 to
     37.7, a spread of about 6%, and the chart shows it as a mountain range.

     The range is printed beside every trace already, which is this site's rule about numbers living
     in HTML rather than inside the viewBox. This adds the sentence, because the number alone does
     not stop a shape being read as a story. It fires on any near-flat series on any discipline
     rather than being a note about swimming. */
  const spread =
    points.length >= 3
      ? (Math.max(...points) - Math.min(...points)) /
        (points.reduce((a, b) => a + b, 0) / points.length || 1)
      : 0;
  const nearlyFlat = points.length >= 3 && spread > 0 && spread < 0.08;

  return (
    <div className="exgroup">
      <div className="exgroup-label">
        The last {sessions.length} <span className="tag">({shortDate(chrono[0]!.date)} to {shortDate(chrono[chrono.length - 1]!.date)})</span>
      </div>

      {/* Trace needs three points to draw a line. Below that the table below is the honest view and
          a two-point "trend" would be a straight line between two numbers pretending to be one. */}
      {trend && points.length >= 3 && (
        <>
          <Trace
            values={points}
            label={trend.label}
            unit={trend.unit}
            over="these sessions"
            {...(trend.floor != null ? { floor: trend.floor } : {})}
          />
          <p className="ex-cue">
            {trend.note}
            {points.length < chrono.length && (
              <>
                {' '}Drawn from {points.length} of these {chrono.length} sessions: the rest did not
                record it.
              </>
            )}
            {nearlyFlat && (
              <>
                {' '}The whole range here is {Math.round(Math.min(...points) * 10) / 10} to{' '}
                {Math.round(Math.max(...points) * 10) / 10}
                {trend.unit ? ` ${trend.unit}` : ''}, about {Math.round(spread * 100)}%. The chart
                fills its height whatever the spread, so that shape is small movement magnified,
                not a trend.
              </>
            )}
          </p>
        </>
      )}

      <div className="table-scroll">
        <table className="plan-table">
          <thead>
            <tr>
              <th className="wide">Date</th>
              {cols.map((c) => (
                <th key={c.head} className={c.num ? 'tnum' : undefined}>
                  {c.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Newest FIRST in the table, oldest first in the chart above it, and that is not an
                inconsistency: a chart is read left to right as time passing, a list is read from the
                top as "what happened lately". The same split /health's fortnight and its strip use. */}
            {sessions.map((s) => (
              <tr key={s.uuid}>
                <td>{shortDate(s.date)}</td>
                {cols.map((c) => (
                  <td key={c.head} className={c.num ? 'tnum' : undefined}>
                    {c.of(s) || <span className="quiet">-</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
