'use client';

import { Fragment, useRef, useState, useEffect } from 'react';

/* EVERY BODY NUMBER ON ONE TIMELINE, WITH ONE CROSSHAIR THROUGH ALL OF THEM.
 *
 * HIS ASK, 2026-09-09: "is there a way that we can build that chart, I fast all these numbers in
 * the same timeline? This is hard for me to find, say, a point in time in each chart and see
 * November of whatever year. I want one chart where we have all these metrics somehow drawn there,
 * so I can see at any point of time the six numbers."
 *
 * WHY NOT ONE CHART WITH SEVEN LINES ON IT. Weight runs 103 to 119 kg, body fat 28 to 33 percent,
 * resting burn near 1,900 cal. On one axis the calories are a ceiling and everything else is a flat
 * line along the floor. Normalising them all to an index would fix the scale and destroy the thing
 * he actually wants, which is to read the NUMBER at a date. So this is small multiples: one row per
 * metric, each keeping its own units, all sharing ONE x domain and ONE crosshair. Dragging anywhere
 * moves every row at once and the value on the left of each row becomes that date's reading.
 *
 * THE SHARED DOMAIN IS THE FIX. Each chart used to auto-scale its x-axis to its own readings, so a
 * date sat at a different horizontal position in each one, and reading down a column meant nothing.
 * `tMin`/`tMax` are computed across every series here and every row uses them.
 *
 * TOUCH, NOT HOVER. He reads this on a phone. `touch-action: none` on the surface so a drag scrubs
 * instead of scrolling the page, and the readout is pinned above the rows rather than following the
 * finger, which would put it under his thumb. Tapping outside clears back to the latest reading.
 *
 * MEASURED, DERIVED. Two of these are readings and five are arithmetic on them (see METRICS in
 * src/lib/health/year.ts, where each relation is stated and was checked on 103 of 103 rows). They
 * are grouped rather than captioned: on a shared timeline the restatements are visibly the same
 * shape as the line above them, which is the answer to "are these all the metrics" that does not
 * cost him a paragraph. His ruling of the same day: a caption that tells him where a number came
 * from is not an insight.
 */

export interface StackSeries {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  derived: boolean;
  points: { date: string; value: number }[];
}

const ROW_H = 46;
const PAD_L = 4;
const PAD_R = 6;
const PAD_V = 7;

function useWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const next = e[0]?.contentRect.width ?? 0;
      if (next > 0) setW(Math.round(next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const fmt = (v: number, d: number) =>
  v.toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d });

function monthLabel(t: number): string {
  return new Date(t).toLocaleDateString('en-CA', { month: 'short', timeZone: 'UTC' });
}

export function MetricStack({ series }: { series: StackSeries[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const W = useWidth(wrapRef);
  const [atT, setAtT] = useState<number | null>(null);

  const usable = series.filter((s) => s.points.length >= 2);
  if (!usable.length) return null;

  /* ONE DOMAIN FOR EVERY ROW. This is the whole point of the component. */
  const allT = usable.flatMap((s) => s.points.map((p) => Date.parse(`${p.date}T12:00:00Z`)));
  const tMin = Math.min(...allT);
  const tMax = Math.max(...allT);
  const span = tMax - tMin || 1;
  const x = (t: number) => PAD_L + ((t - tMin) / span) * (W - PAD_L - PAD_R);

  /* The date being read. Null means "the newest reading", so the component opens showing where he
     is now rather than showing nothing until he touches it. */
  const readT = atT ?? tMax;

  const nearest = (s: StackSeries) => {
    let best = s.points[0]!;
    let bestD = Infinity;
    for (const p of s.points) {
      const d = Math.abs(Date.parse(`${p.date}T12:00:00Z`) - readT);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  };

  const move = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const frac = Math.min(1, Math.max(0, (px - PAD_L) / (W - PAD_L - PAD_R)));
    setAtT(tMin + frac * span);
  };

  /* The date shown is the date of the nearest WEIGHT reading, not the raw crosshair position. A
     header reading "12 Mar" above a row whose nearest reading is the 8th is the label-and-data-from
     -two-places failure this surface has already shipped once. */
  const anchor = nearest(usable[0]!);
  const anchorT = Date.parse(`${anchor.date}T12:00:00Z`);

  /* Month gridlines, so a position on the axis can be named without a second axis row per chart. */
  const months: number[] = [];
  {
    const d = new Date(tMin);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() < tMax) { months.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + 1); }
  }

  return (
    <div className="mstack">
      <div className="mstack-head">
        <span className="mstack-date tnum">
          {new Date(anchorT).toLocaleDateString('en-CA', {
            day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
          })}
        </span>
        {atT != null && (
          <button type="button" className="mstack-reset" onClick={() => setAtT(null)}>
            latest
          </button>
        )}
      </div>

      <div
        className="mstack-rows"
        ref={wrapRef}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons > 0 || e.pointerType === 'mouse') move(e.clientX); }}
        onPointerLeave={() => { if (atT != null) setAtT(null); }}
        style={{ touchAction: 'none' }}
      >
        {usable.map((s, i) => {
          const vals = s.points.map((p) => p.value);
          const vMin = Math.min(...vals);
          const vMax = Math.max(...vals);
          const vSpan = vMax - vMin || 1;
          const y = (v: number) => PAD_V + (1 - (v - vMin) / vSpan) * (ROW_H - PAD_V * 2);
          const path = s.points
            .map((p, j) => `${j === 0 ? 'M' : 'L'} ${x(Date.parse(`${p.date}T12:00:00Z`))} ${y(p.value)}`)
            .join(' ');
          const at = nearest(s);
          const atX = x(Date.parse(`${at.date}T12:00:00Z`));
          const isLast = at.date === s.points[s.points.length - 1]!.date;
          /* ONE DIVIDER, THREE WORDS, WHERE THE MEASURED ROWS END. The alternative was a sentence
             under the chart explaining that five of these are arithmetic, which is exactly the
             caption he ruled out the same day. Rendered only at the boundary, and only when both
             groups exist, so it disappears rather than lying if that ever stops being true. */
          const firstDerived = s.derived && !usable[i - 1]?.derived && i > 0;
          return (
            <Fragment key={s.key}>
              {/* OUTSIDE the row, not inside it. Inside, it had no grid-area in a template naming
                  only label/value/chart, so it auto-placed AFTER the chart: it rendered in the fat
                  mass row and appeared under fat mass's line, which read as "fat mass is measured".
                  It is derived. Caught by looking at the 390px screenshot, not the markup. */}
              {firstDerived && <div className="mstack-split">computed from the two above</div>}
              <div className={`mstack-row${s.derived ? ' is-derived' : ''}`}>
              <div className="mstack-label">{s.label}</div>
              <div className="mstack-v tnum">
                <span className={isLast && atT == null ? 'live' : undefined}>
                  {fmt(at.value, s.decimals)}
                </span>
                <span className="mstack-u">{s.unit}</span>
              </div>
              <svg className="mstack-svg" viewBox={`0 0 ${W} ${ROW_H}`} role="img"
                   aria-label={`${s.label} ${fmt(at.value, s.decimals)} ${s.unit} on ${at.date}`}>
                {months.map((m) => (
                  <line key={m} className="mstack-grid" x1={x(m)} y1={0} x2={x(m)} y2={ROW_H} />
                ))}
                <path className="mstack-line" d={path} />
                <line className="mstack-cross" x1={atX} y1={0} x2={atX} y2={ROW_H} />
                <circle className="mstack-dot" cx={atX} cy={y(at.value)} r={3} />
              </svg>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* THE ONLY AXIS, once, under all of them. Seven date axes stacked is six repetitions of one
          fact and 120px of a 390px screen. */}
      <div className="mstack-axis">
        {months.filter((_, i) => months.length <= 8 || i % 2 === 0).map((m) => (
          <span key={m} className="mstack-tick" style={{ left: `${(x(m) / W) * 100}%` }}>
            {monthLabel(m)}
          </span>
        ))}
      </div>
    </div>
  );
}
