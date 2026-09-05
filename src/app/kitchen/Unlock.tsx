'use client';

import { useState } from 'react';
import { unlock, type WriteResult } from './write';

/* The write failed. Say so where the button was, and if the reason is the cookie, take the
 * password right here and retry the same write. Unlocking and saving are one action. */
export default function Unlock({ err, onRetry }: { err: WriteResult; onRetry: () => Promise<void> }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  if (err !== 'locked') {
    return (
      <div className="unlock" role="alert">
        <span className="k">Not saved</span>
        <div>
          {err === 'offline' ? 'The request never reached the server.' : `The server refused it (${err}).`}{' '}
          <button type="button" className="send" onClick={() => void onRetry()} style={{ marginTop: 10 }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setWrong(false);
    try {
      const ok = await unlock(pw);
      if (!ok) {
        setWrong(true);
        return;
      }
      await onRetry();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="unlock" role="alert">
      <span className="k">Not saved</span>
      <div>This device is not unlocked yet. Password once, and it stays unlocked for a year.</div>
      <form onSubmit={go}>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
        />
        <button type="submit" className="send" disabled={busy || !pw}>
          {busy ? 'Saving' : 'Unlock and save'}
        </button>
      </form>
      {wrong && <div style={{ marginTop: 8 }}>That password was not accepted.</div>}
    </div>
  );
}
