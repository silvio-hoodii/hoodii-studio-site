/* Which Curio cards come up today, and when a card comes back. No database in here, so
 * spacing.test.ts can run it.
 *
 * WHY A QUIZ AND NOT THE EMAIL. From 2026-07-14 Curio was a morning email of two written answers.
 * He stopped opening it, and said why on 2026-09-26: "I don't want to read from an email like it
 * worked the first few times because of the novelty ... maybe a shorter text and more interactive".
 * Reading an answer is the passive half. Trying to recall it before seeing it (retrieval practice)
 * and seeing it again just before it is forgotten (spacing) are the two things that make it stay,
 * which is what Anki does and what this copies, as small as it can be.
 *
 * LEITNER BOXES, NOT SM-2 OR FSRS. Two buttons, a fixed ladder of gaps, and a miss sends the card
 * back to the bottom. Anki's schedulers need four grades and a per-card ease that he would never
 * see or tune. With a few cards a day the difference in retention is noise; the difference in
 * what can go wrong is not.
 *
 * NO STREAKS AND NO BACKLOG COUNT, per CuriosityOS/README.md ("No streaks, no backlog counts,
 * ever"). A missed week costs nothing: overdue cards are capped at REVIEW_CAP a day and the rest
 * wait, rather than arriving as a pile. */

/* Days until a card comes back, by box. A card leaves box N after a "knew it" and goes to N+1. */
export const GAPS = [1, 3, 7, 16, 35, 90, 180] as const;

/* A day's deck. Small on purpose: "a shorter text", something that fits in a rest between sets. */
export const NEW_PER_DAY = 2;
export const REVIEW_CAP = 4;

export interface ReviewState {
  box: number;
  due: string; // YYYY-MM-DD, Calgary day
}

export function addDays(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/* The next state after a grade. `prev` is null for a card seen for the first time. */
export function grade(prev: ReviewState | null, knew: boolean, today: string): ReviewState {
  if (!knew) return { box: 0, due: addDays(today, GAPS[0]) };
  const box = prev ? Math.min(prev.box + 1, GAPS.length - 1) : 1;
  return { box, due: addDays(today, GAPS[box] ?? 180) };
}

export interface Candidate {
  id: string;
  review: ReviewState | null;
  /* The day this card was first graded, for counting today's new cards. */
  firstSeen: string | null;
}

/* Today's deck: reviews that are due, oldest due first, then new cards up to the day's allowance.
 * `pool` must already be in the order new cards should arrive (his own questions first). */
export function deckFor(pool: Candidate[], today: string): string[] {
  const due = pool
    .filter((c) => c.review && c.review.due <= today)
    .sort((a, b) => (a.review!.due < b.review!.due ? -1 : a.review!.due > b.review!.due ? 1 : 0))
    .slice(0, REVIEW_CAP)
    .map((c) => c.id);
  const newToday = pool.filter((c) => c.firstSeen === today).length;
  const fresh = pool
    .filter((c) => !c.review)
    .slice(0, Math.max(0, NEW_PER_DAY - newToday))
    .map((c) => c.id);
  return [...due, ...fresh];
}
