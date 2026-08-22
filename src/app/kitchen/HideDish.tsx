'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/* "STOP SHOWING ME THIS." One tap on a row, and the undo beside it in the Hidden fold.
 *
 * Copied in shape from shop/ListClient.tsx deliberately: same endpoint contract, same 401 handling,
 * same inline unlock. Every kitchen page is public and only writes are gated, so nothing ever prompts
 * a login, so on a device that never visited /kitchen/login a write fails with no explanation. His
 * words about that: "There's no login so what do you mean there's no login here?"
 *
 * NOT optimistic, unlike the shopping list. A grocery aisle has bad signal and a row that waits reads
 * as broken, which is why that one moves first and apologises later. This is the opposite case: he is
 * sitting at home deciding what to cook, and a row that vanishes and then comes back on refresh is
 * worse than one that takes a moment. The router refresh is the confirmation. */
export default function HideDish({ dish, name, hidden }: { dish: string; name: string; hidden?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(ev: 'hide' | 'show') {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/kitchen/api/veto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ev, dish, name }),
      });
      if (res.status === 401) { setErr('locked'); return; }
      if (!res.ok) { setErr(String(res.status)); return; }
      router.refresh();
    } catch {
      setErr('offline');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="rowaction"
        disabled={busy}
        onClick={() => void send(hidden ? 'show' : 'hide')}
        /* The label says what happens, not what the button is. "Hide" alone reads as a state. */
        aria-label={hidden ? `Show ${name} again` : `Stop showing ${name}`}
      >
        {busy ? '...' : hidden ? 'show it again' : 'not this'}
      </button>
      {err && <Failed err={err} onRetry={() => send(hidden ? 'show' : 'hide')} />}
    </>
  );
}

function Failed({ err, onRetry }: { err: string; onRetry: () => Promise<void> }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  async function unlock() {
    setBusy(true);
    setWrong(false);
    try {
      const res = await fetch('/kitchen/api/unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pw }),
      });
      if (!res.ok) { setWrong(true); return; }
      await onRetry();
    } catch { setWrong(true); } finally { setBusy(false); }
  }

  if (err !== 'locked') {
    return (
      <div className="box warn" style={{ marginTop: 8 }}>
        <span className="k">That did not save</span>
        <div>{err === 'offline'
          ? 'The request never reached the server. Nothing changed. Try again.'
          : `The server refused it (${err}). Nothing changed.`}</div>
      </div>
    );
  }
  return (
    <div className="box warn" style={{ marginTop: 8 }}>
      <span className="k">This device cannot change your lists yet</span>
      <div>Reading is open to anyone. Changing your logs is not, because everything else is worked out
        from them. Unlock once and it stays unlocked for a year.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          type="password" value={pw} autoComplete="current-password" placeholder="Password"
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && pw && !busy) void unlock(); }}
          style={{ flex: '1 1 160px' }}
        />
        <button className="primary" disabled={busy || !pw} onClick={() => void unlock()} style={{ fontSize: 15 }}>
          {busy ? 'Unlocking...' : 'Unlock and save'}
        </button>
      </div>
      {wrong && <p className="changes" style={{ marginTop: 10 }}>Not that one. Nothing was lost, try again.</p>}
      <p className="quiet" style={{ marginTop: 10 }}>
        Or do it on <Link href="/kitchen/login" target="_blank">the login page</Link> and come back.
      </p>
    </div>
  );
}
