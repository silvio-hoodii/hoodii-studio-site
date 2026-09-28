/* Word-sized charts for the index rows, since 2026-09-27: "more graphic stuff instead of just walls
 * of text". Tufte's sparkline, three shapes, no axes, no library, server-rendered SVG, so a row gains
 * a picture of its trend without shipping a byte of JavaScript.
 *
 * Colour is currentColor at two strengths, set by the caller's CSS. --signal is not used here: it
 * means "true right now", and a trend is history.
 *
 * The marks carry `data-r` and the `vbar` / `vline` classes for src/components/Readout.tsx, which
 * the index wraps them in: tap a bar for its value, and the picture draws itself in on first sight.
 * Neither costs the spark anything when it renders outside that wrapper. */

interface Common {
  width?: number;
  height?: number;
  label: string;
}

/* A line through the values, the last point marked. For weight, where the shape of the trend is the
   thing and the gap between two readings is not. `labels`, when given, is one readout per point. */
/* Two drawings per spark, a phone one and a desktop one, and hub.css shows one of them per
   breakpoint. Scaling the phone drawing with CSS made a 1.5px stroke 4px wide on the index board,
   because everything in an SVG scales with its box; two sizes is the class removed. Both carry the
   label: the hidden one is display:none, which a screen reader skips on its own. The desktop
   drawing is 300 wide, under the narrowest tile body (about 310 at three across), and hub.css caps
   it at 100% as the safety net. */
export function LineSpark(props: Common & { values: number[]; labels?: string[]; minSpan?: number }) {
  return (
    <>
      <LineSparkAt {...props} />
      <LineSparkAt {...props} width={300} height={72} big />
    </>
  );
}
function LineSparkAt({ values, labels, width = 132, height = 36, label, big = false, minSpan = 0 }: Common & { values: number[]; labels?: string[]; big?: boolean; minSpan?: number }) {
  if (values.length < 2) return null;
  /* The line fills the height whatever the spread, so a caller can set a floor on the span: 2 kg
     for weight, or a fortnight of 0.4 kg wobble draws as a cliff. Centred on the data. */
  const rawLo = Math.min(...values);
  const rawHi = Math.max(...values);
  const padSpan = Math.max(0, minSpan - (rawHi - rawLo)) / 2;
  const lo = rawLo - padSpan;
  const hi = rawHi + padSpan;
  const span = hi - lo || 1;
  const pad = 3;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1]!;
  /* One invisible hit column per point, so a tap anywhere along the line reads the nearest value. */
  const colW = (width - pad * 2) / (values.length - 1);
  return (
    <svg className={big ? 'spark spark-l' : 'spark spark-s'} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline className="vline" pathLength={1} points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={big ? 3.2 : 2.6} fill="currentColor" />
      {labels && labels.map((t, i) => (
        <rect key={i} x={x(i) - colW / 2} y={0} width={colW} height={height} fill="transparent" data-r={t} />
      ))}
    </svg>
  );
}

/* One bar per value, from a zero baseline. For swims, where each session is a separate event and a
   line between them would invent the days in between. */
export function BarSpark(props: Common & { values: number[]; labels?: string[] }) {
  return (
    <>
      <BarSparkAt {...props} />
      <BarSparkAt {...props} width={300} height={72} big />
    </>
  );
}
function BarSparkAt({ values, labels, width = 132, height = 36, label, big = false }: Common & { values: number[]; labels?: string[]; big?: boolean }) {
  if (!values.length) return null;
  const hi = Math.max(...values) || 1;
  const gap = 2;
  const bw = Math.max(2, (width - gap * (values.length - 1)) / values.length);
  return (
    <svg className={big ? 'spark spark-l' : 'spark spark-s'} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = Math.max(1.5, (v / hi) * (height - 2));
        const last = i === values.length - 1;
        return (
          <g key={i} data-r={labels?.[i]}>
            <rect x={i * (bw + gap)} y={0} width={bw} height={height} fill="transparent" />
            <rect className="vbar" style={{ ['--i' as string]: i }} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx="0.5"
              fill="currentColor" opacity={last ? 1 : 0.4} />
          </g>
        );
      })}
    </svg>
  );
}

/* One square per day, oldest on the left. Filled = trained, outlined = rest, faint = the watch has not
   reported that day yet. The third state matters: a stalled sync must not read as a week off. */
export function DayStrip(props: { days: ('on' | 'off' | 'unknown')[]; labels?: string[]; label: string }) {
  return (
    <>
      <DayStripAt {...props} />
      <DayStripAt {...props} big />
    </>
  );
}
function DayStripAt({ days, labels, label, big = false }: { days: ('on' | 'off' | 'unknown')[]; labels?: string[]; label: string; big?: boolean }) {
  if (!days.length) return null;
  const s = big ? 9 : 8;
  const gap = big ? 2 : 3;
  const width = days.length * (s + gap) - gap;
  return (
    <svg className={big ? 'spark spark-l' : 'spark spark-s'} width={width} height={s + 2} viewBox={`0 0 ${width} ${s + 2}`} role="img" aria-label={label}>
      {days.map((d, i) => (
        <rect key={i} x={i * (s + gap) + 0.5} y={1} width={s - 1} height={s - 1} rx="1"
          data-r={labels?.[i]}
          fill={d === 'on' ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1"
          opacity={d === 'unknown' ? 0.2 : d === 'on' ? 1 : 0.45} />
      ))}
    </svg>
  );
}
