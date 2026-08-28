'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/* The taps on the shopping list: tick a row off, put it back, add something the app would never know
 * about (beer, dish soap, a birthday cake).
 *
 * Every write goes through /kitchen/api/shop, which `proxy.ts` gates like the rest. The inline unlock
 * is the same one the cook screen uses, and it is here for the same reason: every page is public, so
 * nothing ever prompts a login, so on a device that never visited /kitchen/login every write fails with
 * no explanation. "There's no login so what do you mean there's no login here?"
 *
 * OPTIMISTIC, and deliberately so. A grocery aisle has bad signal and a row that waits for a round
 * trip before it moves reads as broken. The row greys immediately, and if the write fails it comes back
 * with the reason attached rather than silently reverting. */
export interface Row {
  id: string;
  name: string;
  why: string[];
  dishes: string[];
  state: 'open' | 'got';
  price: { price: number; label: string; size?: string; unitPrice?: string; store?: string; url?: string; readAt: string; readFrom: string; note?: string } | null;
  priceAgeDays: number | null;
  priceStale: boolean;
  addedByHim: boolean;
  gotDay: string | null;
}

const money = (n: number) => '$' + n.toFixed(2);

export default function ListClient({ open, got, pricedTotal, pricedCount, unpricedCount }: {
  open: Row[]; got: Row[]; pricedTotal: number; pricedCount: number; unpricedCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Record<string, true>>({});
  const [failed, setFailed] = useState<{ id: string; err: string } | null>(null);
  const [adding, setAdding] = useState('');

  async function send(ev: 'add' | 'got' | 'drop', item: string, label?: string) {
    setPending((p) => ({ ...p, [item]: true }));
    setFailed(null);
    try {
      const res = await fetch('/kitchen/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ev, item, label }),
      });
      if (res.status === 401) { setFailed({ id: item, err: 'locked' }); return; }
      if (!res.ok) { setFailed({ id: item, err: String(res.status) }); return; }
      router.refresh();
    } catch {
      setFailed({ id: item, err: 'offline' });
    } finally {
      setPending((p) => { const q = { ...p }; delete q[item]; return q; });
    }
  }

  const retry = failed;

  return (
    <>
      <p className="lede" style={{ marginBottom: 10 }}>
        {open.length === 0
          ? 'Nothing on the list. It fills itself from what you mark low or out and from what a dish is short of.'
          : <>
              <b>{open.length} to buy.</b>{' '}
              {pricedCount > 0 && <>{money(pricedTotal)} for the {pricedCount} with a price read this fortnight</>}
              {unpricedCount > 0 && <>, {unpricedCount} with no price yet</>}.
            </>}
      </p>

      <ul className="meallist">
        {open.map((r) => (
          <li className="mealrow" key={r.id} style={{ gridTemplateColumns: '1fr', opacity: pending[r.id] ? 0.45 : 1 }}>
            <div className="mealbody">
              <div className="mealtop">
                <b>{r.price?.label ?? r.name}</b>
                <span className="v ok">
                  {r.price ? money(r.price.price) : 'no price'}
                </span>
              </div>
              <div className="mealmeta">
                {r.why.join(' · ')}
                {r.price?.size ? ` · ${r.price.size}` : ''}
                {r.price?.store ? ` · ${r.price.store}` : ''}
              </div>
              {r.dishes.length > 0 && (
                <div className="mealvia">for {r.dishes.slice(0, 3).join(', ')}{r.dishes.length > 3 ? ` and ${r.dishes.length - 3} more` : ''}</div>
              )}
              {r.price && (
                <div className="mealmeta">
                  {r.priceStale
                    ? `price read ${r.priceAgeDays} days ago, treat it as history`
                    : `price read ${r.priceAgeDays === 0 ? 'today' : `${r.priceAgeDays} d ago`}`}
                  {r.price.readFrom === 'tile' ? ', off a search result and not opened' : ''}
                  {r.price.unitPrice ? ` · ${r.price.unitPrice}` : ''}
                </div>
              )}
              {r.price?.note && <div className="mealmiss">{r.price.note}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {/* NOT `primary`. `.kos button.primary` carries `flex: 1` for the cook screen's bottom
                    bar, so inside this row it stretched to full width and 24 rows read as a column of
                    black slabs. The 56px height stays: DESIGN.md sets that floor for wet hands and a
                    shopping aisle is not a reason to shrink a target. */}
                <button disabled={!!pending[r.id]} onClick={() => void send('got', r.id, r.name)} style={{ fontSize: 15, padding: '0 18px' }}>
                  Got it
                </button>
                {/* 44px, measured at 20px by scripts/probe-taps.mjs at 390px on 2026-08-28. It sits
                    beside a 56px "Got it" button in the same row, which is the comparison that makes
                    it obvious: two controls on one line, one of them nearly three times the other,
                    and this is the one pressed while standing in an aisle holding a basket. `.quiet`
                    is a TYPE class in globals.css shared by a dozen surfaces, so the box is set here
                    rather than there: making every `.quiet` span 44px tall would add height to
                    paragraphs that are not controls at all. */}
                {r.price?.url && (
                  <a
                    className="quiet"
                    href={r.price.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
                  >
                    check the price
                  </a>
                )}
              </div>
              {retry?.id === r.id && <Failed err={retry.err} onRetry={() => send('got', r.id, r.name)} />}
            </div>
          </li>
        ))}
      </ul>

      <h2 className="sec">Add something the app would not know about</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={adding}
          placeholder="dish soap, beer, birthday cake"
          aria-label="Add to the shopping list"
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && adding.trim()) { const t = adding.trim(); setAdding(''); void send('add', `his:${t.toLowerCase()}`, t); }
          }}
          style={{ flex: '1 1 200px' }}
        />
        <button
          className="primary"
          disabled={!adding.trim()}
          onClick={() => { const t = adding.trim(); setAdding(''); void send('add', `his:${t.toLowerCase()}`, t); }}
          style={{ fontSize: 15 }}
        >
          Add
        </button>
      </div>
      {retry && !open.some((r) => r.id === retry.id) && <Failed err={retry.err} onRetry={() => router.refresh()} />}

      {got.length > 0 && (
        <>
          <h2 className="sec">Ticked off ({got.length})</h2>
          <ul className="meallist">
            {got.map((r) => (
              <li className="mealrow" key={r.id} style={{ gridTemplateColumns: '1fr', opacity: 0.55 }}>
                <div className="mealbody">
                  <div className="mealtop">
                    <b>{r.name}</b>
                    <span className="v">{r.gotDay ?? 'dropped'}</span>
                  </div>
                  <button disabled={!!pending[r.id]} onClick={() => void send('add', r.id, r.name)} style={{ fontSize: 14, marginTop: 6 }}>
                    Put it back
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** Same shape as the cook screen's, and for the same reason: a write that fails has to say why and
 *  offer the password in place rather than sending him off to find a login page. */
function Failed({ err, onRetry }: { err: string; onRetry: () => void | Promise<void> }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  async function unlock() {
    setBusy(true); setWrong(false);
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
      <div className="box warn" style={{ marginTop: 10 }}>
        <span className="k">That did not save</span>
        <div>{err === 'offline' ? 'The request never reached the server. Nothing changed. Try again.' : `The server refused it (${err}). Nothing changed.`}</div>
      </div>
    );
  }
  return (
    <div className="box warn" style={{ marginTop: 10 }}>
      <span className="k">This device cannot change the list yet</span>
      <div>Reading is open to anyone. Changing your logs is not, because everything else is worked out from them. Unlock once and it stays unlocked for a year.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          type="password" value={pw} autoComplete="current-password" placeholder="Password"
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && pw && !busy) void unlock(); }}
          style={{ flex: '1 1 160px' }}
        />
        <button className="primary" disabled={busy || !pw} onClick={() => void unlock()} style={{ fontSize: 15 }}>
          {busy ? 'Unlocking…' : 'Unlock and save'}
        </button>
      </div>
      {wrong && <p className="changes" style={{ marginTop: 10 }}>Not that one. Nothing was lost, try again.</p>}
      <p className="quiet" style={{ marginTop: 10 }}>
        Or do it on <Link href="/kitchen/login" target="_blank">the login page</Link> and come back.
      </p>
    </div>
  );
}
