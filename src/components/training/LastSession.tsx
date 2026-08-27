import { sessionVerdict, type SessionDetail } from '@/lib/gym/session';
import { shortDate } from '@/lib/format';
import { Trace, LengthBars, SessionStats } from './SessionCharts';

/* THE LAST SESSION, drawn. Built 2026-08-22 from the per-second data the watch has always recorded
 * and nothing had ever read.
 *
 * The four activities get DIFFERENT panels because they carry different data, and the two that
 * carry only a heart rate say so instead of being padded out to look equally analysed. That is the
 * difference between an analysis and the "slop sitting there without any real reason" he objected
 * to: every element here exists because that activity produced the number behind it.
 *
 * Shared since 2026-08-26. /gym/conditioning draws it for lifting, running and cycling; /swim draws
 * it for swimming. One component, because the swim panel is the branch that already existed inside
 * it and copying the file to a second route is how the two would drift. */
export default function LastSession({ s }: { s: SessionDetail | null }) {
  if (!s) {
    return (
      <div className="exgroup">
        <div className="exgroup-label">Your last session</div>
        <p className="ex-cue">
          Nothing recorded yet for this one. Sessions arrive with the daily watch export.
        </p>
      </div>
    );
  }
  const verdict = sessionVerdict(s);
  const isSwim = s.kind === 'swimming';
  const isRun = s.kind === 'treadmill' || s.kind === 'running';
  return (
    <div className="exgroup">
      <div className="exgroup-label">
        Your last session <span className="tag">({shortDate(s.date)})</span>
      </div>
      <SessionStats s={s} />
      {isSwim && s.series.lengths && (
        <LengthBars lengths={s.series.lengths} poolLength={s.poolLength} />
      )}
      {isRun && s.series.cadence && (
        <Trace values={s.series.cadence} label="Cadence" unit="spm" floor={170} />
      )}
      {/* Heart rate last for the two that have other data, and alone for the two that do not.
          The 110 rule is drawn only on a lifting session, where it is the whole point. */}
      {s.series.hr?.length > 2 && (
        <Trace
          values={s.series.hr}
          label="Heart rate"
          unit="bpm"
          {...(s.kind === 'strength' ? { floor: 110 } : {})}
        />
      )}
      {verdict && <p className="ex-cue" style={{ marginTop: 10 }}>{verdict}</p>}
    </div>
  );
}
