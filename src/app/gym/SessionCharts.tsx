import type { SessionDetail, LengthRow } from '@/lib/gym/session';
import { mmss } from '@/lib/gym/session';

/* CHARTS FOR ONE SESSION. Inline SVG, server-rendered, no library and no client JS.
 *
 * Same rules /health's charts had to learn: NO TEXT INSIDE THE VIEWBOX. Text in an SVG scales with
 * the box, and /health spent a week rendering its axis labels at 6.1px on a phone before anyone
 * measured it. Every number here is HTML beside the drawing, at a real font size.
 *
 * Monochrome, per the site palette, with --signal reserved for one thing that is true right now.
 * On these charts that is the single most recent point on the heart-rate trace and nothing else. */

const W = 340;

/** A filled area under a line. One series, no axis, range printed in HTML beside it. */
export function Trace({
  values,
  height = 56,
  label,
  unit,
  floor,
}: {
  values: number[];
  height?: number;
  label: string;
  unit: string;
  /** Draws a horizontal rule at this value, for a threshold that means something. */
  floor?: number;
}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 3) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const x = (i: number) => (i / (v.length - 1)) * W;
  const y = (n: number) => height - 4 - ((n - min) / span) * (height - 8);
  const line = v.map((n, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(n).toFixed(1)}`).join(' ');
  const area = `${line} L ${W} ${height} L 0 ${height} Z`;
  const floorY = floor != null && floor > min && floor < max ? y(floor) : null;

  return (
    <div className="trace">
      <div className="trace-head">
        <span className="trace-label">{label}</span>
        <span className="trace-range tnum">
          {Math.round(min)} to {Math.round(max)} {unit}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}, ${Math.round(min)} to ${Math.round(max)} ${unit} over the session`}
      >
        <path className="trace-area" d={area} />
        <path className="trace-line" d={line} />
        {floorY != null && <line className="trace-floor" x1="0" x2={W} y1={floorY} y2={floorY} />}
        <circle className="trace-now" cx={x(v.length - 1)} cy={y(v[v.length - 1] as number)} r="3" />
      </svg>
      {floorY != null && (
        <div className="trace-foot">
          The rule is {floor} {unit}.
        </div>
      )}
    </div>
  );
}

/* PER LENGTH, which is the chart he actually asked for. One bar per length of the pool, height is
 * how long it took. A rest between lengths is drawn as a gap, so the SHAPE of the swim, the pieces
 * and where he stopped, is visible without reading a single number. */
export function LengthBars({ lengths, poolLength }: { lengths: LengthRow[]; poolLength: number | null }) {
  if (!lengths?.length) return null;
  const H = 68;
  const secs = lengths.map((l) => l.s);
  const max = Math.max(...secs);
  const min = Math.min(...secs);
  const gap = 1.5;
  const bw = Math.max(1.5, (W - gap * (lengths.length - 1)) / lengths.length);
  const fastest = secs.indexOf(min);

  return (
    <div className="trace">
      <div className="trace-head">
        <span className="trace-label">Every length</span>
        <span className="trace-range tnum">
          {min.toFixed(1)} to {max.toFixed(1)} s
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img"
           aria-label={`${lengths.length} lengths of ${poolLength ?? 25} m, ${min.toFixed(1)} to ${max.toFixed(1)} seconds each`}>
        {lengths.map((l, i) => {
          const h = Math.max(2, (l.s / max) * (H - 10));
          return (
            <rect
              key={i}
              className={`len-bar${i === fastest ? ' fastest' : ''}${l.rest > 0 ? ' before-rest' : ''}`}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={h}
            />
          );
        })}
      </svg>
      <div className="trace-foot">
        {lengths.length} lengths of {poolLength ?? 25} m. Taller is slower. The marked bar is the
        fastest one. A bar with a notch under it is where you stopped.
      </div>
    </div>
  );
}

/** The numbers that belong beside the drawing, not inside it. */
export function SessionStats({ s }: { s: SessionDetail }) {
  const items: { k: string; v: string }[] = [];
  if (s.minutes) items.push({ k: 'Time', v: `${s.minutes} min` });
  if (s.distanceM) items.push({ k: 'Distance', v: `${Math.round(s.distanceM).toLocaleString()} m` });
  if (s.kind === 'swimming') {
    if (s.lengths) items.push({ k: 'Lengths', v: String(s.lengths) });
    if (s.avgSwolf != null) items.push({ k: 'SWOLF', v: String(s.avgSwolf) });
    if (s.avgCycles != null) items.push({ k: 'Cycles / length', v: String(s.avgCycles) });
    if (s.strokeRate != null) items.push({ k: 'Stroke rate', v: `${s.strokeRate} / min` });
    /* TWO PACES, because one of them was quietly wrong. Total time over distance gives 2:54 per
       100 m on a swim he actually swam at about 2:04: the difference is every second he spent on
       the wall. Labelling that "Pace" would have been a false number on the page, and the swimming
       one is the one that compares to his personal bests. */
    const swimSec = s.series.lengths?.reduce((a, l) => a + l.s, 0) ?? 0;
    if (swimSec > 0 && s.distanceM) {
      items.push({ k: 'Pace swimming', v: `${mmss(swimSec / (s.distanceM / 100))} / 100 m` });
    }
    if (s.distanceM && s.minutes) {
      items.push({ k: 'Pace with rest', v: `${mmss((s.minutes * 60) / (s.distanceM / 100))} / 100 m` });
    }
  }
  if (s.kind === 'treadmill' || s.kind === 'running') {
    if (s.avgCadence) items.push({ k: 'Cadence', v: `${Math.round(s.avgCadence)} spm` });
    if (s.maxCadence) items.push({ k: 'Peak cadence', v: `${Math.round(s.maxCadence)} spm` });
  }
  if (s.avgHr) items.push({ k: 'Heart rate', v: `${s.avgHr} avg, ${s.maxHr} max` });
  if (s.kind === 'strength' && s.pctEasy != null) items.push({ k: 'Under 110 bpm', v: `${Math.round(s.pctEasy)}%` });

  if (!items.length) return null;
  return (
    <div className="sstats">
      {items.map((i) => (
        <div className="sstat" key={i.k}>
          <span className="sstat-k">{i.k}</span>
          <span className="sstat-v tnum">{i.v}</span>
        </div>
      ))}
    </div>
  );
}
