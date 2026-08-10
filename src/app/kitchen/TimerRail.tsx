'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  type KTimer, subscribe, readTimers, serverTimers, clearTimer, extendTimer,
  remaining, clock, alarm, reacquireWakeIfNeeded,
} from '@/lib/kitchen/timers';

/** Everything running, pinned to the top of every kitchen screen.
 *
 *  The rule it exists to enforce: he should never have to navigate to find out whether something is
 *  ready. Tapping a chip opens what that step said, in place, without leaving the step he is on. */
export default function TimerRail() {
  const timers = useSyncExternalStore(subscribe, readTimers, serverTimers);
  const [, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const fired = useRef<Set<string>>(new Set());

  // Re-render on a clock of our own rather than trusting an interval to have run: every render
  // recomputes from Date.now(), so a tick that never fired costs nothing but a stale display.
  useEffect(() => {
    if (!timers.length) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    const onVis = () => {
      setTick((t) => t + 1);
      reacquireWakeIfNeeded();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [timers.length]);

  // Sound once per timer, on the first render where it has expired. If the phone was asleep when it
  // actually hit zero, this fires the moment the screen comes back, which is the honest behaviour:
  // a browser cannot make noise from a suspended tab and pretending otherwise would be worse.
  useEffect(() => {
    for (const t of timers) {
      if (remaining(t) <= 0 && !fired.current.has(t.id)) {
        fired.current.add(t.id);
        alarm();
      }
    }
    for (const id of [...fired.current]) {
      if (!timers.some((t) => t.id === id)) fired.current.delete(id);
    }
  });

  if (!timers.length) return null;

  const sorted = [...timers].sort((a, b) => a.endsAt - b.endsAt);
  const shown = sorted.find((t) => t.id === open);

  return (
    <div className="rail">
      <div className="rail-chips">
        {sorted.map((t) => {
          const left = remaining(t);
          const done = left <= 0;
          return (
            <button
              key={t.id}
              className={`chip${done ? ' ready' : ''}${open === t.id ? ' open' : ''}`}
              onClick={() => setOpen(open === t.id ? null : t.id)}
            >
              <span className="chip-t">{done ? 'READY' : clock(left)}</span>
              <span className="chip-l">{t.label}</span>
            </button>
          );
        })}
      </div>

      {shown && (
        <div className="rail-open">
          <div className="rail-where">
            {shown.recipeName} · step {shown.step} of {shown.stepOf}
            {remaining(shown) <= 0 ? ` · ${clock(remaining(shown))} over` : ''}
          </div>
          <p className="rail-text">{shown.text}</p>
          {shown.doneness && (
            <div className="box done" style={{ marginBottom: 12 }}>
              <span className="k">How you know it is ready</span>{shown.doneness}
            </div>
          )}
          {shown.heat && (
            <div className="box heat" style={{ marginBottom: 12 }}>
              <span className="k">Heat</span>{shown.heat}
            </div>
          )}
          <div className="rail-acts">
            <button onClick={() => extendTimer(shown.id, 60)}>+1 min</button>
            <Link className="btn" href={`/kitchen/${shown.recipeId}?step=${shown.step}`}>
              Go to it
            </Link>
            <button
              className="primary"
              onClick={() => { clearTimer(shown.id); setOpen(null); }}
            >Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The control that starts one, rendered by the cook screen on any step that carries a duration. */
export function TimerButton({ running, left, onStart, onClear, minutes }: {
  running: boolean; left: number; minutes: number;
  onStart: () => void; onClear: () => void;
}) {
  if (running) {
    return (
      <div className="timer-row">
        <span className={`timer-live${left <= 0 ? ' ready' : ''}`}>
          {left <= 0 ? 'Timer done' : `Running · ${clock(left)}`}
        </span>
        <button onClick={onClear}>Stop</button>
      </div>
    );
  }
  return (
    <div className="timer-row">
      <button className="timer-start" onClick={onStart}>Start {minutes} min timer</button>
      <span className="timer-hint">It stays on screen while you carry on.</span>
    </div>
  );
}

export type { KTimer };
