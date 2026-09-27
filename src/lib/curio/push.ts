import webpush from 'web-push';
import { sql } from './db';
import { VAPID_PUBLIC_KEY } from './push-key';

/* The morning nudge. His words, 2026-09-26: "I think we need to come up with something that kind of
 * pushes it to me, but I'm not going to open the email". A phone notification whose text IS the
 * first question, so what arrives is already the card, not a message about the card.
 *
 * The VAPID subject is the site's URL rather than an email address: push services only need a way
 * to reach the sender, and a URL leaks nothing. */

export interface SendResult {
  sent: number;
  removed: number;
  failed: string[];
}

export async function saveSubscription(sub: webpush.PushSubscription): Promise<void> {
  await sql`
    insert into curio_push (endpoint, sub) values (${sub.endpoint}, ${JSON.stringify(sub)}::jsonb)
    on conflict (endpoint) do update set sub = excluded.sub`;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await sql`delete from curio_push where endpoint = ${endpoint}`;
}

export async function sendToAll(title: string, body: string, url: string): Promise<SendResult> {
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  /* Refuse loudly rather than report "sent 0", which reads as "nobody subscribed". */
  if (!priv) throw new Error('VAPID_PRIVATE_KEY is not set');
  webpush.setVapidDetails('https://hoodii.studio', VAPID_PUBLIC_KEY, priv);

  const subs = (await sql`select endpoint, sub from curio_push`) as Array<{
    endpoint: string; sub: webpush.PushSubscription | string;
  }>;
  const payload = JSON.stringify({ title, body, url });
  const out: SendResult = { sent: 0, removed: 0, failed: [] };
  for (const s of subs) {
    const sub = typeof s.sub === 'string' ? (JSON.parse(s.sub) as webpush.PushSubscription) : s.sub;
    try {
      await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 12 });
      out.sent += 1;
      await sql`update curio_push set last_ok = now(), last_error = null where endpoint = ${s.endpoint}`;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      /* 404 and 410 mean the browser threw the subscription away (site data cleared, app
         uninstalled). Anything else is kept and recorded, because a transient push-service error
         must not silently unsubscribe him. */
      if (code === 404 || code === 410) {
        await removeSubscription(s.endpoint);
        out.removed += 1;
      } else {
        const msg = `${code ?? ''} ${String((e as Error).message ?? e)}`.trim();
        out.failed.push(msg);
        await sql`update curio_push set last_error = ${msg} where endpoint = ${s.endpoint}`;
      }
    }
  }
  return out;
}
