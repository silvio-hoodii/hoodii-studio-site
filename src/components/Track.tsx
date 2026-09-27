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
    const key = `opened:${app}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* storage blocked: count anyway */ }
    const body = JSON.stringify({ app });
    if (!navigator.sendBeacon?.('/me/api/open', new Blob([body], { type: 'application/json' }))) {
      fetch('/me/api/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
        .catch(() => {});
    }
  }, [app]);
  return null;
}
