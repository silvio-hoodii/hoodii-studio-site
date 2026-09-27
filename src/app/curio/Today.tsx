'use client';

import { useEffect, useState } from 'react';
import type { Today as TodayData, QuizCard, SaveCard } from '@/lib/curio/today';
import Remind from './Remind';

/* The top of /curio: a few questions to recall, then one saved link to keep or drop.
 *
 * Fetched in the browser rather than rendered on the server, for two reasons. The saves are
 * private (src/proxy.ts gates /curio/api for reads), so a server render would need the cookie,
 * and reading the cookie makes the whole page dynamic: a Neon wake on every visit by anyone,
 * which on this site is the bill. This way the page stays cached and only his own visits touch
 * the database.
 *
 * Recall first, THEN the answer. A card that shows the answer straight away is the email again,
 * which is the thing he stopped opening. */

type Load =
  | { state: 'loading' }
  | { state: 'locked' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: TodayData };

async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export default function Today() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    let live = true;
    fetch('/curio/api/today', { cache: 'no-store' })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 401) return setLoad({ state: 'locked' });
        const j = await r.json();
        if (!r.ok || !j.ok) return setLoad({ state: 'error', message: String(j.error ?? r.status) });
        setLoad({ state: 'ready', data: j });
      })
      .catch((e) => live && setLoad({ state: 'error', message: String(e) }));
    return () => {
      live = false;
    };
  }, []);

  if (load.state === 'loading') return <section className="today" aria-busy="true" />;
  if (load.state === 'locked') {
    return (
      <section className="today">
        <p className="empty">
          <a href="/login?to=/curio">Sign in</a>{' '}for today&apos;s questions.
        </p>
      </section>
    );
  }
  if (load.state === 'error') {
    return (
      <section className="today">
        <p className="empty">Today&apos;s cards did not load: {load.message}</p>
      </section>
    );
  }
  return <Cards data={load.data} />;
}

function Cards({ data }: { data: TodayData }) {
  return (
    <section className="today">
      <Quiz cards={data.quiz} />
      <Saves saves={data.saves} kept={data.kept} />
      <Remind />
    </section>
  );
}

function Quiz({ cards }: { cards: QuizCard[] }) {
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const card = cards[at];

  const answer = async (knew: boolean) => {
    if (!card || busy) return;
    setBusy(true);
    const ok = await post('/curio/api/grade', { id: card.id, knew });
    setBusy(false);
    /* Only advance on a stored grade. Moving on after a failed write would show the card as done
       here while it stays due in the database, and it would come back tomorrow with no trace. */
    if (!ok) return setFailed(true);
    setFailed(false);
    setShown(false);
    setAt((i) => i + 1);
  };

  return (
    <div className="tblock">
      <h2 className="sec">Today</h2>
      {!card ? (
        <p className="done">Done for today.</p>
      ) : (
        <div className="qcard">
          <div className="qmeta tnum">
            {at + 1} of {cards.length}
            {card.isNew && <span className="qnew">new</span>}
          </div>
          <p className="qq">{card.question}</p>
          {!shown ? (
            <div className="acts">
              <button type="button" className="primary" onClick={() => setShown(true)}>
                Show answer
              </button>
            </div>
          ) : (
            <>
              <p className="qa">
                {card.answer}{' '}
                {card.sourceUrl && (
                  <a href={card.sourceUrl} target="_blank" rel="noreferrer">source</a>
                )}
                {card.unchecked && <span className="unverified">not checked yet</span>}
              </p>
              <div className="acts">
                <button type="button" disabled={busy} onClick={() => answer(false)}>
                  Didn&apos;t know
                </button>
                <button type="button" className="primary" disabled={busy} onClick={() => answer(true)}>
                  Knew it
                </button>
              </div>
            </>
          )}
          {failed && <p className="err">Not saved. Try again.</p>}
        </div>
      )}
    </div>
  );
}

function Saves({ saves, kept: keptIn }: { saves: SaveCard[]; kept: SaveCard[] }) {
  const [at, setAt] = useState(0);
  const [kept, setKept] = useState(keptIn);
  const [last, setLast] = useState<{ card: SaveCard; verdict: 'keep' | 'drop' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const card = saves[at];

  const judge = async (verdict: 'keep' | 'drop') => {
    if (!card || busy) return;
    setBusy(true);
    const ok = await post('/curio/api/save', { id: card.id, verdict });
    setBusy(false);
    if (!ok) return setFailed(true);
    setFailed(false);
    setLast({ card, verdict });
    if (verdict === 'keep') setKept((k) => [card, ...k]);
    setAt((i) => i + 1);
  };

  const undo = async () => {
    if (!last || busy) return;
    setBusy(true);
    const ok = await post('/curio/api/save', { id: last.card.id, verdict: null });
    setBusy(false);
    if (!ok) return setFailed(true);
    setFailed(false);
    if (last.verdict === 'keep') setKept((k) => k.filter((c) => c.id !== last.card.id));
    setAt((i) => i - 1);
    setLast(null);
  };

  return (
    <div className="tblock">
      <h2 className="sec">From your saves</h2>
      {!card ? (
        <p className="done">Done for now.</p>
      ) : (
        <div className="scard">
          <div className="qmeta">{card.category.replace(/-/g, ' ')}</div>
          <p className="stitle">
            {card.url ? (
              <a href={card.url} target="_blank" rel="noreferrer">{card.title}</a>
            ) : (
              card.title
            )}
          </p>
          {card.line && <p className="sline">{card.line}</p>}
          <div className="acts">
            <button type="button" disabled={busy} onClick={() => judge('drop')}>Drop</button>
            <button type="button" className="primary" disabled={busy} onClick={() => judge('keep')}>Keep</button>
          </div>
          {failed && <p className="err">Not saved. Try again.</p>}
        </div>
      )}
      {last && (
        <button type="button" className="undo" disabled={busy} onClick={undo}>
          Undo {last.verdict}
        </button>
      )}
      {kept.length > 0 && (
        <details className="more">
          <summary>Kept, {kept.length}</summary>
          <ul className="kept">
            {kept.map((k) => (
              <li key={k.id}>
                {k.url ? <a href={k.url} target="_blank" rel="noreferrer">{k.title}</a> : k.title}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
