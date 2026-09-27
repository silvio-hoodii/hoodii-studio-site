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
    registration()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
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

  const test = async () => {
    setNote(null);
    const r = await fetch('/curio/api/push/test', { method: 'POST' }).catch(() => null);
    setNote(r?.ok ? 'Sent. It should show on this device in a few seconds.' : 'The test did not send.');
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
