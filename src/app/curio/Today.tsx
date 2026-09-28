'use client';

import { useState } from 'react';
import type { Today as TodayData, SaveCard } from '@/lib/curio/today';
import Remind from './Remind';
import { post, Quiz } from './Quiz';
import { forgetSave, useToday } from './today-cache';

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

export default function Today() {
  const load = useToday();

  if (load.state === 'loading') return <section className="today" aria-busy="true" />;
  /* A stranger sees nothing, as the index card already does: "sign in for today's questions" on a
     public page was an invitation to nobody. */
  if (load.state === 'locked') return null;
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
      {/* Keyed on the cards, so when the fresh copy replaces this device's saved one the card state
          starts over instead of pointing into a list that changed under it. */}
      <Quiz key={data.quiz.map((q) => q.id).join()} cards={data.quiz} />
      <LadderBar l={data.ladder} />
      <Saves key={data.saves.map((q) => q.id).join()} saves={data.saves} kept={data.kept} pile={data.pile} />
      <Remind />
    </section>
  );
}

function Saves({ saves, kept: keptIn, pile: pileIn }: { saves: SaveCard[]; kept: SaveCard[]; pile?: TodayData['pile'] }) {
  const [at, setAt] = useState(0);
  const [kept, setKept] = useState(keptIn);
  /* The pile counts move with every verdict here, so the bar and "Kept, N" cannot disagree. */
  const [pile, setPile] = useState(pileIn);
  const move = (verdict: 'keep' | 'drop', dir: 1 | -1) =>
    setPile((p) => p && ({ ...p, [verdict === 'keep' ? 'kept' : 'dropped']: p[verdict === 'keep' ? 'kept' : 'dropped'] + dir, left: p.left - dir }));
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
    forgetSave(card.id, verdict);
    setLast({ card, verdict });
    move(verdict, 1);
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
    move(last.verdict, -1);
    setAt((i) => i - 1);
    setLast(null);
  };

  return (
    <div className="tblock">
      <h2 className="sec">From your saves</h2>
      {pile && <PileBar p={pile} />}
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

/* Where every question stands: known (spaced 16 days or more), learning, never seen. Shown once
   anything has been graded, because before that it is one grey bar saying "nothing yet". Darker is
   further along, the same rule the music grid uses. */
function LadderBar({ l }: { l: TodayData['ladder'] }) {
  if (!l || l.known + l.learning === 0) return null;
  const pct = (n: number) => `${(n / Math.max(1, l.total)) * 100}%`;
  return (
    <div className="ladder" role="img" aria-label={`${l.known} known, ${l.learning} learning, ${l.fresh} not seen yet`}>
      <div className="lbar">
        <i className="k" style={{ width: pct(l.known) }} />
        <i className="l" style={{ width: pct(l.learning) }} />
      </div>
      <div className="lkey tnum">
        <span><b className="k" />{l.known} known</span>
        <span><b className="l" />{l.learning} learning</span>
        <span><b />{l.fresh} new</span>
      </div>
    </div>
  );
}

/* The pile, sorted so far: kept, dropped, still to go. The same three-part bar as the ladder above,
   so the two read alike. Shown from the first verdict on. */
function PileBar({ p }: { p: TodayData['pile'] }) {
  const total = p.kept + p.dropped + p.left;
  if (!total || p.kept + p.dropped === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="ladder" role="img" aria-label={`${p.kept} kept, ${p.dropped} dropped, ${p.left} to sort`}>
      <div className="lbar">
        <i className="k" style={{ width: pct(p.kept) }} />
        <i className="l" style={{ width: pct(p.dropped) }} />
      </div>
      <div className="lkey tnum">
        <span><b className="k" />{p.kept} kept</span>
        <span><b className="l" />{p.dropped} dropped</span>
        <span><b />{p.left} to sort</span>
      </div>
    </div>
  );
}
