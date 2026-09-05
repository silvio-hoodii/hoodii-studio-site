import Link from 'next/link';
import { listDishes, lastCooked, openInbox } from '@/lib/kitchen/cookbook';
import AskBox from './AskBox';

export const dynamic = 'force-dynamic';

/* The cookbook. Rebuilt 2026-09-05.
 *
 * What was here before scored a 2,835-recipe corpus against a fridge model and printed how many
 * dishes he could cook right now. The fridge model died on 2026-08-23, the day he stopped
 * photographing receipts, and the number kept printing. His words, deciding this rebuild: "the scope
 * was wrong, we were trying for it to do a lot that was not the right thing to do."
 *
 * What is here now is what he asked for, five times, in his own words: "I want to make this. What
 * do I need?" A box to say so from anywhere, and the dishes he has already decided on, each with the
 * publisher's recipe, its shopping list and his notes. */
export default async function KitchenPage() {
  const [dishes, cooked, inbox] = await Promise.all([listDishes(), lastCooked(), openInbox()]);

  return (
    <div className="wrap">
      <h1>Kitchen</h1>
      <p className="blurb">
        The dishes I have decided to cook. Each one opens the recipe where it was published, with the
        shopping list built for it and what I found when I made it.
      </p>

      <AskBox />

      {inbox.length > 0 && (
        <ul className="waiting" aria-label="Waiting for a session">
          {inbox.map((r) => (
            <li key={r.id}>
              <span className="when tnum">{r.at}</span>
              <span className="txt">{r.text}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="sec">Dishes</h2>
      {dishes.length === 0 ? (
        <p className="empty">Nothing yet. Say what you want to make in the box above.</p>
      ) : (
        <ul className="dishes">
          {dishes.map((d) => {
            const last = cooked[d.name];
            return (
              <li key={d.id}>
                <Link href={`/kitchen/${d.id}`}>
                  <span className="dname">{d.name}</span>
                  {d.proteinG != null && (
                    <span className="dprot tnum">{Math.round(d.proteinG)} g protein</span>
                  )}
                  <span className="dmeta">
                    {d.publisher ?? new URL(d.sourceUrl).hostname.replace(/^www\./, '')}
                    {' · '}
                    <span className="nw">{last ? `last cooked ${last}` : 'not cooked yet'}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
