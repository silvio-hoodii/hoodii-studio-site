import { mmss, type SessionDetail, type SessionKind } from '@/lib/gym/session';
import { shortDate } from '@/lib/format';
import { Trace } from './SessionCharts';
import Readout from '@/components/Readout';

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
    note: 'Lower is better.',
  },
  treadmill: {
    label: 'Cadence',
    unit: 'spm',
    of: (s) => s.avgCadence,
    /* No floor: a fixed 170 contradicted the step-rate cue, whose target is his own baseline x 1.05. */
    note: 'Higher is better.',
  },
  strength: {
    label: 'Under 110 bpm',
    unit: '%',
    of: (s) => s.pctEasy,
    note: 'Lower is a denser session.',
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
  nounPlural = 'sessions',
}: {
  /* WHAT THESE ROWS ARE, spelled out on the surface that draws more than one discipline. The heading
   * read "The last 10" with no noun at all, which is exact on /swim and a claim about all four
   * disciplines on /health. See the note on LastSession for the incident. Defaulted, so the four
   * discipline routes are untouched. */
  sessions: SessionDetail[];
  kind: SessionKind;
  nounPlural?: string;
}) {
  /* ONE SESSION IS NOT A HISTORY, so nothing renders, since 2026-09-15. It printed "Before that" over
     "Only one session here so far", which is a fact about health_session_detail (one cycling row)
     and not about him (76 rides back to 2021, one link away on /bike/log). The empty case needs no
     sentence either: LastSession above already says nothing is recorded. */
  if (sessions.length <= 1) return null;

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
        The last {sessions.length} {nounPlural} <span className="tag">({shortDate(chrono[0]!.date)} to {shortDate(chrono[chrono.length - 1]!.date)})</span>
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
            {points.length < chrono.length && <> {points.length} of {chrono.length}.</>}
            {nearlyFlat && (
              <>
                {' '}The whole range here is {Math.round(Math.min(...points) * 10) / 10} to{' '}
                {Math.round(Math.max(...points) * 10) / 10}
                {trend.unit ? ` ${trend.unit}` : ''}, about {Math.round(spread * 100)}%.
              </>
            )}
          </p>
        </>
      )}

      <SessionBars sessions={chrono} kind={kind} />

      {/* The table is the record and stays one tap away; the bars above are the glance. His ask,
          2026-09-27: "more graphic stuff instead of just walls of text". */}
      <details className="fold">
        <summary>Every session, as a table</summary>
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
      </details>
    </div>
  );
}

/* How much each session was, one bar per session, oldest on the left, the value printed on the bar.
   Minutes for lifting and cycling, distance for swimming and running: the quantity the session is
   planned in. A session with no reading gets a hairline, not a gap, so the count still matches. */
const AMOUNT: Record<string, { of: (s: SessionDetail) => number | null; fmt: (n: number) => string; label: string }> = {
  swimming: { of: (s) => s.distanceM, fmt: (n) => `${Math.round(n)}`, label: 'metres' },
  treadmill: { of: (s) => (s.distanceM ? s.distanceM / 1000 : null), fmt: (n) => n.toFixed(1), label: 'km' },
  running: { of: (s) => (s.distanceM ? s.distanceM / 1000 : null), fmt: (n) => n.toFixed(1), label: 'km' },
  strength: { of: (s) => s.minutes, fmt: (n) => `${Math.round(n)}`, label: 'minutes' },
};

function SessionBars({ sessions, kind }: { sessions: SessionDetail[]; kind: SessionKind }) {
  const a = AMOUNT[kind] ?? { of: (s: SessionDetail) => s.minutes, fmt: (n: number) => `${Math.round(n)}`, label: 'minutes' };
  const vals = sessions.map((s) => a.of(s));
  const max = Math.max(1, ...vals.map((v) => v ?? 0));
  const n = sessions.length;
  const W = 340;
  const H = 90;
  const gap = 6;
  const bw = (W - gap * (n - 1)) / n;
  return (
    <figure className="sbars">
      <Readout>
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={`${a.label} per session, oldest first`}>
        {sessions.map((s, i) => {
          const v = vals[i];
          const h = v ? Math.max(2, (v / max) * (H - 14)) : 1;
          const x = i * (bw + gap);
          const last = i === n - 1;
          return (
            <g key={s.uuid} data-r={`${shortDate(s.date)}, ${v != null && v > 0 ? `${a.fmt(v)} ${a.label}` : 'not recorded'}`}>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              <rect className="vbar" style={{ ['--i' as string]: i }} x={x} y={H - h} width={bw} height={h} rx="1.5" fill="currentColor" opacity={last ? 1 : 0.45} />
              {v != null && v > 0 && (
                <text x={x + bw / 2} y={H - h - 4} textAnchor="middle" className="sv">{a.fmt(v)}</text>
              )}
            </g>
          );
        })}
        <text x={0} y={H + 13} className="sd">{shortDate(sessions[0]!.date)}</text>
        <text x={W} y={H + 13} textAnchor="end" className="sd">{shortDate(sessions[n - 1]!.date)}</text>
      </svg>
      </Readout>
      <figcaption>{a.label}</figcaption>
    </figure>
  );
}
