'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
 *     prefers-reduced-motion switches the animation off in CSS. A chart that is ALREADY on screen
 *     when the page hydrates gets `still` as well, which skips the animation: otherwise the fully
 *     drawn server picture collapsed to nothing and grew back, a flash rather than an entrance.
 *
 * TOUCH OPENS ON CLICK, NOT ON POINTERDOWN. The marks are full-height hit areas, so a scroll that
 * begins on a picture used to pop a label before the browser knew it was a scroll. A click only
 * fires for a tap. A second tap on the same mark closes it, a tap anywhere else on the page closes
 * it too (a document listener while one is open), and hover follows the mouse. Inside a link (the
 * index rows) a touch tap on a mark is a question, not a navigation, so its click is swallowed; a
 * mouse click is left alone, because hover already showed the value and the click means "open".
 *
 * The label is HTML beside the drawing, not text inside the viewBox, per the rule every chart here
 * learned the hard way: text in an SVG scales with the box and lands at 6px on a phone. It is
 * clamped inside the wrapper after it paints, because the first bar sits at the left edge and half
 * the label hung off the phone (measured: left -29px). */
type Tip = { text: string; x: number; y: number; el: Element };

export default function Readout({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const lastPointer = useRef<string>('mouse');
  const [view, setView] = useState<'' | ' in' | ' in still'>('');
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setView(' in still'); return; }
    let first = true;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.some((e) => e.isIntersecting);
      if (hit) { setView(first ? ' in still' : ' in'); io.disconnect(); }
      first = false;
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* A tap anywhere outside the open label's wrapper closes it. */
  useEffect(() => {
    if (!tip) return;
    const close = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setTip(null);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [tip]);

  useLayoutEffect(() => {
    const el = ref.current;
    const t = tipRef.current;
    if (!el || !t || !tip) return;
    const half = t.offsetWidth / 2;
    const max = el.clientWidth - half;
    const x = Math.min(Math.max(tip.x, half), Math.max(half, max));
    if (Math.abs(x - tip.x) > 0.5) setTip({ ...tip, x });
  }, [tip]);

  function markAt(target: EventTarget | null): Tip | null {
    const el = ref.current;
    if (!el || !(target instanceof Element)) return null;
    const mark = target.closest('[data-r]');
    if (!mark || !el.contains(mark)) return null;
    const text = mark.getAttribute('data-r') ?? '';
    if (!text) return null;
    const box = el.getBoundingClientRect();
    const r = mark.getBoundingClientRect();
    return { text, x: r.left + r.width / 2 - box.left, y: r.top - box.top, el: mark };
  }

  return (
    <div
      ref={ref}
      className={`readout${view}${className ? ` ${className}` : ''}`}
      onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
      onPointerMove={(e) => { if (e.pointerType === 'mouse') setTip(markAt(e.target)); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setTip(null); }}
      onClick={(e) => {
        if (lastPointer.current === 'mouse') return;
        const m = markAt(e.target);
        if (!m) return;
        e.preventDefault();
        setTip((t) => (t && t.el === m.el ? null : m));
      }}
    >
      {children}
      {tip && (
        <div ref={tipRef} className="readout-tip tnum" role="status" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
