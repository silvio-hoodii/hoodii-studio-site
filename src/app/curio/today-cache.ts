'use client';

import { useEffect, useState } from 'react';
import type { Today as TodayData } from '@/lib/curio/today';
import { today } from '@/lib/day';

/* Today's Curio cards, shown from this device's last copy while the fresh copy loads.
 *
 * His note, 2026-09-27: "I noticed the curio a little bit more time to load than the rest". It did,
 * by construction: the page arrives, its script starts, and only then does the card ask the server,
 * a third wait no other part of the site has. The cards change only when he answers one, so the copy
 * from his last visit today is right almost every time. It paints at once, the request still runs,
 * and whatever it returns replaces the copy.
 *
 * localStorage is the right store here and not a database: it is a per-device convenience, it is
 * never the record (curio_review is), and a blocked or empty store just means the old wait. Keyed to
 * the Calgary day, so yesterday's cards are never shown as today's. */

const KEY = 'curio:today:v1';

export type Load =
  | { state: 'loading' }
  | { state: 'locked' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: TodayData; fresh: boolean };

function read(): TodayData | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as TodayData | null;
    return c && c.day === today() ? c : null;
  } catch {
    return null;
  }
}

function write(d: TodayData | null) {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked: no copy next time, nothing else */ }
}

/* After a stored grade or verdict, so a reload does not deal the same card back from the copy. */
export function forgetCard(id: string) {
  const c = read();
  if (c) write({ ...c, quiz: c.quiz.filter((q) => q.id !== id) });
}

export function forgetSave(id: string, verdict: 'keep' | 'drop') {
  const c = read();
  if (!c) return;
  const card = c.saves.find((s) => s.id === id);
  write({
    ...c,
    saves: c.saves.filter((s) => s.id !== id),
    kept: verdict === 'keep' && card ? [card, ...c.kept] : c.kept,
  });
}

export function useToday(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    let live = true;
    /* Deferred a microtask: a synchronous setState in an effect is a cascading render in React 19. */
    queueMicrotask(() => {
      const cached = read();
      if (live && cached) setLoad((l) => (l.state === 'loading' ? { state: 'ready', data: cached, fresh: false } : l));
    });
    fetch('/curio/api/today', { cache: 'no-store' })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 401) {
          write(null);
          return setLoad({ state: 'locked' });
        }
        const j = await r.json();
        if (!r.ok || !j.ok) {
          /* Keep showing the copy if there is one; a failed refresh is not worth hiding good cards. */
          return setLoad((l) => (l.state === 'ready' ? l : { state: 'error', message: String(j.error ?? r.status) }));
        }
        const data = j as TodayData;
        write(data);
        setLoad({ state: 'ready', data, fresh: true });
      })
      .catch((e) => live && setLoad((l) => (l.state === 'ready' ? l : { state: 'error', message: String(e) })));
    return () => {
      live = false;
    };
  }, []);

  return load;
}
