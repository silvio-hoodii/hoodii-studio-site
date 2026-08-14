'use client';

import { useState } from 'react';
import Link from 'next/link';

/* A write failed, and the screen has to say so.
 *
 * The kitchen learned this on 2026-08-11: he typed three notes at the stove, was told they were
 * saved, and none of them existed. `fetch` rejects on a network error and NEVER on an HTTP status,
 * so the 401 from proxy.ts resolved happily and every call site that did `await fetch(...)` then
 * `setSent(true)` reported success on a refusal.
 *
 * The same defect was still live in two other apps three days later. Gym swallowed every autosave
 * with `.catch(() => {})` and printed "Session saved." whatever the server said; French fired the
 * review POST without awaiting it and advanced the queue regardless, so a rated card was gone from
 * the screen and unchanged in the database. Nothing had been lost yet only because he had not
 * trained that week.
 *
 * So this is one component rather than a pattern to copy a third time. A pattern gets applied to
 * the surface someone is looking at; a component gets applied everywhere it is mounted, and the
 * next app to need it imports it instead of reinventing the half of it that matters.
 *
 * Two things it must do, in order:
 *  - never let a failure look like a success,
 *  - and let him fix it from where he is standing. The gate is real (these are append-only logs
 *    everything else is derived from, on a public repo and an open internet) but every page on
 *    this site is public, so nothing ever routes him to a login and the lock had no keyhole.
 *
 * `onRetry` returns whether everything queued actually went through. It must re-send the work, not
 * merely clear the warning: unlocking and saving are one action here.
 */
export default function SaveBlocked({
  err,
  noun,
  queued = 1,
  onRetry,
  loginHref,
  sticky = false,
}: {
  /** 'locked' (401), 'offline' (never reached the server), or `failed ${status}`. */
  err: string;
  /** What is waiting, singular: "set", "review", "section". */
  noun: string;
  queued?: number;
  onRetry: () => Promise<boolean>;
  loginHref: string;
  /** Pins the banner to the top of the viewport, for a page long enough to scroll away from it. */
  sticky?: boolean;
}) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  const waiting = `${queued} ${noun}${queued === 1 ? '' : 's'} waiting to be saved.`;
  const cls = `save-blocked${sticky ? ' stick' : ''}`;

  async function retry() {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    setWrong(false);
    try {
      const res = await fetch('/kitchen/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pw }),
      });
      if (!res.ok) {
        setWrong(true);
        return;
      }
      // The cookie is set. Send the thing he already did, so unlocking and saving are one action.
      await onRetry();
    } catch {
      setWrong(true);
    } finally {
      setBusy(false);
    }
  }

  if (err !== 'locked') {
    return (
      <div className={cls} role="alert">
        <span className="k">Not saved</span>
        <p>
          {err === 'offline'
            ? 'The request never reached the server.'
            : `The server refused it (${err}).`}{' '}
          Nothing you entered was lost. {waiting}
        </p>
        <div className="row">
          <button type="button" disabled={busy} onClick={() => void retry()}>
            {busy ? 'Trying…' : 'Try again'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cls} role="alert">
      <span className="k">This device cannot save</span>
      <p>
        Reading is open to anyone. Changing your logs is not, because everything else is worked out
        from them. Unlock this device once and it stays unlocked for a year. Nothing you entered was
        lost. {waiting}
      </p>
      <div className="row">
        <input
          type="password"
          value={pw}
          autoComplete="current-password"
          placeholder="Password"
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pw && !busy) void unlock();
          }}
        />
        <button type="button" disabled={busy || !pw} onClick={() => void unlock()}>
          {busy ? 'Unlocking…' : 'Unlock and save'}
        </button>
      </div>
      {wrong && <p className="wrong">Not that one. Nothing was lost, try again.</p>}
      <p className="alt">
        Or do it on <Link href={loginHref} target="_blank">the login page</Link> and come back.
      </p>
    </div>
  );
}
