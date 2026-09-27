'use client';

import { useEffect, useState } from 'react';

/** The container's own pixel width, so a chart's viewBox matches it and its text renders at the size
 *  the CSS says. `fallback` is what the server renders before anything can be measured. One hook for
 *  LineChart, BarChart and MetricStack, which each carried a copy. */
export function useMeasuredWidth(ref: React.RefObject<HTMLDivElement | null>, fallback = 600): number {
  const [w, setW] = useState(fallback);
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
