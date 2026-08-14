import Link from 'next/link';
import { getSummary, getRecentPlays, getLatestTop, getMostPlayed } from '@/lib/music/db';
import { getAccessToken, getNowPlaying, TIME_RANGES, RANGE_LABEL, type NowPlaying } from '@/lib/music/spotify';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Music',
  description: 'What I listen to, and a listening history that only exists because something writes it down.',
  alternates: { canonical: '/music' },
};

/* The honest-states rule, applied to the hardest case on this site.
 *
 * Every other app here reads a store that holds everything it has ever known. This one reads a
 * store that holds only what a scheduled job managed to catch. Spotify returns the last 50 plays
 * and nothing else, ever, so the history below BEGINS the day collection began, and any framing
 * that implies otherwise is a lie the page tells confidently. Hence "collecting since", stated in
 * the blurb and repeated on the section that could most easily be misread as lifetime data.
 *
 * The three top charts are the opposite case: Spotify computes those over its own windows from its
 * own complete record, so they legitimately reach back further than this table does. Keeping the
 * two ideas visually separate is the point of the layout, not decoration.
 */

/** Now-playing degrades to a null render, but a THROWN error is surfaced rather than swallowed,
 *  because a dead token and a quiet evening look identical and only one of them needs fixing. */
async function nowPlayingSafe(): Promise<{ track: NowPlaying | null; broken: string | null }> {
  try {
    return { track: await getNowPlaying(await getAccessToken()), broken: null };
  } catch (err) {
    return { track: null, broken: err instanceof Error ? err.message : String(err) };
  }
}

function when(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  const days = Math.round(mins / (60 * 24));
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/* One row of the collected history, shared by the open list and the folded one. */
function Play(p: { playedAt: string; trackName: string; trackUrl: string | null; artistName: string; albumName: string | null }) {
  return (
    <div className="play" key={p.playedAt}>
      <div className="pwhen tnum">{when(p.playedAt)}</div>
      <div className="pbody">
        <div className="ptrack">
          {p.trackUrl ? (
            <a href={p.trackUrl} target="_blank" rel="noreferrer">{p.trackName}</a>
          ) : (
            p.trackName
          )}
        </div>
        <div className="pmeta">
          {p.artistName}
          {p.albumName && <><span className="dot">·</span>{p.albumName}</>}
        </div>
      </div>
    </div>
  );
}

/* How many plays stay open. Thirty is a couple of days of listening. */
const OPEN_PLAYS = 30;

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export default async function MusicPage() {
  const [summary, recent, mostPlayed] = await Promise.all([
    getSummary(),
    getRecentPlays(60),
    getMostPlayed(8),
  ]);
  const [topTracks, topArtists, now] = await Promise.all([
    Promise.all(TIME_RANGES.map((r) => getLatestTop('track', r))),
    Promise.all(TIME_RANGES.map((r) => getLatestTop('artist', r))),
    nowPlayingSafe(),
  ]);

  const collectingDays = summary.since ? daysSince(summary.since) : null;

  return (
    <div className="music">
      {/* See /curio: this page had no h1 either. */}
      <h1>Music</h1>
      <p className="blurb">
        What I am listening to. The charts come from Spotify, which works them out over its own
        windows. The history underneath does not: Spotify hands back the last fifty plays and
        nothing further, so a job collects them three times a day and this page shows what it has
        caught. It starts where the collecting started.
      </p>

      {/* The integration is dead. This is the failure the whole build exists to make visible, so it
        * gets the loudest thing on the page rather than a console line nobody reads. */}
      {(now.broken || summary.liveness.stale) && (
        <div className="alarm">
          <strong>The collector is not working.</strong>{' '}
          {summary.liveness.lastOkAt
            ? `Last successful run was ${when(summary.liveness.lastOkAt)}.`
            : 'It has never completed a successful run.'}{' '}
          Plays are being lost while this is true, and they cannot be recovered later.
          {(now.broken ?? summary.liveness.lastError) && (
            <span className="why">{now.broken ?? summary.liveness.lastError}</span>
          )}
        </div>
      )}

      <div className="np">
        {now.track ? (
          <>
            <span className="npdot" aria-hidden="true" />
            <span className="nplabel">Playing now</span>
            <span className="nptrack">
              {now.track.url ? (
                <a href={now.track.url} target="_blank" rel="noreferrer">{now.track.trackName}</a>
              ) : (
                now.track.trackName
              )}
            </span>
            <span className="npartist">{now.track.artistName}</span>
          </>
        ) : (
          <span className="nplabel quiet">
            {now.broken ? 'Cannot tell, the Spotify connection is down' : 'Nothing playing right now'}
          </span>
        )}
      </div>

      <div className="stat">
        <span className="live tnum">{summary.plays}</span> plays collected
        <span className="dot">·</span>
        <span className="live tnum">{summary.tracks}</span> tracks
        <span className="dot">·</span>
        <span className="live tnum">{summary.artists}</span> artists
        {summary.since && (
          <>
            <span className="dot">·</span>
            since {summary.since.slice(0, 10)}
            {collectingDays !== null && collectingDays < 1 ? ', today' : ''}
          </>
        )}
      </div>

      {/* ---------------------------------------------------------------- Spotify's charts */}

      <h2 className="sec">Top tracks</h2>
      <div className="ranges">
        {TIME_RANGES.map((range, i) => {
          const snap = topTracks[i];
          return (
            <section className="range" key={`t-${range}`}>
              <h3 className="rlabel">{RANGE_LABEL[range]}</h3>
              {snap && snap.entries.length > 0 ? (
                <ol className="chart">
                  {snap.entries.slice(0, 10).map((e) => (
                    <li key={`${range}-${e.rank}`}>
                      <span className="rank tnum">{e.rank}</span>
                      <span className="cname">
                        {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.name}</a> : e.name}
                      </span>
                      {e.detail && <span className="cdetail">{e.detail}</span>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty">Not collected yet.</p>
              )}
            </section>
          );
        })}
      </div>

      <h2 className="sec">Top artists</h2>
      <div className="ranges">
        {TIME_RANGES.map((range, i) => {
          const snap = topArtists[i];
          return (
            <section className="range" key={`a-${range}`}>
              <h3 className="rlabel">{RANGE_LABEL[range]}</h3>
              {snap && snap.entries.length > 0 ? (
                <ol className="chart">
                  {snap.entries.slice(0, 10).map((e) => (
                    <li key={`${range}-${e.rank}`}>
                      <span className="rank tnum">{e.rank}</span>
                      <span className="cname">
                        {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.name}</a> : e.name}
                      </span>
                      {e.detail && <span className="cdetail">{e.detail}</span>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty">Not collected yet.</p>
              )}
            </section>
          );
        })}
      </div>

      {/* ---------------------------------------------------------------- our own record */}

      {summary.plays > 0 && (
        <>
          <h2 className="sec">
            Most played
            {/* The date, not a day count. A count derived here floors to "1 day" while the stat
              * line above says "since 2026-08-09", and two true statements that look like a
              * contradiction are worse than one plain fact. */}
            <span className="qual">
              {summary.since
                ? `, only what has been collected since ${summary.since.slice(0, 10)}`
                : ', only what has been collected so far'}
            </span>
          </h2>
          {/* Explicitly NOT "top". This counts only what the poller caught, over a window that is
            * currently short, and conflating it with Spotify's charts above would be the same class
            * of mistake as a hub row describing an app it had not read. */}
          <div className="ranges two">
            <section className="range">
              <h3 className="rlabel">artists</h3>
              <ol className="chart">
                {mostPlayed.artists.map((a, i) => (
                  <li key={a.name}>
                    <span className="rank tnum">{i + 1}</span>
                    <span className="cname">{a.name}</span>
                    <span className="cdetail tnum">{a.plays} play{a.plays === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="range">
              <h3 className="rlabel">tracks</h3>
              <ol className="chart">
                {mostPlayed.tracks.map((t, i) => (
                  <li key={t.name}>
                    <span className="rank tnum">{i + 1}</span>
                    <span className="cname">{t.name}</span>
                    <span className="cdetail tnum">{t.plays} play{t.plays === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}

      <h2 className="sec">Recently played</h2>
      {recent.length > 0 ? (
        <>
          <div className="plays">{recent.slice(0, OPEN_PLAYS).map(Play)}</div>
          {/* Bounded before it needs to be. The table holds fifty rows today because Spotify hands
              back fifty at a time, so this fold does nothing yet; the day the collector has been
              running for a month it is the difference between a page and a scroll. Native
              <details>, so the older plays stay in the document and cost no JavaScript. */}
          {recent.length > OPEN_PLAYS && (
            <details className="more">
              <summary>{recent.length - OPEN_PLAYS} older plays</summary>
              <div className="plays">{recent.slice(OPEN_PLAYS).map(Play)}</div>
            </details>
          )}
        </>
      ) : (
        <p className="empty">
          Nothing collected yet. The first scheduled run will fill this in.
        </p>
      )}

      <div className="foot">
        <Link href="/">Back to the index</Link>
      </div>
    </div>
  );
}
