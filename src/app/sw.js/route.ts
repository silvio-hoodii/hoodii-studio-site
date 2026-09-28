/* The service worker, served as a route because this repo has no public/ folder. Its only jobs are
 * to show a Curio notification, to open /curio when it is tapped, and to keep the server's copy of
 * the subscription current. No caching and no offline mode: a service worker that caches pages is a
 * second copy of the site that goes stale on its own.
 *
 * `/icon/192`, not `/icon`: src/app/icon.tsx uses generateImageMetadata, so only /icon/32, /icon/192
 * and /icon/512 exist and a bare /icon is a 404.
 *
 * THE TAP NAVIGATES, since 2026-09-27. It matched any open tab whose URL contained "/curio", which
 * also matched /curio/archive, and focused it without moving it, so a tap on the morning question
 * could land on a stale page. Now an open tab is focused and then sent to the notification's URL,
 * focus first because focus() needs the tap's user activation and a navigation can outlive it. A
 * tab that cannot be navigated (not controlled by this worker) falls through to a new window.
 *
 * `pushsubscriptionchange` re-POSTs the new subscription to /curio/api/push, the same body the page
 * sends when he turns reminders on, and deletes the old endpoint. Without it a subscription the
 * browser rotated stops receiving and nothing says so. */
const SW = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Curio', {
    body: d.body || '',
    data: { url: d.url || '/curio' },
    tag: 'curio',
    icon: '/icon/192',
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/curio', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (ws) => {
    for (const w of ws) {
      if (!('focus' in w)) continue;
      try {
        const f = await w.focus();
        if (f.url !== url) await f.navigate(url);
        return;
      } catch (_) { /* not controlled by this worker: try the next tab, then a new window */ }
    }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    let sub = e.newSubscription || null;
    if (!sub) {
      const opts = e.oldSubscription && e.oldSubscription.options;
      if (!opts || !opts.applicationServerKey) return;
      sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: opts.applicationServerKey,
      });
    }
    await fetch('/curio/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(sub.toJSON()),
    });
    if (e.oldSubscription && e.oldSubscription.endpoint !== sub.endpoint) {
      await fetch('/curio/api/push', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ endpoint: e.oldSubscription.endpoint }),
      });
    }
  })());
});
`;

export const dynamic = 'force-static';

export function GET() {
  return new Response(SW, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
      'service-worker-allowed': '/',
    },
  });
}
