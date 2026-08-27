import Link from 'next/link';
import type { Metadata } from 'next';
import { getGymLog, countGymLog, getSetsForDates, getWatchLog, countWatchLog, watchLogSpan } from '@/lib/gym/log';
import { loadProgram } from '@/lib/gym/program';
import { shortDate, logDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lifting, the whole record',
  description: 'Every session the app logged, and every one the watch saw.',
  alternates: { canonical: '/gym/log' },
  robots: { index: false, follow: false },
};

/* THE LIFTING LOG. Built 2026-08-27, Decision 7 of docs/GYM-AUDIT-AND-PLAN-2026-08-27.md.
 *
 * A ROUTE AND NOT A TAB, following /swim/deep, which was his call on the same question in the same
 * week. /gym is ten phone screens already and it is the page he holds between sets; this is the page
 * he reads afterwards.
 *
 * WHAT IT IS FOR, in one sentence: two records of the same sessions disagree by a factor of three
 * and nothing put them side by side. `gym_session` says all 33 of its rows finished. `gym_set` holds
 * about a third of what the programme asked for. Whether that gap is work he did not type or a
 * prescription that is too big has the same signature either way, and opposite fixes. On 2026-08-16
 * the watch recorded 68 minutes of strength training and the app logged ONE set. That single row
 * answers the question, and it took three months to become visible because nothing displayed it.
 *
 * THE TWO TIERS ARE LABELLED AND NEVER BLENDED. The app knows what he lifted since 2026-05-25, 33
 * sessions with weights and reps. The watch knows he trained since 2023-04-24, 698 sessions with a
 * heart rate and nothing else. Presenting either as "the record" would be false, and merging them
 * into one list would imply the older rows lost their sets rather than never having had any.
 *
 * NO CHARTS. /swim/deep earned its charts on 19,327 lengths. Thirty-three sessions do not, and a
 * trend line over a set count that is really a typing count would be the same inference error this
 * page exists to correct. */

/** Minutes, preferring the watch and saying when it is the page timer instead.
 *
 *  `finished_at - started_at` is time with the PAGE OPEN, not session duration: one row reads 330
 *  minutes because a tab was left open, and another reads 130 against the watch's 65. So the watch
 *  wins wherever it recorded anything, and the page timer is only shown where it is all there is. */
function minutesCell(watch: number | null, pageOpen: number | null): string | null {
  if (watch != null) return `${watch}m`;
  if (pageOpen != null) return `${pageOpen}m?`;
  return null;
}

export default async function GymLogPage() {
  /* Named once so the query and the sentence describing it cannot drift apart. 698 strength sessions
     exist and this page reads the newest slice of them; a page that showed a slice while implying it
     showed everything is finding 37 in the audit, with different data. */
  const WATCH_LIMIT = 60;
  const [appRows, appTotal, watchRows, watchTotal, span] = await Promise.all([
    getGymLog(60),
    countGymLog(),
    getWatchLog(['strength'], WATCH_LIMIT),
    countWatchLog(['strength']),
    watchLogSpan(['strength']),
  ]);
  const sets = await getSetsForDates(appRows.map((r) => r.date));

  /* WHICH EXERCISES ARE TIMED, so a carry does not read as 130 repetitions.
   *
   * `gym_set` stores a weight and a `reps` number and nothing that says which unit `reps` is in. The
   * farmer carry is 50 lb for 130 SECONDS and rendered as "50x130", which is the same shape as
   * "170x8" and reads as a rep count. Caught by looking at the rendered page, not by any gate.
   *
   * The lookup is against TODAY's programme, so an exercise that has since left the file gets no
   * suffix rather than a guessed one. That is the honest failure: the unit for a historic set of a
   * deleted exercise is not recoverable from the database, and inventing it is worse than omitting
   * it. Same reason `sets_prescribed` is not backfilled. */
  const program = await loadProgram();
  const timed = new Set<string>();
  for (const day of Object.values(program.days)) {
    for (const block of day.blocks) {
      for (const ex of block.exercises) {
        if (ex.timed) timed.add(ex.id);
        for (const alt of ex.alts ?? []) if (alt.timed) timed.add(alt.id);
      }
    }
  }

  /* Dates the app has, so the watch tier can skip them: a date in both tiers would appear twice and
     read as two sessions. The watch tier is therefore "sessions the app never saw", which is what
     makes it worth its own heading rather than being the same list with fewer columns. */
  const appDates = new Set(appRows.map((r) => r.date));
  const watchOnly = watchRows.filter((r) => !appDates.has(r.date));

  /* Same rule as SessionLog: the year appears only where the list spans one. Tier 1 is all 2026, so
     it stays "Aug 25". Tier 2 reaches back to 2023-04-24, so it needs the year or two rows a year
     apart read identically. Computed from the rows on screen, not asserted. */
  const watchYears = new Set(watchOnly.map((r) => r.date.slice(0, 4)));
  const watchFmt = watchYears.size > 1 ? logDate : shortDate;

  return (
    /* No `training` class on the wrap: src/app/gym/layout.tsx already wraps every route under /gym
       in it, so this route gets the stylesheet, the site header and the five-route nav for free. */
    <div className="wrap">
      <h1>Lifting, the whole record</h1>

      <p className="lede">
        <Link href="/gym">Back to the workout</Link>
      </p>

      {/* ---------------------------------------------------------------- tier 1, the app's record */}
      <div className="count" style={{ marginTop: 26 }}>What you lifted</div>
      <p className="lede quiet" style={{ marginTop: 4 }}>
        {appTotal} sessions since {shortDate(appRows[appRows.length - 1]?.date ?? '2026-05-25')}, with
        the weights and reps you typed.
      </p>

      <div className="log log-gym">
        <div className="log-head">
          <span>{appRows.length === appTotal ? `all ${appTotal}` : `${appRows.length} of ${appTotal}`}</span>
        </div>
        <div className="log-table" role="table">
          <div className="log-row log-row-head" role="row">
            <span className="log-date" role="columnheader">Date</span>
            <span className="log-cell" role="columnheader">Day</span>
            <span className="log-cell tnum" role="columnheader">Time</span>
            <span className="log-cell tnum" role="columnheader">Sets</span>
          </div>
          {appRows.map((r) => {
            const mine = sets[r.date] ?? [];
            /* Grouped by exercise so the expansion reads like a training log rather than a dump of
               rows. Order is the order they were logged in, which is the order he did them. */
            const byEx = new Map<string, { name: string; done: string[] }>();
            for (const s of mine) {
              const key = s.exerciseId;
              const e = byEx.get(key) ?? { name: s.exerciseName ?? s.exerciseId, done: [] };
              const unit = timed.has(s.exerciseId) ? 's' : '';
              e.done.push(
                s.weight != null && s.weight > 0
                  ? `${s.weight}x${s.reps}${unit}`
                  : `${s.reps}${unit}`,
              );
              byEx.set(key, e);
            }
            return (
              <details className="log-detail" key={r.date}>
                <summary>
                  <span className="log-row" role="row">
                    <span className="log-date" role="cell">{shortDate(r.date)}</span>
                    <span className="log-cell" role="cell">
                      {r.dayTitle ? r.dayTitle.split(':')[0] : (r.day ?? '-')}
                    </span>
                    <span className="log-cell tnum" role="cell">
                      {minutesCell(r.watchMinutes, r.pageOpenMin) ?? '-'}
                    </span>
                    <span className="log-cell tnum" role="cell">
                      {r.setsPrescribed != null ? `${r.setsLogged}/${r.setsPrescribed}` : `${r.setsLogged}`}
                    </span>
                  </span>
                </summary>
                <div className="log-sets">
                  {byEx.size === 0 ? (
                    <p className="log-caption">
                      No sets were typed on this day. The session was marked {r.status ?? 'finished'}
                      {r.watchMinutes != null ? `, and the watch recorded ${r.watchMinutes} minutes of lifting` : ''}.
                    </p>
                  ) : (
                    [...byEx.values()].map((e) => (
                      <div className="log-set-row" key={e.name}>
                        <span className="log-set-name">{e.name}</span>
                        <span className="log-set-vals tnum">{e.done.join('  ')}</span>
                      </div>
                    ))
                  )}
                  {r.pctEasy != null && (
                    <p className="log-caption">{r.pctEasy}% of the session was under 110 bpm.</p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
        <p className="log-caption">
          <strong>Sets</strong> is what you ticked, over what the programme asked for that day. The
          second number is stamped when a session starts, so it survives the programme changing
          afterwards; the sessions before 2026-08-27 have no denominator because nothing recorded one,
          and inventing it from today&apos;s programme would misstate the past.{' '}
          <strong>Time</strong> is what the watch recorded. A{' '}
          <span className="tnum">?</span> means the watch saw nothing and the figure is how long this
          page was open, which on one day was 330 minutes.
        </p>
      </div>

      {/* ------------------------------------------------------- tier 2, everything the watch saw */}
      <div className="count" style={{ marginTop: 34 }}>That you trained</div>
      <p className="lede quiet" style={{ marginTop: 4 }}>
        {watchTotal} strength sessions the watch recorded
        {span.first ? `, back to ${logDate(span.first)}` : ''}. These carry a heart rate and nothing
        else: no reps, no load, no rest.
      </p>
      {/* THE CAP, SAID OUT LOUD. `shortDate` was used for the span date above and rendered
        * 2023-04-24 as "Apr 24", which reads as this April: the same ambiguity that put years on the
        * bike log an hour earlier. Fixed with logDate rather than by widening a column. */}
      <p className="lede quiet" style={{ marginTop: 4 }}>
        This page reads the {WATCH_LIMIT} most recent of them, and {watchOnly.length} of those are
        sessions the app has no record of. The other {Math.max(0, watchTotal - WATCH_LIMIT)} are in
        the export and not on this screen.
      </p>

      <div className={`log log-watch${watchYears.size > 1 ? ' log-years' : ''}`}>
        <div className="log-head">
          <span>{watchOnly.length} of the {WATCH_LIMIT} newest, unseen by the app</span>
        </div>
        <div className="log-table" role="table">
          <div className="log-row log-row-head" role="row">
            <span className="log-date" role="columnheader">Date</span>
            <span className="log-cell" role="columnheader">Kind</span>
            <span className="log-cell tnum" role="columnheader">Time</span>
            <span className="log-cell tnum" role="columnheader">Easy</span>
          </div>
          {watchOnly.map((r) => (
            <div className="log-row" key={`${r.date}-${r.kind}`} role="row">
              <span className="log-date" role="cell">{watchFmt(r.date)}</span>
              <span className="log-cell" role="cell">{r.kind}</span>
              <span className="log-cell tnum" role="cell">{r.minutes != null ? `${r.minutes}m` : '-'}</span>
              <span className={`log-cell tnum${r.pctEasy == null ? ' log-none' : ''}`} role="cell">
                {r.pctEasy != null ? `${r.pctEasy}%` : '-'}
              </span>
            </div>
          ))}
        </div>
        <p className="log-caption">
          <strong>Easy</strong> is the percent under 110 bpm, and it is blank on most rows because the
          per-second detail only reaches back to 2026-04-25. The dates go back much further than the
          detail does.
        </p>
      </div>
    </div>
  );
}
