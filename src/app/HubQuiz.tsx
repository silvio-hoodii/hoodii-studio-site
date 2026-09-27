'use client';

import type { QuizCard } from '@/lib/curio/today';
import { Quiz } from './curio/Quiz';
import { useToday } from './curio/today-cache';

/* Today's Curio questions, answered on the index without opening /curio. His ask, 2026-09-27: "maybe
 * some stuff on the front page that way I don't have to click so much".
 *
 * Same card, same routes and same rules as /curio. Renders nothing for a visitor (the route is gated,
 * a 401 means "not him") and nothing once today's cards are done, so the index never carries an empty
 * box. Fetched in the browser for the reason Today.tsx gives: the index is cached for an hour and
 * must stay that way. The device's last copy paints first; see today-cache.ts. */
export default function HubQuiz() {
  const load = useToday();
  if (load.state !== 'ready' || load.data.quiz.length === 0) return null;
  const cards: QuizCard[] = load.data.quiz;
  return (
    <section className="hubq" aria-label="Today's questions">
      <div className="hubq-label">Curio</div>
      <Quiz key={cards.map((c) => c.id).join()} cards={cards} heading={null} />
    </section>
  );
}
