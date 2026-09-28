'use client';

import { useEffect, useState } from 'react';
import { VAPID_PUBLIC_KEY } from '@/lib/curio/push-key';

/* The switch for the morning notification, under today's cards. Per device: the phone says yes on
 * the phone. Rendered only inside Today, which only renders for a signed-in device, because the
 * subscribe route is gated and a button that 401s is worse than no button. */

type State = 'unsupported' | 'checking' | 'off' | 'on' | 'blocked' | 'busy';

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export default function Remind() {
  const [state, setState] = useState<State>('checking');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      queueMicrotask(() => setState('unsupported'));
      return;
    }
    if (Notification.permission === 'denied') {
      queueMicrotask(() => setState('blocked'));
      return;
    }
    /* THE BROWSER'S WORD IS NOT THE SERVER'S. A subscription the push service answered 404 or 410
       for is deleted from the server while the browser still holds it, so "on" here could mean no
       row at all. Re-POSTing on mount is an upsert: it re-creates a deleted row and changes nothing
       when the row is there. Best effort, and the switch does not wait for it. */
    registration()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) {
          fetch('/curio/api/push', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(sub.toJSON()),
          }).catch(() => {});
        }
        setState(sub ? 'on' : 'off');
      })
      .catch(() => setState('off'));
  }, []);

  const turnOn = async () => {
    setState('busy');
    setNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState(perm === 'denied' ? 'blocked' : 'off');
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
      });
      const r = await fetch('/curio/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!r.ok) {
        await sub.unsubscribe();
        setNote('Not saved. Try again.');
        return setState('off');
      }
      setState('on');
    } catch (e) {
      setNote(String((e as Error).message ?? e));
      setState('off');
    }
  };

  const turnOff = async () => {
    setState('busy');
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/curio/api/push', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      setState('on');
    }
  };

  /* The route answers for THIS device (`thisDevice`) and counts the rest, so a failure on another
     phone no longer reads as a failure here, and a removal elsewhere no longer flips this switch. */
  const test = async () => {
    setNote(null);
    const reg = await registration().catch(() => null);
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    const r = await fetch('/curio/api/push/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub?.endpoint ?? null }),
    }).catch(() => null);
    const j = (r ? await r.json().catch(() => null) : null) as {
      sent?: number; failed?: string[]; thisDevice?: string; error?: string;
    } | null;
    if (!j || j.error) return setNote('The test did not send.');
    const sent = Number(j.sent ?? 0);
    const failed = Array.isArray(j.failed) ? j.failed.length : 0;
    const devices = (n: number) => `${n} ${n === 1 ? 'device' : 'devices'}`;
    if (j.thisDevice === 'removed') {
      setState('off');
      return setNote('This device had expired. Turn reminders on again.');
    }
    if (j.thisDevice === 'failed') return setNote(`The test did not reach this device. Sent to ${devices(sent)}.`);
    if (sent === 0) return setNote('The test did not send.');
    setNote(failed ? `Sent to ${devices(sent)}, failed on ${failed}.` : `Test sent to ${devices(sent)}.`);
  };

  if (state === 'unsupported' || state === 'checking') return null;
  return (
    <div className="remind">
      {state === 'blocked' ? (
        <p className="empty">Notifications are blocked for this site in the browser settings.</p>
      ) : state === 'on' ? (
        <div className="acts">
          <button type="button" onClick={test}>Send a test</button>
          <button type="button" onClick={turnOff}>Stop morning reminder</button>
        </div>
      ) : (
        <div className="acts">
          <button type="button" className="primary" disabled={state === 'busy'} onClick={turnOn}>
            Remind me each morning
          </button>
        </div>
      )}
      {note && <p className="empty">{note}</p>}
    </div>
  );
}
