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
export default function LastSession({ s, noun = 'session' }: {
  s: SessionDetail | null;
  /* WHAT THIS BLOCK IS ACTUALLY SHOWING. Added 2026-08-28 (09-health P1-4).
   *
   * The heading said "Your last session" on every surface, and on /health that is a lie: /health has
   * been THE TRAINING INDEX since 2026-08-27, its lede names four disciplines, and this block is fed
   * `getRecentSessions('strength')`. Live, his newest three sessions are a swim, then the lift, then
   * an auto-detected one; the page rendered "Your last session (Aug 25)" over the lift while the swim
   * had started ninety minutes after it finished.
   *
   * Same class as the "Best this year" tile over a date from the previous September that AGENTS.md
   * records from /swim/deep. AGENTS.md's own description of this tab already uses the right word:
   * "last lift, the last ten lifts trended".
   *
   * Defaulted, so /swim, /run and /bike are untouched: on a discipline route the block IS about that
   * discipline and "session" is exact. Only the index has to say which kind. */
  noun?: string;
}) {
  if (!s) {
    return (
      <div className="exgroup">
        <div className="exgroup-label">Your last {noun}</div>
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
        Your last {noun} <span className="tag">({shortDate(s.date)})</span>
      </div>
      <SessionStats s={s} />
      {isSwim && s.series.lengths && (
        <LengthBars lengths={s.series.lengths} poolLength={s.poolLength} />
      )}
      {isRun && s.series.cadence && (
        <Trace values={s.series.cadence} label="Cadence" unit="spm" floor={170} />
      )}
      {/* BELT SPEED, stored on every run the watch ever recorded and drawn by nothing until
          2026-08-27. This is the chart that shows the walk and run blocks as blocks: the plan is
          intervals on a clock, and until now the only way to see whether he actually ran them was
          the cadence trace, which answers a different question.

          CONVERTED TO km/h, AND THE UNIT WAS CHECKED RATHER THAN ASSUMED. The stored series is
          metres per second: on all five runs its average matches distance divided by duration in
          m/s and never the 3.6x figure. km/h is what it is drawn in because km/h is what the
          treadmill console shows and what content/gym/conditioning.json tells him to dial, and a
          speed he cannot find on the machine in front of him is a number he cannot use. */}
      {isRun && s.series.speed && s.series.speed.length > 2 && (
        <Trace
          values={s.series.speed.map((v) => v * 3.6)}
          label="Belt speed"
          unit="km/h"
        />
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
