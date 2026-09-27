import type { Listening } from '@/lib/music/db';

/* The four pictures on /music, all server-rendered SVG or plain HTML, no chart library and no
 * client JavaScript. Monochrome: darker means more. --signal stays reserved for "playing now". */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* When he listens: a week of hours, each cell shaded by minutes played in that hour across the
   window. A heat grid rather than a radial clock, because a grid can be read along both axes and a
   circle cannot be read along either. */
export function ListeningClock({ clock }: { clock: Listening['clock'] }) {
  const max = Math.max(1, ...clock.flat());
  const cw = 13;
  const ch = 13;
  const gap = 2;
  const left = 30;
  const top = 14;
  const width = left + 24 * (cw + gap);
  const height = top + 7 * (ch + gap);
  return (
    <svg className="clock" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label="Minutes listened by weekday and hour, darker is more">
      {[0, 6, 12, 18].map((h) => (
        <text key={h} x={left + h * (cw + gap)} y={9} className="ax">{h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}</text>
      ))}
      {clock.map((row, d) => (
        <g key={d}>
          <text x={0} y={top + d * (ch + gap) + 10} className="ax">{DAYS[d]}</text>
          {row.map((m, h) => (
            <rect key={h} x={left + h * (cw + gap)} y={top + d * (ch + gap)} width={cw} height={ch} rx="1.5"
              fill="currentColor" opacity={m > 0 ? 0.12 + 0.88 * Math.sqrt(m / max) : 0.05}>
              <title>{`${DAYS[d]} ${h}:00, ${Math.round(m)} min`}</title>
            </rect>
          ))}
        </g>
      ))}
    </svg>
  );
}

/* Minutes a day for the last thirty days, today on the right. */
export function MinutesPerDay({ perDay }: { perDay: Listening['perDay'] }) {
  const max = Math.max(1, ...perDay.map((d) => d.minutes));
  const bw = 9;
  const gap = 3;
  const h = 64;
  const width = perDay.length * (bw + gap) - gap;
  return (
    <svg className="bars" viewBox={`0 0 ${width} ${h + 14}`} role="img" aria-label="Minutes listened per day, last 30 days">
      {perDay.map((d, i) => {
        const bh = d.minutes > 0 ? Math.max(2, (d.minutes / max) * h) : 1;
        return (
          <rect key={d.day} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx="1"
            fill="currentColor" opacity={d.minutes > 0 ? (i === perDay.length - 1 ? 1 : 0.55) : 0.12}>
            <title>{`${d.day}: ${Math.round(d.minutes)} min`}</title>
          </rect>
        );
      })}
      <text x={0} y={h + 12} className="ax">{perDay[0]?.day.slice(5)}</text>
      <text x={width} y={h + 12} className="ax" textAnchor="end">today</text>
    </svg>
  );
}

/* The albums of the window as a wall of covers, the three most played at double size. */
export function AlbumWall({ albums }: { albums: Listening['albums'] }) {
  return (
    <div className="wall">
      {albums.map((a, i) => (
        <figure key={a.name} className={i < 3 ? 'w big' : 'w'} title={`${a.name}, ${a.artist}: ${a.plays} plays`}>
          {a.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- Spotify CDN, already sized to 300px
            <img src={a.image} alt={`${a.name} by ${a.artist}`} loading="lazy" />
          ) : (
            <span className="noimg">{a.name}</span>
          )}
          <figcaption className="tnum">{a.plays}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/* Most-played artists as bars, the count at the end of each. */
export function ArtistBars({ artists }: { artists: Listening['artists'] }) {
  const max = Math.max(1, ...artists.map((a) => a.plays));
  return (
    <ol className="abars">
      {artists.map((a) => (
        <li key={a.name}>
          <span className="an">{a.name}</span>
          <span className="ab"><i style={{ width: `${(a.plays / max) * 100}%` }} /></span>
          <span className="ac tnum">{a.plays}</span>
        </li>
      ))}
    </ol>
  );
}
