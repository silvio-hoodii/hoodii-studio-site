'use client';

import { useState } from 'react';
import type { QuizCard } from '@/lib/curio/today';
import { forgetCard } from './today-cache';

/* The quiz on its own, since 2026-09-27: the index card (src/app/HubQuiz.tsx) mounts this and
 * nothing else, so it no longer pulls the saves, the reminder switch and the push key into the
 * front page's JavaScript. Recall first, THEN the answer. A card that shows the answer straight
 * away is the email again, which is the thing he stopped opening. */

export async function post(path: string, body: unknown): Promise<boolean> {
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

export function Quiz({ cards, heading = 'Today' }: { cards: QuizCard[]; heading?: string | null }) {
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
    forgetCard(card.id);
    setShown(false);
    setAt((i) => i + 1);
  };

  return (
    <div className="tblock">
      {heading && <h2 className="sec">{heading}</h2>}
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

