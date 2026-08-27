import Link from 'next/link';
import { shortDate, logDate } from '@/lib/format';

/* THE SESSION LOG, one row per session, on every training surface. Built 2026-08-27, Decision 7.
 *
 * WHY IT EXISTS. `gym_session` had been written on every session since 2026-05-25 and displayed by
 * nothing. He asked "where is the history of sessions in the app" and the answer was that the app
 * kept one for three months and never showed him a row of it.
 *
 * DELIBERATELY NOT `RecentSessions`, which already exists in this directory and looks similar.
 * That component reads `health_session_detail` (80 strength rows, 60 swimming, ONE cycling) and
 * draws a trend across the last ten. This one reads the full-depth tables (`gym_session` for what he
 * lifted, `health_watch_session` for 698 strength sessions back to 2023) and draws no chart. The two
 * answer different questions and reading the shallow table for this one is precisely the bug that
 * has `/bike` telling him he has ridden once when the watch holds 76 rides.
 *
 * NO `.ex` OR `.exgroup-n` ANYWHERE IN HERE. On /gym, `.ex` means an exercise in today's workout and
 * `scripts/probe-gym.js` selects it to find the day's cards; a notes block borrowed it on 2026-08-27
 * and all 22 tests passed while the harness silently counted 28 exercises instead of 10.
 * `.exgroup-n` marks a day block and the probe now counts blocks with it. This component uses
 * `log-*` names of its own for exactly that reason: a shared look is a CSS decision, a shared class
 * name is an API.
 *
 * NO SILENT TRUNCATION. Every caller passes `total` and `shownFrom`, and the footer says what is not
 * on screen. The notes list on /gym caps at 20 rows and says nothing, which is finding 37. */

export interface LogColumn<T> {
  /** Column heading. Kept to one or two words: this is a mono strip on a 390px screen. */
  head: string;
  /** The cell, or null to render an em-space placeholder rather than a zero. */
  cell: (row: T) => string | null;
  /** Right-align numbers, left-align words. */
  num?: boolean;
}

export default function SessionLog<T extends { date: string }>({
  rows,
  columns,
  total,
  moreHref,
  moreLabel,
  caption,
  emptyNote,
  variant,
}: {
  rows: T[];
  columns: LogColumn<T>[];
  /** How many exist in total, so the footer can be honest about the cap. */
  total: number;
  /** Where the full record lives. Omitted on the full-record page itself. */
  moreHref?: string;
  moreLabel?: string;
  /** One short line, only where the reader needs to know which source a column came from. */
  caption?: string;
  emptyNote?: string;
  /** Modifier class carrying this surface's `grid-template-columns`, e.g. `log-gym`. Without one the
   *  rows are an unstyled grid and every column collapses to its content width, which lines nothing
   *  up. Declared here rather than derived from `columns.length` because two surfaces can have the
   *  same number of columns and want different widths. */
  variant: string;
}) {
  if (!rows.length) {
    return (
      <div className={`log ${variant}`}>
        <div className="log-head">
          <span>Sessions</span>
        </div>
        <p className="log-empty">{emptyNote ?? 'Nothing recorded yet.'}</p>
      </div>
    );
  }

  /* THE YEAR APPEARS WHEN, AND ONLY WHEN, THE LIST SPANS ONE. Decided here rather than by each
     caller, because the caller that forgets is the caller whose list just crossed a new year.
     /bike/log spans 2021 to 2026 and had two rows reading "Aug 12". */
  const years = new Set(rows.map((r) => r.date.slice(0, 4)));
  const fmt = years.size > 1 ? logDate : shortDate;

  return (
    <div className={`log ${variant}${years.size > 1 ? ' log-years' : ''}`}>
      <div className="log-head">
        <span>{total === rows.length ? `${total} sessions` : `Last ${rows.length} of ${total}`}</span>
        {moreHref && (
          <Link href={moreHref} className="log-more">
            {moreLabel ?? 'the whole record'}
          </Link>
        )}
      </div>

      <div className="log-table" role="table">
        <div className="log-row log-row-head" role="row">
          <span className="log-date" role="columnheader">Date</span>
          {columns.map((c) => (
            <span
              key={c.head}
              className={`log-cell${c.num ? ' tnum' : ''}`}
              role="columnheader"
            >
              {c.head}
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div className="log-row" key={r.date} role="row">
            <span className="log-date" role="cell">{fmt(r.date)}</span>
            {columns.map((c) => {
              const v = c.cell(r);
              return (
                <span
                  key={c.head}
                  className={`log-cell${c.num ? ' tnum' : ''}${v == null ? ' log-none' : ''}`}
                  role="cell"
                >
                  {/* A null is a fact: the watch did not record it, or the column predates the
                      data. A plain hyphen rather than "0", because 0 minutes and no reading are
                      different things and this site has already shipped one number that read as
                      zero because a field was absent. ASCII hyphen on purpose: lint-prose refuses
                      en dashes and em dashes anywhere in the repo. */}
                  {v ?? '-'}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {caption && <p className="log-caption">{caption}</p>}
    </div>
  );
}
