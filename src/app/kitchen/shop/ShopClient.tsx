'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, type WriteResult } from '../write';
import Unlock from '../Unlock';
import { TICK_DAYS, totalLine, type ShopList, type ShopRow } from '@/lib/kitchen/shoplist';

/* The taps: narrow the list to the dishes he is shopping for, tick a row off, put it back, add
 * something no recipe knows about.
 *
 * OPTIMISTIC, and deliberately so, carried over from the page this replaces. A grocery aisle has bad
 * signal and a row that waits for a round trip before it moves reads as broken. The row greys the
 * instant it is tapped, and a write that fails comes back with the reason attached and the password
 * field in place rather than reverting in silence.
 *
 * THE FILTER IS COMPONENT STATE AND NOT A QUERY STRING, on purpose. Firewall rule 3 exists because
 * `/kitchen/find` and `/reading/shelf` both exposed their filter state as crawlable hrefs, which is
 * a combinatorial URL space something will walk: 178,000 invocations in twelve hours on the second
 * one. A page that renders on every request must not grow one of those again. */

const MINE = 'mine';

export default function ShopClient({ list }: { list: ShopList }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Record<string, true>>({});
  const [err, setErr] = useState<{ key: string; res: WriteResult } | null>(null);
  const [adding, setAdding] = useState('');

  const hasMine = [...list.buy, ...list.optional, ...list.got].some((r) => r.mine);

  /* What the folded filter says about itself. Naming the dishes rather than counting them, because
     "2 dishes" does not tell him whether the pizza is in this trip. */
  const picked = [
    ...list.dishes.filter((d) => sel.has(d.id)).map((d) => d.name),
    ...(sel.has(MINE) ? ['yours'] : []),
  ];
  const filterLabel = picked.length === 0 ? 'everything' : picked.join(', ');

  function matches(r: ShopRow): boolean {
    if (sel.size === 0) return true;
    if (r.mine) return sel.has(MINE);
    return r.dishes.some((d) => sel.has(d.id));
  }

  function toggleChip(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send(key: string, body: Record<string, unknown>) {
    setPending((p) => ({ ...p, [key]: true }));
    setErr(null);
    const res = await postJson('/kitchen/api/shop', body);
    setPending((p) => {
      const q = { ...p };
      delete q[key];
      return q;
    });
    if (res === 'ok') {
      router.refresh();
      return;
    }
    setErr({ key, res });
  }

  const tick = (r: ShopRow) => send(r.key, { op: 'tick', key: r.key, label: r.label });
  const untick = (r: ShopRow) => send(r.key, { op: 'untick', key: r.key });
  const remove = (r: ShopRow) => send(r.key, { op: 'remove', id: r.key.replace(/^extra:/, '') });

  async function add() {
    const t = adding.trim();
    if (!t) return;
    await send('add', { op: 'add', text: t });
    setAdding('');
  }

  const buy = list.buy.filter(matches);
  const optional = list.optional.filter(matches);
  const got = list.got.filter(matches);
  const owned = list.owned.filter(matches);
  const unsorted = list.unsorted.filter(matches);

  function Row({ r, done }: { r: ShopRow; done: boolean }) {
    return (
      <li className={pending[r.key] ? 'shoprow is-busy' : 'shoprow'}>
        <button
          type="button"
          className="tick"
          aria-pressed={done}
          aria-label={done ? `Put ${r.label} back on the list` : `Got ${r.label}`}
          onClick={() => void (done ? untick(r) : tick(r))}
        >
          <span aria-hidden="true">{done ? 'x' : ''}</span>
        </button>
        <div className="sbody">
          <div className="stop">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.label}
              </a>
            ) : (
              <span>{r.label}</span>
            )}
            {r.priceText && <span className="sprice tnum">{r.priceText}</span>}
          </div>
          <div className="smeta">
            {r.mine ? 'Yours' : r.dishes.map((d) => d.name).join(', ')}
            {r.qtys.length > 0 && ` · ${r.qtys.join(' + ')}`}
          </div>
          {r.gotDay && !done && (
            <div className="smeta">
              bought {r.gotAgeDays === 0 ? 'today' : `${r.gotAgeDays} days ago`}, so it is back on the
              list
            </div>
          )}
          {done && <div className="smeta">bought {r.gotDay}</div>}
          {r.conflict && (
            <div className="swarn">
              The dishes disagree about this one. It is here because at least one still wants it.
            </div>
          )}
          {r.notes.length > 0 && (
            <details className="sfold">
              <summary>Note</summary>
              {r.notes.map((n, i) => (
                <p key={i}>
                  {r.dishes.length > 1 && <span className="sfor">{n.dish}: </span>}
                  {n.text}
                </p>
              ))}
            </details>
          )}
          {r.mine && (
            <button type="button" className="sdrop" onClick={() => void remove(r)}>
              Remove
            </button>
          )}
          {err?.key === r.key && <Unlock err={err.res} onRetry={() => (done ? untick(r) : tick(r))} />}
        </div>
      </li>
    );
  }

  return (
    <>
      {list.unsorted.length > 0 && (
        <p className="snotice" role="status">
          {list.unsorted.length} item{list.unsorted.length === 1 ? ' has' : 's have'} not been sorted
          into buy, optional or already have. {list.unsorted.length === 1 ? 'It is' : 'They are'} at
          the bottom, off the list, until a session says which.
        </p>
      )}

      {/* THE FILTER IS FOLDED, AND THAT IS A MEASUREMENT RATHER THAN A PREFERENCE. Shot at 390px, the
          open chip row was seven lines and 250px, because a chip carries a whole dish name and
          "California Roll (uramaki sushi)" is thirty characters. The list started below the fold on
          the screen he opens in a shop. The summary states the current filter, so the control still
          says what it is doing while closed. */}
      {(list.dishes.length > 1 || hasMine) && (
        <details className="sfold sfilter">
          <summary>Shopping for: {filterLabel}</summary>
          <div className="chips" role="group" aria-label="Shopping for">
            <button
              type="button"
              className="chip"
              aria-pressed={sel.size === 0}
              onClick={() => setSel(new Set())}
            >
              Everything
            </button>
            {list.dishes.map((d) => (
              <button
                key={d.id}
                type="button"
                className="chip"
                aria-pressed={sel.has(d.id)}
                onClick={() => toggleChip(d.id)}
              >
                {d.name}
                <span className="tnum">{d.count}</span>
              </button>
            ))}
            {hasMine && (
              <button
                type="button"
                className="chip"
                aria-pressed={sel.has(MINE)}
                onClick={() => toggleChip(MINE)}
              >
                Yours
              </button>
            )}
          </div>
        </details>
      )}

      <form
        className="sadd"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Anything else: dish soap, milk, beer"
          aria-label="Add something to the list"
          autoComplete="off"
          enterKeyHint="done"
        />
        <button type="submit" className="send" disabled={!adding.trim() || !!pending.add}>
          Add
        </button>
      </form>
      {err?.key === 'add' && <Unlock err={err.res} onRetry={add} />}

      <h2 className="sec">Buy</h2>
      <p className="lede">{totalLine(buy)}</p>
      {buy.length === 0 ? (
        <p className="empty">
          {sel.size === 0 ? 'Nothing to buy.' : 'Nothing to buy for what you picked.'}
        </p>
      ) : (
        <ul className="shoplist">
          {buy.map((r) => (
            <Row key={r.key} r={r} done={false} />
          ))}
        </ul>
      )}

      {optional.length > 0 && (
        <>
          <h2 className="sec">Optional</h2>
          <p className="lede">{totalLine(optional)}</p>
          <ul className="shoplist">
            {optional.map((r) => (
              <Row key={r.key} r={r} done={false} />
            ))}
          </ul>
        </>
      )}

      {got.length > 0 && (
        <details className="sfold sfold-sec">
          <summary>
            Got it <span className="quiet tnum">{got.length}</span>
          </summary>
          <p className="lede">
            Ticked off in the last {TICK_DAYS} days. After that a row comes back onto the list with
            the date on it, because a tick says you bought it, not that you still have it.
          </p>
          <ul className="shoplist">
            {got.map((r) => (
              <Row key={r.key} r={r} done={true} />
            ))}
          </ul>
        </details>
      )}

      {owned.length > 0 && (
        <details className="sfold sfold-sec">
          <summary>
            Already have <span className="quiet tnum">{owned.length}</span>
          </summary>
          <p className="lede">
            Confirmed in the kitchen, so it is off the list. Only a session changes this.
          </p>
          <ul className="shoplist">
            {owned.map((r) => (
              <li className="shoprow shoprow-flat" key={r.key}>
                <div className="sbody">
                  <div className="stop">
                    <span>{r.label}</span>
                  </div>
                  <div className="smeta">{r.dishes.map((d) => d.name).join(', ')}</div>
                  {r.notes.length > 0 && (
                    <details className="sfold">
                      <summary>Why</summary>
                      {r.notes.map((n, i) => (
                        <p key={i}>{n.text}</p>
                      ))}
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {unsorted.length > 0 && (
        <details className="sfold sfold-sec">
          <summary>
            Not sorted yet <span className="quiet tnum">{unsorted.length}</span>
          </summary>
          <p className="lede">
            These carry no buy, optional or already-have value, so they are not guessed at in either
            direction. Ask a session to sort them.
          </p>
          <ul className="shoplist">
            {unsorted.map((r) => (
              <li className="shoprow shoprow-flat" key={r.key}>
                <div className="sbody">
                  <div className="stop">
                    <span>{r.label}</span>
                  </div>
                  <div className="smeta">{r.dishes.map((d) => d.name).join(', ')}</div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
