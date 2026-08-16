'use client';

import { useEffect, useRef } from 'react';

/* The pace clock, redrawn.
 *
 * SwimOS/wedge/DESIGN.md built its whole identity on this object and the reasoning is good enough to
 * keep even though the palette around it is not: it is "the analog 60-second clock bolted to every
 * pool deck", the literal instrument swimmers already read, and it is FUNCTIONAL rather than
 * decorative because it shows the real current time. That is why it survives the move and the
 * porcelain-and-terracotta deck-clock palette does not.
 *
 * The sweep hand is the purest use of --signal there is. That colour is reserved for a value that is
 * true right now, and a hand pointing at the current second is exactly that.
 *
 * It is not the ONLY coloured thing on the page, and an earlier version of this comment said it was.
 * The pin at the centre wears it too, because the pin is part of this hand, and so does the time on
 * a session that is open at this second, which is the same claim about now made about a different
 * fact. Three uses, one meaning. Worth stating precisely rather than claiming an exclusivity the
 * stylesheet does not have.
 *
 * The original drove all three hands from a requestAnimationFrame loop, sixty times a second, to
 * move an hour hand that visibly changes twice an hour. This keeps rAF for the second hand only,
 * because a sweep that ticks is not a sweep, and it recomputes the slow hands from the same frame
 * without touching the DOM unless the value actually changed.
 *
 * transform-origin is set explicitly to the middle of the viewBox. The original relied on the SVG
 * default origin of 0,0 happening to work with hands authored from x=32, which is true but is a
 * coincidence one edit away from breaking.
 */
export default function PaceClock() {
  const hr = useRef<SVGLineElement>(null);
  const min = useRef<SVGLineElement>(null);
  const sec = useRef<SVGLineElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let lastMin = -1;

    const draw = () => {
      /* Calgary, not the reader's timezone. A pace clock showing the time in the reader's phone is
         answering a question nobody asked: every session on this page is Calgary wall clock, and a
         clock beside them that disagrees is worse than no clock. */
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Edmonton',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(new Date());
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
      const s = get('second') + (Date.now() % 1000) / 1000;
      const m = get('minute') + s / 60;
      const h = (get('hour') % 12) + m / 60;

      if (sec.current) sec.current.style.transform = `rotate(${s * 6}deg)`;
      // The slow hands move twice an hour between them. No reason to write them every frame.
      if (Math.floor(m) !== lastMin) {
        lastMin = Math.floor(m);
        if (min.current) min.current.style.transform = `rotate(${m * 6}deg)`;
        if (hr.current) hr.current.style.transform = `rotate(${h * 30}deg)`;
      }
      if (!reduce) frame = requestAnimationFrame(draw);
    };

    /* Reduced motion still gets the correct time, it just does not sweep. The clock's job is to be
       readable; the sweeping is the part that is atmosphere. */
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i * 6 * Math.PI) / 180;
    const big = i % 5 === 0;
    const r1 = big ? 26.5 : 28.5;
    return {
      i, big,
      x1: (32 + r1 * Math.sin(a)).toFixed(2), y1: (32 - r1 * Math.cos(a)).toFixed(2),
      x2: (32 + 30 * Math.sin(a)).toFixed(2), y2: (32 - 30 * Math.cos(a)).toFixed(2),
    };
  });

  return (
    <svg className="clock" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      {/* Rendered on the server rather than injected by script, so the face is drawn before any JS
          runs and a reader with JS off still gets a clock face rather than an empty ring. */}
      {ticks.map((t) => (
        <line key={t.i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="currentColor" strokeWidth={t.big ? 1.2 : 0.6} opacity={t.big ? 0.75 : 0.3} />
      ))}
      <line ref={hr} className="hand" x1="32" y1="32" x2="32" y2="20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line ref={min} className="hand" x1="32" y1="32" x2="32" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line ref={sec} className="hand sweep" x1="32" y1="36" x2="32" y2="11" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="32" cy="32" r="1.9" className="pin" />
    </svg>
  );
}
