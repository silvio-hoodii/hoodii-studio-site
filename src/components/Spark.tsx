/* Word-sized charts for the index rows, since 2026-09-27: "more graphic stuff instead of just walls
 * of text". Tufte's sparkline, three shapes, no axes, no library, server-rendered SVG, so a row gains
 * a picture of its trend without shipping a byte of JavaScript.
 *
 * Colour is currentColor at two strengths, set by the caller's CSS. --signal is not used here: it
 * means "true right now", and a trend is history. */

interface Common {
  width?: number;
  height?: number;
  label: string;
}

/* A line through the values, the last point marked. For weight, where the shape of the trend is the
   thing and the gap between two readings is not. */
export function LineSpark({ values, width = 132, height = 36, label }: Common & { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = 3;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1]!;
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="2.6" fill="currentColor" />
    </svg>
  );
}

/* One bar per value, from a zero baseline. For swims, where each session is a separate event and a
   line between them would invent the days in between. */
export function BarSpark({ values, width = 132, height = 36, label }: Common & { values: number[] }) {
  if (!values.length) return null;
  const hi = Math.max(...values) || 1;
  const gap = 2;
  const bw = Math.max(2, (width - gap * (values.length - 1)) / values.length);
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = Math.max(1.5, (v / hi) * (height - 2));
        const last = i === values.length - 1;
        return (
          <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx="0.5"
            fill="currentColor" opacity={last ? 1 : 0.4} />
        );
      })}
    </svg>
  );
}

/* One square per day, oldest on the left. Filled = trained, outlined = rest, faint = the watch has not
   reported that day yet. The third state matters: a stalled sync must not read as a week off. */
export function DayStrip({ days, label }: { days: ('on' | 'off' | 'unknown')[]; label: string }) {
  if (!days.length) return null;
  const s = 8;
  const gap = 3;
  const width = days.length * (s + gap) - gap;
  return (
    <svg className="spark" width={width} height={s + 2} viewBox={`0 0 ${width} ${s + 2}`} role="img" aria-label={label}>
      {days.map((d, i) => (
        <rect key={i} x={i * (s + gap) + 0.5} y={1} width={s - 1} height={s - 1} rx="1"
          fill={d === 'on' ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1"
          opacity={d === 'unknown' ? 0.2 : d === 'on' ? 1 : 0.45} />
      ))}
    </svg>
  );
}
