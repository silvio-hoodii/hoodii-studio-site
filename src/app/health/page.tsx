import { getBodyCompSeries, getBodyCompSummary, getLiftingAdherence, getSwimSummary } from '@/lib/health/db';
import { AdherenceStrip, BarChart, LineChart } from './HealthCharts';

export const dynamic = 'force-dynamic';

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
  const [bodySummary, weightSeries, bfSeries, swim, adherence] = await Promise.all([
    getBodyCompSummary(),
    getBodyCompSeries(120).then((rows) => rows.filter((r) => r.kg != null).map((r) => ({ date: r.date, value: r.kg as number }))),
    getBodyCompSeries(120).then((rows) => rows.filter((r) => r.bf_pct != null).map((r) => ({ date: r.date, value: r.bf_pct as number }))),
    getSwimSummary(90),
    getLiftingAdherence(30),
  ]);

  const trainedCount = adherence.filter((d) => d.trained).length;
  const loggedCount = adherence.filter((d) => d.trained && d.logged).length;
  /* Counting a day the export never reached as a rest day is the same lie the strip used to draw. */
  const unknownDays = adherence.filter((d) => !d.known).length;
  const lastKnown = [...adherence].reverse().find((d) => d.known)?.date ?? null;

  return (
    <div className="wrap">
      <h1>Health</h1>
      <p className="lede">
        Weight, swim history, and lifting attendance, pulled from the Samsung Health export pipeline
        that already runs on the laptop. Read-only: nothing here is loggable, and healthos.db stays
        the source of truth.
      </p>

      {/* The mirror is filled by a one-shot migration. Until a scheduled sync replaces it, the only
        * honest thing this page can do about its own age is say it out loud. */}
      {bodySummary.stale && (
        <div className="stale">
          <span className="k">Stale</span>
          Last measurement was {bodySummary.daysSinceLatest} days ago, on {bodySummary.latest?.date}.
          Nothing below has moved since then, and the days after it are not rest days, they are days
          this page knows nothing about.
        </div>
      )}

      <hr className="divider" style={{ marginTop: 24 }} />

      <div className="section">
        <div className="section-head"><h2>Weight & body fat</h2></div>
        {bodySummary.latest ? (
          <>
            <div className="stats">
              <div>
                <div className="stat-label">Weight</div>
                <div className="stat-value tnum">
                  {bodySummary.latest.kg?.toFixed(1)}<span className="unit">kg</span>
                </div>
                <div className="stat-delta down">{trendLine(bodySummary.trend30)}</div>
              </div>
              {bodySummary.latest.bf_pct != null && (
                <div>
                  <div className="stat-label">Body fat</div>
                  <div className="stat-value tnum">
                    {bodySummary.latest.bf_pct.toFixed(1)}<span className="unit">%</span>
                  </div>
                  <div className="stat-delta">{bodySummary.latest.date}</div>
                </div>
              )}
            </div>
            <LineChart points={weightSeries} unit="kg" decimals={1} />
            {bfSeries.length > 1 && (
              <div style={{ marginTop: 20 }}>
                <LineChart points={bfSeries} unit="%" decimals={1} />
              </div>
            )}
          </>
        ) : (
          <p className="empty">No body composition data yet.</p>
        )}
      </div>

      <div className="section">
        <div className="section-head"><h2>Swim history</h2></div>
        <div className="stats">
          <div>
            <div className="stat-label">Longest</div>
            <div className="stat-value tnum">{Math.round(swim.longestDistanceM ?? 0)}<span className="unit">m</span></div>
          </div>
          <div>
            <div className="stat-label">Best pace / 100m</div>
            <div className="stat-value tnum">{msToPace(swim.bestPacePer100mMs)}</div>
          </div>
          <div>
            <div className="stat-label">Total sessions</div>
            <div className="stat-value tnum">{swim.totalSessions}</div>
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
              {' '}The export stops at {lastKnown ?? 'no date at all'}, so the last{' '}
              <span className="tnum">{unknownDays}</span> day{unknownDays === 1 ? '' : 's'} are
              unknown rather than rest, and those counts cover only the days before it.
            </>
          )}
        </p>
        <AdherenceStrip days={adherence} />
      </div>
    </div>
  );
}
