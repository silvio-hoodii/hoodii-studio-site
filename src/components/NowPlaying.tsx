'use client';

import { useEffect, useState } from 'react';

type Np = { title?: string; artist?: string; url?: string; isPlaying?: boolean; playedAt?: string };

/* Moved off the server on 2026-08-22, because it was keeping the entire front door out of the
 * cache. fetchSpotify() uses `cache: 'no-store'` on three calls, which opts the whole route into
 * dynamic rendering, so the hub re-rendered ten data calls for every crawler hit while Active CPU
 * ran past the Hobby allowance.
 *
 * Fetching it here instead lets the hub be ISR while this stays as live as it ever was. The
 * footer already degraded to nothing when Spotify was quiet or the token was dead, so an empty
 * first paint is the behaviour it always had. /api/spotify sets its own s-maxage=60. */
export default function NowPlaying() {
  const [np, setNp] = useState<Np | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/spotify')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.title) setNp(d); })
      .catch(() => { /* the footer has always been allowed to show nothing */ });
    return () => { alive = false; };
  }, []);

  if (!np?.title) return null;

  return (
    <span className="np">
      {np.isPlaying ? (
        <>
          <span className="eq" aria-hidden="true"><i /><i /><i /></span>
          <span className="npk">Now playing</span>
        </>
      ) : (
        <span className="npk">Last played{np.playedAt ? `, ${timeAgo(np.playedAt)}` : ''}</span>
      )}
      {np.url
        ? <a href={np.url} target="_blank" rel="noreferrer">{np.title}{np.artist ? ` · ${np.artist}` : ''}</a>
        : <span>{np.title}</span>}
    </span>
  );
}

/** Same shape as the server helper it replaces, kept local so this component has no server deps. */
function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
