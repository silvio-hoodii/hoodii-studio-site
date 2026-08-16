import PaceClock from './PaceClock';
import {
  getUpcoming, getCoverage, getLiveness,
  calgaryToday, calgaryNow, shortPool, minutesBetween,
  type SwimSession,
} from '@/lib/swim/db';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Swim',
  description: 'Which Calgary pools have lane swim open right now, and what the rest of the week looks like.',
  alternates: { canonical: '/swim' },
};

/* This was swim.hoodii.studio, a separate Vercel project generating one 105 KB HTML file every
 * morning. Same data, same reasoning, now a route like everything else.
 *
 * WHAT CHANGED, and it is the only part worth arguing about: the old page shipped its whole
 * schedule as a JSON blob inline and did the filtering in the browser, which meant "open right now"
 * was computed against the reader's clock. Here it is computed on the server against Calgary's,
 * because that is the only clock the data means anything against, and because a server component
 * lets the whole page ship with no JS but the clock.
 *
 * WHAT DID NOT CHANGE: the scrapers stay on the laptop. Six of them against six council and gym
 * sites, one of which is already returning zero every morning while reporting success, is a
 * different reliability problem than this site has. See content/swim/schema.sql.
 */

const SOON_MINUTES = 240;

/* "in 280 min" is a number nobody converts in their head at 5:45am, and it appeared the moment the
   section widened past four hours. Minutes below 90, hours and minutes above it. */
function gapText(mins: number): string {
  if (mins < 90) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function Row({ s, now, open }: { s: SwimSession; now: string; open: boolean }) {
  const bits = [s.op, s.detail, s.len ? `${s.len} m` : null, s.note].filter(Boolean);
  return (
    <div className={open ? 'swim-row open' : 'swim-row'}>
      <div className="slot">{open ? `until ${s.end}` : `${s.start}`}</div>
      <div className="what">
        <div className="pool">{shortPool(s.pool)}</div>
        <div className="meta">{s.activity}{bits.length ? ` · ${bits.join(' · ')}` : ''}</div>
      </div>
      <div className="left">
        {open
          ? `${gapText(minutesBetween(now, s.end))} left`
          : `in ${gapText(minutesBetween(now, s.start))}`}
      </div>
    </div>
  );
}

export default async function SwimPage() {
  const today = calgaryToday();
  const now = calgaryNow();

  const [sessions, coverage, live] = await Promise.all([
    getUpcoming(today), getCoverage(), getLiveness(),
  ]);

  const openNow = sessions.filter((s) => s.date === today && s.start <= now && s.end > now);
  const laterToday = sessions.filter((s) => s.date === today && s.start > now);
  const soon = laterToday.filter((s) => minutesBetween(now, s.start) <= SOON_MINUTES);

  /* "Nothing else today" was a lie at 3am and I only found it by opening the page at 3am. There are
     32 sessions on a Sunday and the first is at 07:00, which is four hours and change away, so a
     four-hour window found none of them and the page said the day was empty.

     The window is not the bug. It is right for the question the app is actually for, which is
     "should I get in the car". The bug was answering a different question, "is there swimming
     today", with the first question's empty result. So when the window is empty and the day is not,
     the section widens and says it has. */
  const showingRest = soon.length === 0 && laterToday.length > 0;
  const upNext = (showingRest ? laterToday : soon).slice(0, 12);

  /* Tomorrow onward. Today is already answered by the two sections above, and repeating it in the
     week board would show sessions that have finished as though they were coming. */
  const byDay = new Map<string, SwimSession[]>();
  for (const s of sessions) {
    if (s.date <= today) continue;
    const list = byDay.get(s.date) ?? [];
    list.push(s);
    byDay.set(s.date, list);
  }

  const liveCount = coverage.filter((c) => c.status === 'live').length;

  const dayName = (d: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'short', day: 'numeric' })
      .format(new Date(`${d}T12:00:00Z`));

  return (
    <div className="swim">
      <div className="top">
        <div>
          <h1>Lane swim</h1>
          <p className="blurb">
            Which Calgary pools have lane swim open right now, and what the rest of the week looks
            like. Times are Calgary time, which is the clock on the pool wall.
          </p>
        </div>
        <PaceClock />
      </div>

      {/* The dangerous one, so it goes first and it is the only red thing on the page besides the
          second hand. A timetable that has fallen behind does not look broken: it looks like a city
          where no pool has any lane swim, and without this the page would say exactly that in a
          calm voice. */}
      {live.dataStale && (
        <div className="wrong">
          <span className="k">Out of date, do not trust this</span>
          {live.coversThrough
            ? `The schedule behind this page only runs to ${live.coversThrough}, and today is ${today}. Everything below is from a week that has already happened.`
            : 'There is no schedule behind this page at all.'}{' '}
          Check the pool&apos;s own site before you drive.
          {live.lastError && <span className="why">{live.lastError}</span>}
        </div>
      )}

      {/* A different fault: the mirror is not being written. Separate banner, quieter, because the
          data can still be perfectly correct while this is true. /health learned to split these
          two; here the split matters more, because one of them makes the page wrong rather than
          merely old. */}
      {!live.dataStale && live.confirmStale && (
        <div className="behind">
          <span className="k">Not confirmed lately</span>
          {live.confirmedAt
            ? `Nothing has checked these times against the pools for ${Math.round(live.hoursSinceConfirmed ?? 0)} hours.`
            : 'Nothing has ever checked these times against the pools.'}{' '}
          They still cover today, so they are probably right, but the scrape has not run. Wake the
          laptop and let <code>HOODII-SwimOS-Daily</code> fire, or run <code>node daily.mjs</code> in
          SwimOS.
          {live.lastError && <span className="why">{live.lastError}</span>}
        </div>
      )}

      <h2 className="sec">Open right now</h2>
      {openNow.length ? (
        openNow.map((s) => <Row key={`${s.pool}${s.start}${s.end}`} s={s} now={now} open />)
      ) : (
        <p className="none">Nothing open this minute.</p>
      )}

      <h2 className="sec">{showingRest ? 'Later today' : 'Starting soon'}</h2>
      {/* A time, not a duration. Rounding the gap to hours produced "Nothing in the next four
          hours. The first is in 4 hours", which reads as a contradiction and is useless besides: at
          3am the thing worth knowing is what to set the alarm for. */}
      {showingRest && (
        <p className="none">
          Nothing in the next four hours. The first today is at {laterToday[0]!.start}.
        </p>
      )}
      {upNext.length ? (
        upNext.map((s) => <Row key={`${s.pool}${s.start}${s.end}`} s={s} now={now} open={false} />)
      ) : (
        <p className="none">Nothing else today.</p>
      )}

      <h2 className="sec">The rest of the week</h2>
      {byDay.size ? (
        [...byDay.entries()].map(([date, list]) => (
          <details className="day" key={date}>
            <summary>
              <span>{dayName(date)}</span>
              <span className="n">{list.length} session{list.length === 1 ? '' : 's'}</span>
            </summary>
            <div className="inner">
              {list.map((s) => (
                <div className="swim-row" key={`${s.pool}${s.start}${s.end}`}>
                  <div className="slot">{s.start} to {s.end}</div>
                  <div className="what">
                    <div className="pool">{shortPool(s.pool)}</div>
                    <div className="meta">
                      {s.activity}{s.detail ? ` · ${s.detail}` : ''}{s.note ? ` · ${s.note}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))
      ) : (
        <p className="none">No further days in the schedule.</p>
      )}

      {/* Every pool, including the ones with nothing here. SwimOS/wedge/DESIGN.md is explicit that
          this is the trust mechanism rather than a footnote, because silent omission is what killed
          the hand-built Reddit list this app replaced. A reader has to be able to tell "no lane
          swim there" from "we did not look". */}
      <details className="cov">
        <summary>Every Calgary pool, and whether it is covered ({liveCount} of {coverage.length})</summary>
        {coverage.map((c) => (
          <div className={c.status === 'live' ? 'cov-row' : 'cov-row off'} key={c.name}>
            <span className="st">{c.status === 'coming' ? 'soon' : c.status}</span>
            <span className="nm">
              {c.name}
              <span className="nt">{[c.op, c.area].filter(Boolean).join(' · ')}</span>
              {/* Its own line rather than tacked on after the operator. The note is the whole point
                  of a row for a pool with no schedule: it is the sentence that says why. */}
              {c.note && <span className="nt">{c.note}</span>}
            </span>
          </div>
        ))}
      </details>

      <p className="src">
        Unofficial. Schedules change and this is a copy, so check the pool before you drive.
        Scraped from City of Calgary Live &amp; Play, YMCA Calgary, MNP Community &amp; Sport Centre,
        Vivo, Westside Recreation and the University of Calgary.
        {live.confirmedAt && ` Last checked ${live.confirmedAt.slice(0, 16).replace('T', ' ')} UTC.`}
      </p>
    </div>
  );
}
