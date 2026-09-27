'use client';

import { useEffect, useState } from 'react';
import type { QuizCard } from '@/lib/curio/today';
import { Quiz } from './curio/Today';

/* Today's Curio questions, answered on the index without opening /curio. His ask, 2026-09-27: "maybe
 * some stuff on the front page that way I don't have to click so much".
 *
 * Same card, same routes and same rules as /curio. Renders nothing for a visitor (the route is gated,
 * a 401 means "not him") and nothing once today's cards are done, so the index never carries an empty
 * box. Fetched in the browser for the reason Today.tsx gives: the index is cached for an hour and
 * must stay that way. */
export default function HubQuiz() {
  const [cards, setCards] = useState<QuizCard[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/curio/api/today', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.ok) setCards(j.quiz as QuizCard[]); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!cards || cards.length === 0) return null;
  return (
    <section className="hubq" aria-label="Today's questions">
      <div className="hubq-label">Curio</div>
      <Quiz cards={cards} heading={null} />
    </section>
  );
}
