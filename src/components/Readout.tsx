'use client';

import { useEffect, useRef, useState } from 'react';

/* THE ONE PIECE OF CLIENT CODE THE PICTURES SHARE, since 2026-09-27 ("more dynamic").
 *
 * Every chart on this site is server-rendered SVG, which is why the pages cost almost no JavaScript.
 * That left two things a picture could not do. A phone never shows an SVG <title>, so a bar's value
 * was unreadable on the one device he uses. And nothing moved: a chart that draws itself in when it
 * scrolls into view is the cheapest possible signal that the numbers are live rather than printed.
 *
 * This wrapper adds both without the chart knowing about it:
 *
 *   - Any element inside it carrying `data-r="..."` gets a readout on tap or hover: a small label
 *     above it with that text. The chart just annotates its marks; it stays a server component.
 *   - On first intersection it adds the class `in`, and globals.css animates `.vbar` (grows up from
 *     its base) and `.vline` (draws left to right, via pathLength="1") only under `.readout.in`.
 *     No JavaScript, no class, no animation: the static picture is the honest fallback, and
 *     prefers-reduced-motion switches the animation off in CSS.
 *
 * One tap opens, a second tap on the same mark or anywhere else closes, hover follows the pointer.
 * The label is HTML beside the drawing, not text inside the viewBox, per the rule every chart here
 * learned the hard way: text in an SVG scales with the box and lands at 6px on a phone. */
export default function Readout({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number; key: string } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function markAt(target: EventTarget | null): { text: string; x: number; y: number; key: string } | null {
    const el = ref.current;
    if (!el || !(target instanceof Element)) return null;
    const mark = target.closest('[data-r]');
    if (!mark || !el.contains(mark)) return null;
    const text = mark.getAttribute('data-r') ?? '';
    if (!text) return null;
    const box = el.getBoundingClientRect();
    const r = mark.getBoundingClientRect();
    return { text, x: r.left + r.width / 2 - box.left, y: r.top - box.top, key: `${r.left}:${r.top}` };
  }

  return (
    <div
      ref={ref}
      className={`readout${inView ? ' in' : ''}${className ? ` ${className}` : ''}`}
      onPointerMove={(e) => { if (e.pointerType === 'mouse') setTip(markAt(e.target)); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setTip(null); }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return;
        const m = markAt(e.target);
        setTip((t) => (m && t?.key !== m.key ? m : null));
      }}
      /* The index mounts this inside the row's link. A tap on a mark is a question, not a
         navigation, so the click that follows it is swallowed; a tap beside the marks still opens
         the app. */
      onClick={(e) => { if (markAt(e.target)) e.preventDefault(); }}
    >
      {children}
      {tip && (
        <div className="readout-tip tnum" role="status" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
