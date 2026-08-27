import { getBodyCompSeries, getBodyCompSummary, getLiftingAdherence, getSwimSummary, getSyncLiveness } from '@/lib/health/db';
import { AdherenceStrip, BarChart, LineChart } from './HealthCharts';
import { daysAgoText } from '@/lib/format';

/* ISR, thirty minutes. Body composition changes when a measurement is taken, not per request.
 * CURRENT.md's own staleness flag is measured in DAYS, so half an hour costs nothing. */
export const revalidate = 1800;

function msToPace(ms: number | null): string {
  if (!ms) return 'N/A';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function trendLine(t: { fromDate: string; spanDays: number; kg: number; perWeek: number } | null): string {
  if (!t) return 'not enough history';
  const sign = (n: number) => (n > 0 ? '+' : '');
  return `vs ${t.fromDate} (${t.spanDays} d): ${sign(t.kg)}${t.kg} kg, ${sign(t.perWeek)}${t.perWeek} kg/wk`;
}

export default async function HealthPage() {
  const [bodySummary, weightSeries, bfSeries, swim, adherence, sync] = await Promise.all([
    getBodyCompSummary(),
    getBodyCompSeries(120).then((rows) => rows.filter((r) => r.kg != null).map((r) => ({ date: r.date, value: r.kg as number }))),
    getBodyCompSeries(120).then((rows) => rows.filter((r) => r.bf_pct != null).map((r) => ({ date: r.date, value: r.bf_pct as number }))),
    getSwimSummary(90),
    getLiftingAdherence(30),
    getSyncLiveness(),
  ]);

  const days = adherence.days;
  const trainedCount = days.filter((d) => d.trained).length;
  const loggedCount = days.filter((d) => d.trained && d.logged).length;
  /* Counting a day the export never reached as a rest day is the same lie the strip used to draw. */
  const unknownDays = days.filter((d) => !d.known).length;
  const horizon = adherence.horizon;

  return (
    <div className="wrap">
      <h1>Health</h1>
      <p className="lede">
        Weight, swim history, and lifting attendance, pulled from the Samsung Health export pipeline
        that already runs on the laptop. Read-only: nothing here is loggable, and healthos.db stays
        the source of truth.
      </p>

      {/* Two different things can be wrong here and they used to share one sentence.
        *
        * The MIRROR can stop being written, which is a broken pipeline and nothing on this page can
        * be trusted to be current. Or he can simply not have stepped on the scale, which is not a
        * fault at all and the numbers below are still the last true ones. A page that says "stale"
        * for both is doing what /music's collector alarm exists to prevent: letting a dead job look
        * like a quiet week. The sync writes a row every run now, so this can tell them apart. */}
      {sync.stale && (
        <div className="stale">
          <span className="k">Not syncing</span>
          {sync.lastOkAt
            ? `The mirror behind this page last updated ${daysAgoText(Math.floor((sync.hoursSince ?? 0) / 24))}.`
            : 'The mirror behind this page has never recorded a successful update.'}{' '}
          Everything below is whatever it held at that point, whether or not the laptop has newer
          numbers. Run <code>node content/health/sync.mjs</code> in hoodii-studio-site.
          {sync.lastError && <span className="why">{sync.lastError}</span>}
        </div>
      )}

      {!sync.stale && bodySummary.stale && (
        <div className="stale">
          <span className="k">No recent measurement</span>
          The sync is running, so this is current: the last time you weighed in was{' '}
          {daysAgoText(bodySummary.daysSinceLatest ?? 0)}, on {bodySummary.latest?.date}. Nothing
          below has moved since then, and the days after it are not rest days, they are days this
          page knows nothing about.
        </div>
      )}

      <hr className="divider" style={{ marginTop: 24 }} />

      <div className="section">
        <div className="section-head"><h2>Weight & body fat</h2></div>
        {bodySummary.latest ? (
          <>
            <div className="stats">
              <div>
                <div className="stat-k">Weight</div>
                <div className="stat-v">
                  {bodySummary.latest.kg?.toFixed(1)}<span className="stat-u">kg</span>
                </div>
                <div className="stat-d down">{trendLine(bodySummary.trend30)}</div>
              </div>
              {bodySummary.latest.bf_pct != null && (
                <div>
                  <div className="stat-k">Body fat</div>
                  <div className="stat-v">
                    {bodySummary.latest.bf_pct.toFixed(1)}<span className="stat-u">%</span>
                  </div>
                  <div className="stat-d">{bodySummary.latest.date}</div>
                </div>
              )}
            </div>
            {/* Side by side above 1024, stacked below it, from one grid. The captions arrive with
                the pairing and are not decoration: stacked, the two charts were told apart by the
                unit on a single endpoint label, and read side by side that stops being enough. */}
            <div className="pair">
              <figure className="chartfig">
                <figcaption className="chart-cap">Weight, kg</figcaption>
                <LineChart points={weightSeries} unit="kg" decimals={1} />
              </figure>
              {bfSeries.length > 1 && (
                <figure className="chartfig">
                  <figcaption className="chart-cap">Body fat, %</figcaption>
                  <LineChart points={bfSeries} unit="%" decimals={1} />
                </figure>
              )}
            </div>
          </>
        ) : (
          <p className="empty">No body composition data yet.</p>
        )}
      </div>

      <div className="section">
        <div className="section-head"><h2>Swim history</h2></div>
        {/* The explanation goes here, once, rather than into the tiles. Same shape as the lifting
            section below, which explains watch-versus-app in prose and then shows numbers. */}
        {swim.bestMovingPacePer100mMs != null && (
          <p className="lede" style={{ marginTop: 0, marginBottom: 14 }}>
            Two paces, because a swim includes standing at the wall. Whole session counts that rest;
            swimming pace removes it, and exists for{' '}
            <span className="tnum">{swim.movingPaceSessions}</span> of{' '}
            <span className="tnum">{swim.totalSessions}</span> sessions, the ones the watch timed
            length by length.
          </p>
        )}
        <div className="stats">
          <div>
            <div className="stat-k">Longest</div>
            <div className="stat-v">{Math.round(swim.longestDistanceM ?? 0)}<span className="stat-u">m</span></div>
          </div>
          {/* "Best pace / 100m" was ONE tile reading 1:31, and it was wrong in the way that is
              hardest to notice: not out of range, just quietly answering a different question than
              its label asked. It came from a column computed two ways (see content/health/schema.sql)
              and a minimum always picks the flattering one, so it reported a rest-excluded pace off a
              300 m session that ran 25 minutes with 4 minutes of swimming in it, and it was FASTER
              than his official 100 m personal best of 1:38.71. Two tiles now, each saying which
              clock it ran on, because the honest version of this number needs the qualifier more
              than it needs to be a single figure. */}
          {/* CAPTIONS STAY SHORT because `.stats` is a wrap-flex and a tile is as wide as its widest
              child. The first version of this said "whole session, rest included" and "rest
              excluded, from 364 of 475 sessions", which measured at 390px as four tiles on four
              rows with the captions spilling across the row above. Two words each, and the
              distinction lives in the label. */}
          <div>
            <div className="stat-k">Best pace / 100m</div>
            <div className="stat-v">{msToPace(swim.bestWallPacePer100mMs)}</div>
            <div className="stat-d">whole session</div>
          </div>
          {swim.bestMovingPacePer100mMs != null && (
            <div>
              <div className="stat-k">Swimming pace / 100m</div>
              <div className="stat-v">{msToPace(swim.bestMovingPacePer100mMs)}</div>
              <div className="stat-d">rest removed</div>
            </div>
          )}
          <div>
            <div className="stat-k">Total sessions</div>
            <div className="stat-v">{swim.totalSessions}</div>
          </div>
        </div>
        <BarChart
          points={swim.sessions.filter((s) => s.distanceM != null).map((s) => ({ date: s.date, value: s.distanceM as number }))}
          unit="m"
        />
      </div>

      <div className="section">
        <div className="section-head"><h2>Lifting attendance, last 30 days</h2></div>
        <p className="lede" style={{ marginTop: 0, marginBottom: 14 }}>
          Attendance is read from the watch, which records every session: the gym app only sees
          sessions logged there. <span className="live tnum">{trainedCount}</span> trained,{' '}
          <span className="tnum">{loggedCount}</span> also logged
          {trainedCount > loggedCount ? `, ${trainedCount - loggedCount} trained but unlogged` : ''}.
          {unknownDays > 0 && (
            <>
              {' '}The watch export stops at {horizon ?? 'no date at all'}, so{' '}
              <span className="tnum">{unknownDays}</span> day{unknownDays === 1 ? '' : 's'} in this
              window are unknown rather than rest, and those counts cover only the days it reached.
            </>
          )}
        </p>
        <AdherenceStrip days={days} />
      </div>
    </div>
  );
}
