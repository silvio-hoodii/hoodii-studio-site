/* The year of weight with every lifting day under it, since 2026-09-27: "more graphic stuff". One
 * x-axis, January 1 to today, so a stretch of ticks and a stretch of line going down can be read
 * against each other. No causal claim is drawn or written: they are two records on one clock.
 * Server-rendered SVG, monochrome, the latest weight marked. */

export default function YearLifts({ from, to, weights, lifts }: {
  from: string;
  to: string;
  weights: { date: string; kg: number }[];
  lifts: string[];
}) {
  if (weights.length < 2) return null;
  const t0 = Date.parse(`${from}T12:00:00Z`);
  const t1 = Date.parse(`${to}T12:00:00Z`);
  const span = Math.max(1, t1 - t0);
  const W = 340;
  const H = 86;
  const tickTop = H + 8;
  const x = (d: string) => ((Date.parse(`${d}T12:00:00Z`) - t0) / span) * W;
  const kgs = weights.map((w) => w.kg);
  const lo = Math.min(...kgs);
  const hi = Math.max(...kgs);
  const y = (kg: number) => 4 + (1 - (kg - lo) / (hi - lo || 1)) * (H - 8);
  const pts = weights.map((w) => `${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`).join(' ');
  const last = weights[weights.length - 1]!;
  const months = Array.from({ length: 12 }, (_, m) => `${from.slice(0, 4)}-${String(m + 1).padStart(2, '0')}-01`)
    .filter((d) => d >= from && d <= to);
  return (
    <figure className="yearlifts">
      <svg viewBox={`0 0 ${W} ${tickTop + 22}`} role="img"
        aria-label={`Weight from ${from} to ${to}, ${lifts.length} lifting days marked below it`}>
        {months.map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={0} y2={tickTop + 8} className="mgrid" />
            <text x={x(d) + 2} y={tickTop + 19} className="mlab">
              {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', timeZone: 'UTC' })}
            </text>
          </g>
        ))}
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx={x(last.date)} cy={y(last.kg)} r="2.8" fill="currentColor" />
        <text x={2} y={y(hi) + 3} className="mlab">{hi.toFixed(1)}</text>
        <text x={2} y={y(lo) - 2} className="mlab">{lo.toFixed(1)}</text>
        {lifts.map((d) => (
          <rect key={d} x={x(d) - 0.6} y={tickTop} width={1.4} height={8} fill="currentColor" opacity="0.7" />
        ))}
      </svg>
      <figcaption>
        <span><i className="k-line" />weight, kg</span>
        <span><i className="k-tick" />{lifts.length} lifting days</span>
      </figcaption>
    </figure>
  );
}
