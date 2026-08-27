'use client';

import { useEffect, useRef, useState } from 'react';

/* Charts for the Health surface, hand-built inline SVG per the workspace `dataviz` skill rather
 * than a charting dependency (this repo takes no chart lib, same zero-dependency posture as
 * everything else here). Marks follow the skill's fixed specs: 2px lines, round joins, an 8px
 * endpoint marker with a 2px surface ring, direct end-labels, hairline recessive axes, a
 * crosshair+tooltip on line charts and a per-mark tooltip on bars/cells.
 *
 * Color: this site is monochrome with one chromatic color (--signal) reserved for "a value that is
 * true right now" (see .training .live in training.css). Charts extend that same convention rather than
 * introducing a categorical palette: the historical line/bars are ink (foreground/muted), and the
 * one point that IS true right now (today's weight, the most recent swim, today's strip cell) is
 * the only thing in signal. Every chart here is single-series, so no legend box is needed (a legend
 * only earns its place at 2+ series per the skill's mark spec).
 */

/* ---- why the width is measured rather than fixed ----
 *
 * These used to draw into a fixed 600-unit viewBox with `width: 100%; height: auto`, which means
 * the browser scales the whole picture, TEXT INCLUDED, by container width over 600.
 *
 * On a 390px phone the container is 350px, so the scale is 0.58 and the 10.5px axis labels landed
 * at 6.1px. Measured, not estimated: `getBoundingClientRect().height` on the label was 8px. That is
 * the surface he actually reads, and nothing could see it. The markup is right, the CSS says 10.5px,
 * `getComputedStyle` says 10.5px, and only a screenshot shows a number nobody can read. Same defect
 * with the sign flipped at the other end: paired at 1440 the desktop pass would have made this
 * worse on a phone and inflated the swim chart's labels to 17px on a laptop.
 *
 * So the viewBox is the container's own pixel width and the scale is exactly 1 everywhere. A label
 * is the size it says it is, a 2px stroke is 2px, and the chart is 160px tall on every screen
 * instead of 93px on a phone and 256px on a laptop. This is the class removed rather than two
 * breakpoints of compensation, which is what the first draft of this change did.
 *
 * The fallback is what the server renders, before any element has a width to measure. `min-height`
 * on `.chart-wrap` reserves the final 160px so the swap on hydration moves nothing below it.
 */
const W_FALLBACK = 600;
const H = 160;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 24;

function useMeasuredWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [w, setW] = useState(W_FALLBACK);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      // Rounded, so a fractional resize does not re-render the chart on every pixel of a drag.
      if (next > 0) setW(Math.round(next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export interface LinePoint {
  date: string;
  value: number;
}

export function LineChart({
  points,
  unit,
  decimals = 1,
}: {
  points: LinePoint[];
  unit: string;
  decimals?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const W = useMeasuredWidth(wrapRef);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  if (points.length < 2) {
    return <p className="empty">Not enough readings yet to chart a trend.</p>;
  }

  const times = points.map((p) => Date.parse(p.date));
  const values = points.map((p) => p.value);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const vMinRaw = Math.min(...values);
  const vMaxRaw = Math.max(...values);
  const vPad = (vMaxRaw - vMinRaw) * 0.15 || 1;
  const vMin = vMinRaw - vPad;
  const vMax = vMaxRaw + vPad;

  const x = (t: number) => PAD_L + ((t - tMin) / (tMax - tMin || 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - vMin) / (vMax - vMin || 1)) * (H - PAD_T - PAD_B);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(times[i] as number)} ${y(p.value)}`).join(' ');
  const last = points[points.length - 1] as LinePoint;
  const lastX = x(times[times.length - 1] as number);
  const lastY = y(last.value);
  // Flip the label below the point when the incoming segment descends into it, else the label
  // sits where the line's own downward stroke passes and reads as crossed-out.
  const prev = points.length > 1 ? (points[points.length - 2] as LinePoint) : null;
  const descending = prev != null && last.value < prev.value;
  const labelY = descending ? lastY + 16 : lastY - 8;

  const ticks = niceTicks(vMinRaw, vMaxRaw, 3);

  function nearestIndex(clientX: number): number {
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < times.length; i++) {
      const d = Math.abs(x(times[i] as number) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  const handleMove = (e: React.PointerEvent) => {
    const i = nearestIndex(e.clientX);
    const p = points[i] as LinePoint;
    setHover({ i, x: x(times[i] as number), y: y(p.value) });
  };

  const hoverPoint = hover ? (points[hover.i] as LinePoint) : null;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${last.value.toFixed(decimals)} ${unit} as of ${last.date}`}>
        <line className="chart-axis" x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} />
        {ticks.map((t) => (
          <text key={t} className="chart-axis-label" x={2} y={y(t) + 3.5}>
            {t.toFixed(t % 1 === 0 ? 0 : 1)}
          </text>
        ))}
        <path className="chart-line" d={path} />
        <circle className="chart-endpoint" cx={lastX} cy={lastY} r={4} />
        <text className="chart-endpoint-label" x={Math.min(lastX + 8, W - 4)} y={labelY} textAnchor={lastX > W - 60 ? 'end' : 'start'}>
          {last.value.toFixed(decimals)} {unit}
        </text>
        {hover && (
          <>
            <line className="chart-crosshair on" x1={hover.x} y1={PAD_T} x2={hover.x} y2={H - PAD_B} />
            <circle cx={hover.x} cy={hover.y} r={4} fill="var(--foreground)" stroke="var(--background)" strokeWidth={2} />
          </>
        )}
        <rect
          className="chart-hit"
          x={PAD_L}
          y={0}
          width={W - PAD_L - PAD_R}
          height={H}
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover && hoverPoint && (
        <div
          className="tooltip on"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}
        >
          <div className="t-date">{hoverPoint.date}</div>
          <div className="t-value tnum">{hoverPoint.value.toFixed(decimals)} {unit}</div>
        </div>
      )}
    </div>
  );
}

export interface BarPoint {
  date: string;
  value: number;
}

export function BarChart({ points, unit }: { points: BarPoint[]; unit: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const W = useMeasuredWidth(wrapRef);
  const [hover, setHover] = useState<number | null>(null);

  if (!points.length) {
    return <p className="empty">No sessions in this window.</p>;
  }

  const max = Math.max(...points.map((p) => p.value));
  const innerW = W - PAD_L - PAD_R;
  const n = points.length;
  const slot = innerW / n;
  const barW = Math.min(24, slot - 2);
  const baseline = H - PAD_B;

  const barY = (v: number) => baseline - (v / (max || 1)) * (H - PAD_T - PAD_B);
  const barH = (v: number) => baseline - barY(v);

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${n} sessions, longest ${max.toFixed(0)} ${unit}`}>
        <line className="chart-axis" x1={PAD_L} y1={baseline} x2={W - PAD_R} y2={baseline} />
        <text className="chart-axis-label" x={2} y={PAD_T + 4}>{Math.round(max)}</text>
        <text className="chart-axis-label" x={2} y={baseline + 3.5}>0</text>
        {points.map((p, i) => {
          const cx = PAD_L + slot * i + slot / 2;
          const h = Math.max(barH(p.value), 1);
          const yTop = baseline - h;
          const r = Math.min(4, barW / 2, h / 2);
          const isLast = i === n - 1;
          return (
            <g key={p.date + i}>
              <path
                className={`chart-bar${hover === i ? ' hot' : ''}`}
                style={isLast ? { fill: 'var(--signal)' } : undefined}
                d={`M ${cx - barW / 2} ${baseline}
                    L ${cx - barW / 2} ${yTop + r}
                    Q ${cx - barW / 2} ${yTop} ${cx - barW / 2 + r} ${yTop}
                    L ${cx + barW / 2 - r} ${yTop}
                    Q ${cx + barW / 2} ${yTop} ${cx + barW / 2} ${yTop + r}
                    L ${cx + barW / 2} ${baseline} Z`}
              />
              <rect
                x={PAD_L + slot * i}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
              />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="tooltip on"
          style={{ left: `${((PAD_L + slot * hover + slot / 2) / W) * 100}%`, top: `${(barY((points[hover] as BarPoint).value) / H) * 100}%` }}
        >
          <div className="t-date">{(points[hover] as BarPoint).date}</div>
          <div className="t-value tnum">{(points[hover] as BarPoint).value.toFixed(0)} {unit}</div>
        </div>
      )}
    </div>
  );
}

export interface AdherenceCell {
  date: string;
  trained: boolean;
  logged: boolean;
  known: boolean;
}

export function AdherenceStrip({ days }: { days: AdherenceCell[] }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <div className="strip">
        {days.map((d) => {
          const cls = ['strip-cell'];
          if (!d.known) cls.push('unknown');
          if (d.trained) cls.push('trained');
          if (d.logged) cls.push('logged');
          // Needs its own outline: .logged alone paints a background-coloured dot on an unfilled
          // cell, which is nothing at all.
          if (d.logged && !d.trained) cls.push('logged-only');
          /* An empty cell used to mean "rest" whether he rested or the export simply had not
             reached that day, which turned a stalled sync into a month of claimed rest days.

             `logged && !trained` is the fourth case and it was falling through to "rest": a day he
             logged a full session in the gym app but the watch export has no strength row for.
             2026-08-04 is exactly that day, and it rendered pixel-identical to a rest day with an
             aria-label saying "rest", because .logged draws a hole punched in a filled cell and
             the cell underneath was not filled. Both the picture and the screen reader asserted a
             rest day on a day he trained. Found by an adversarial pass on 2026-08-14. */
          const state = d.trained && d.logged
            ? 'trained + logged'
            : d.trained
              ? 'trained, not logged'
              : d.logged
                ? 'logged in the app, the watch has no session for it'
                : !d.known
                  ? 'no data, the watch export has not reached this day'
                  : 'rest';
          const label = `${d.date}: ${state}`;
          return (
            <button
              key={d.date}
              type="button"
              className={cls.join(' ')}
              style={d.date === todayStr ? { borderColor: 'var(--signal)' } : undefined}
              title={label}
              aria-label={label}
            />
          );
        })}
      </div>
      <div className="strip-legend">
        <span className="key"><span className="swatch" /> rest</span>
        <span className="key"><span className="swatch trained" /> trained</span>
        <span className="key"><span className="swatch trained logged" /> trained + logged</span>
        {days.some((d) => d.logged && !d.trained) && (
          <span className="key"><span className="swatch logged-only" /> logged, watch missed it</span>
        )}
        {days.some((d) => !d.known) && (
          <span className="key"><span className="swatch unknown" /> no data</span>
        )}
      </div>
    </div>
  );
}
