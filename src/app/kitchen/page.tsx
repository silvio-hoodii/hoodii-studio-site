import Link from 'next/link';
import { cookMarks, hostOf, listDishes } from '@/lib/kitchen/cookbook';
import { shortDate } from '@/lib/format';

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
 * publisher's recipe, its shopping list and his notes.
 *
 * 2026-09-27: THE ASK BOX AND THE ONE SHOPPING LIST ARE GONE, on the usage audit. Neither had been used
 * once: 0 rows in `inbox` from the box, 0 ticks and 0 extras on /kitchen/shop. He asks for dishes in
 * chat, and in his words "it's usually an agent that helps me out". The kitchen also left the front
 * page the same day; dish pages stay because sessions send him their links. */
export default async function KitchenPage() {
  const [dishes, marks] = await Promise.all([listDishes(), cookMarks()]);

  return (
    <div className="wrap">
      <h1>Kitchen</h1>

      <h2 className="sec">Dishes</h2>
      {dishes.length === 0 ? (
        <p className="empty">Nothing yet.</p>
      ) : (
        <ul className="dishes">
          {dishes.map((d) => {
            const m = marks[d.name];
            const last = m?.last;
            return (
              <li key={d.id}>
                <Link href={`/kitchen/${d.id}`}>
                  <span className="dname">{d.name}</span>
                  {d.proteinG != null && (
                    <span className="dprot tnum">{Math.round(d.proteinG)} g protein</span>
                  )}
                  {/* One mark per rated cook, oldest first: filled nailed it, grey fine, hollow went
                      wrong. How often and how well, at a glance, without opening the dish. */}
                  {m && (
                    <span className="cooks" aria-label={`cooked ${m.ratings.length === 1 ? 'once' : `${m.ratings.length} times`}: ${m.ratings.join(', ')}`}>
                      {m.ratings.map((r, i) => <i key={i} className={r} />)}
                    </span>
                  )}
                  <span className="dmeta">
                    {d.publisher ?? hostOf(d.sourceUrl)}
                    {' · '}
                    <span className="nw">{last ? `last cooked ${last.length === 10 ? shortDate(last) : last}` : 'not cooked yet'}</span>
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
