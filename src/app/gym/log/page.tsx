import Link from 'next/link';
import type { Metadata } from 'next';
import { getCombinedLog, countCombinedLog, getSetsForDates } from '@/lib/gym/log';
import { loadProgram } from '@/lib/gym/program';
import { shortDate, logDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lifting, the whole record',
  description: 'Every lifting session either the app or the watch recorded.',
  alternates: { canonical: '/gym/log' },
  robots: { index: false, follow: false },
};

/* THE LIFTING LOG. Built 2026-08-27, Decision 7, and rewritten the same hour on his reading of it.
 *
 * A ROUTE AND NOT A TAB, following /swim/deep, his call on the same question in the same week. /gym
 * is ten phone screens and it is the page he holds between sets; this is the page he reads after.
 *
 * WHAT IT IS FOR. Two records of the same sessions disagreed by a factor of three and nothing put
 * them side by side. `gym_session` says all 33 of its rows finished; `gym_set` holds about a third of
 * what the programme asked for. The first version of this page answered that and found something
 * bigger: 31 lifting sessions in June and July, at 83 to 128 minutes, that the app has no record of
 * whatsoever. He trains far more than the app has ever captured.
 *
 * ONE TABLE, AND THE FIRST VERSION HAD TWO. His words on it: "all says strenght so whats the point i
 * think the important part is the first one, or either one table with all of it". Both criticisms
 * land. The second table carried a `Kind` column reading "strength" on all 31 of its rows, on a page
 * whose entire subject is lifting, and the split cost a heading, three paragraphs and a duplicate set
 * of column labels to state what the data already states: a row with an empty Sets cell is a session
 * the app never saw.
 *
 * THE ABSENCE IS THE FINDING AND IT NEEDS NO PROSE. Same lesson as the header cut earlier today:
 * explaining a structure instead of building one that explains itself. */

/** Sets, or nothing at all where the app has no row for that date.
 *
 *  Three states, and they are three different facts:
 *    30/42  the app logged 30 of the 42 the day asked for
 *    30     the app logged 30 and nothing recorded the prescription (every row before 2026-08-27)
 *    blank  only the watch saw this session. NOT zero: zero means a session was opened and nothing
 *           typed, which is a different thing and does happen (2026-08-16 logged exactly one set). */
function setsCell(logged: number | null, prescribed: number | null): string | null {
  if (logged == null) return null;
  return prescribed != null ? `${logged}/${prescribed}` : String(logged);
}

export default async function GymLogPage() {
  const LIMIT = 120;
  const [rows, total] = await Promise.all([getCombinedLog(LIMIT), countCombinedLog()]);
  const sets = await getSetsForDates(rows.filter((r) => r.hasApp).map((r) => r.date));

  /* WHICH EXERCISES ARE TIMED, so a carry does not read as 130 repetitions. `gym_set` stores a number
   * called `reps` and nothing saying which unit it is in: the farmer carry is 50 lb for 130 SECONDS
   * and rendered as "50x130", the same shape as "170x8". Caught by looking at the rendered page.
   *
   * Looked up against TODAY's programme, so an exercise that has since left the file gets no suffix
   * rather than a guessed one. The unit for a historic set of a deleted exercise is not recoverable
   * from the database, and inventing it is worse than omitting it. */
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

  /* THE DAY LABEL COMES FROM THE LIVE PROGRAMME, NOT FROM THE STORED TITLE.
   *
   * `gym_session.day_title` holds sixteen distinct strings across three generations of the model.
   * Four contain an em dash ("Upper A - Press", with U+2014), which rendered straight onto his screen
   * on the first version of this page: lint-prose guards the repo's prose and cannot see a string
   * that arrives from Postgres. Four more ("BB Back Squat Lead", "Walking Lunge Lead") predate day
   * names entirely.
   *
   * So the label is looked up from `program.days[key].title` by the stored day KEY, which is stable
   * across all three generations. A row whose key is not in today's programme falls back to the
   * stored title with any separator stripped, and then to nothing: the honest ladder, same as the
   * timed-unit lookup above. */
  const dayLabel = (r: { dayKey: string | null; dayTitle: string | null }): string | null => {
    if (r.dayKey) {
      const d = program.days[r.dayKey as keyof typeof program.days];
      if (d?.title) return d.title.split(':')[0]?.trim() ?? null;
    }
    if (!r.dayTitle) return null;
    /* Split on a colon, an em dash or an en dash, whichever comes first. Written as \u escapes and
       not as literal characters: lint-prose refuses a dash character anywhere in the repo, and it
       offers a `lint-prose-allow` marker for lines that exist to strip them. An escape is better
       than an exemption, because the exemption would also permit a dash added here later. */
    return r.dayTitle.split(/[:\u2014\u2013]/)[0]?.trim() || null;
  };

  /* The year appears only where the list spans one, same rule as SessionLog. Computed from the rows
     on screen rather than asserted, because this list crosses a year boundary on its own. */
  const spansYears = new Set(rows.map((r) => r.date.slice(0, 4))).size > 1;
  const fmt = spansYears ? logDate : shortDate;
  const unlogged = rows.filter((r) => r.setsLogged == null).length;

  return (
    <div className="wrap">
      <h1>Lifting, the whole record</h1>
      <p className="lede">
        <Link href="/gym">Back to the workout</Link>
      </p>

      <div className={`log log-gymlog${spansYears ? ' log-years' : ''}`}>
        <div className="log-head">
          <span>{rows.length === total ? `all ${total}` : `${rows.length} of ${total}`}</span>
        </div>
        <div className="log-table" role="table">
          <div className="log-row log-row-head" role="row">
            <span className="log-date" role="columnheader">Date</span>
            <span className="log-cell" role="columnheader">Day</span>
            <span className="log-cell tnum" role="columnheader">Time</span>
            <span className="log-cell tnum" role="columnheader">Easy</span>
            <span className="log-cell tnum" role="columnheader">Sets</span>
          </div>

          {rows.map((r) => {
            const cells = (
              <span className="log-row" role="row">
                <span className="log-date" role="cell">{fmt(r.date)}</span>
                <span className={`log-cell${dayLabel(r) == null ? ' log-none' : ''}`} role="cell">
                  {dayLabel(r) ?? '-'}
                </span>
                <span className="log-cell tnum" role="cell">
                  {r.minutes != null ? `${r.minutes}m` : '-'}
                </span>
                <span className={`log-cell tnum${r.pctEasy == null ? ' log-none' : ''}`} role="cell">
                  {r.pctEasy != null ? `${r.pctEasy}%` : '-'}
                </span>
                <span className={`log-cell tnum${r.setsLogged == null ? ' log-none' : ''}`} role="cell">
                  {setsCell(r.setsLogged, r.setsPrescribed) ?? '-'}
                </span>
              </span>
            );

            /* A row only becomes a disclosure if there is something inside it. A watch-only session
               would otherwise offer a tap that reveals nothing, which reads as a broken control
               rather than as an absence. */
            const mine = sets[r.date] ?? [];
            if (!r.hasApp || mine.length === 0) {
              return (
                <div className="log-plain" key={r.date}>
                  {cells}
                </div>
              );
            }

            const byEx = new Map<string, { name: string; done: string[] }>();
            for (const s of mine) {
              const e = byEx.get(s.exerciseId) ?? { name: s.exerciseName ?? s.exerciseId, done: [] };
              const unit = timed.has(s.exerciseId) ? 's' : '';
              e.done.push(
                s.weight != null && s.weight > 0 ? `${s.weight}x${s.reps}${unit}` : `${s.reps}${unit}`,
              );
              byEx.set(s.exerciseId, e);
            }

            return (
              <details className="log-detail" key={r.date}>
                <summary>{cells}</summary>
                <div className="log-sets">
                  {[...byEx.values()].map((e) => (
                    <div className="log-set-row" key={e.name}>
                      <span className="log-set-name">{e.name}</span>
                      <span className="log-set-vals tnum">{e.done.join('  ')}</span>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>

        {/* ONE CAPTION, and every clause in it is load-bearing. The three paragraphs the first
          * version carried are gone: this says what the columns mean and what the blanks mean, and
          * nothing at all about how the page is put together. */}
        <p className="log-caption">
          <strong>{unlogged} of these {rows.length}</strong> have no sets: the watch saw the session
          and the app has no record of it. <strong>Sets</strong> is what you ticked over what the day
          asked for, stamped when the session starts so it survives the programme changing afterwards;
          rows before today have no denominator because nothing recorded one. <strong>Time</strong>{' '}
          and <strong>Easy</strong> are the watch&apos;s, Easy being the percent under 110 bpm, blank
          before 2026-04-25 where the per-second detail stops.
          {total > rows.length
            ? ` ${total - rows.length} older sessions are in the export and not on this screen.`
            : ''}
        </p>
      </div>
    </div>
  );
}
