'use client';

import { useEffect } from 'react';

/* Counts one open of this app, for him only. Mounted by SiteHeader and the index.
 *
 * It fires for everyone and the edge throws away everyone but him: /me/api/open is cookie-gated in
 * src/proxy.ts, so a visitor's beacon is a 401 that never touches the database. That is cheaper and
 * simpler than asking the server who is looking before deciding whether to ask.
 *
 * Once per tab per app, not per render, so a client-side hop back and forth does not inflate it. */
export default function Track({ app }: { app: string }) {
  useEffect(() => {
    /* Production only. A local `pnpm start` talks to the SAME database, so on 2026-09-27 the
       screenshot runs of a working session were being counted as his opens. Only the real domain
       counts; everything else is a test. */
    if (location.hostname !== 'hoodii.studio') return;
    /* Once per app per HOUR. It was once per tab lifetime, so a tab left open on the phone for a
       week recorded its first day only; then once per day, which made the strip's "opened more
       than once" shades unreachable from one device. An hour is one visit: a reload in the same
       minute is not a second open, coming back after lunch is. Older keys are pruned as it goes. */
    const now = new Date();
    const key = `opened:${app}:${now.toLocaleDateString('en-CA')}:${now.getHours()}`;
    try {
      if (localStorage.getItem(key)) return;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`opened:${app}:`) && k !== key) localStorage.removeItem(k);
      }
      localStorage.setItem(key, '1');
    } catch { /* storage blocked: count anyway */ }
    const body = JSON.stringify({ app });
    if (!navigator.sendBeacon?.('/me/api/open', new Blob([body], { type: 'application/json' }))) {
      fetch('/me/api/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
        .catch(() => {});
    }
  }, [app]);
  return null;
}
