/* The service worker, served as a route because this repo has no public/ folder. Its only jobs are
 * to show a Curio notification and to open /curio when it is tapped. No caching and no offline
 * mode: a service worker that caches pages is a second copy of the site that goes stale on its own. */
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
    icon: '/icon',
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/curio';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) if (w.url.includes(url) && 'focus' in w) return w.focus();
    return self.clients.openWindow(url);
  }));
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
