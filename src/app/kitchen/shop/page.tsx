import Link from 'next/link';
import KitchenNav from '../KitchenNav';
import { shoppingView } from '@/lib/kitchen/shop';
import { dueInText } from '@/lib/format';

export const dynamic = 'force-dynamic';

/* The shopping list, and the anti-shopping list.
 *
 * "Maybe we build a shopping list to sort of add. For example you mentioned no potatoes. That will open
 * up a bunch of recipes so I will be open to buying potatoes BUT I ALSO HAVE SWEET POTATOES THAT HAVE
 * BEEN SITTING THERE FOR A WHILE NOW."
 *
 * Both halves of that, and they pull against each other. So what he already owns and is not using comes
 * FIRST, above anything to buy. A list that only ever adds is how a kitchen fills up with food nobody
 * eats, and he has already lost clearance peppers that way.
 */

export default async function Shop() {
  const d = await shoppingView();

  return (
    <div className="wrap">
      <KitchenNav here="shop" />
      <h1>Worth buying, and worth using up</h1>
      <p className="lede">
        {d.cookableNow} of {d.total} dishes need nothing bought at all. What follows is what a single
        purchase would add to that, and what is already in the kitchen that none of it touches.
      </p>


      <h2 className="sec">
        Already here, nothing uses it <span className="quiet">{d.idle.length}</span>
      </h2>
      <p className="quiet" style={{ marginBottom: 8 }}>
        Not one of these appears in any dish that is cookable now or one thing short. This list comes
        before the buying list on purpose: a shopping list that only ever adds is how a kitchen fills
        with food nobody eats.
      </p>
      {d.idle.length === 0 ? (
        <p className="quiet">Nothing idle. Everything in the kitchen is reachable by something.</p>
      ) : (
        <ul className="plainlist">
          {d.idle.map((i) => (
            <li key={i.id}>
              <Link href={`/kitchen/find?uses=${encodeURIComponent(i.id)}`}>{i.name}</Link>
              <span>
                {i.daysLeft !== null
                  ? dueInText(i.daysLeft)
                  : (i.ageDays !== null ? `in ${i.where}, ${i.ageDays} d` : i.where)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="quiet" style={{ marginTop: 8 }}>
        Tapping one shows every dish that uses it, including ones needing a shop.
      </p>

      {d.unreachable.length > 0 && (
        <>
          <h2 className="sec">
            No recipe asks for these <span className="quiet">{d.unreachable.length}</span>
          </h2>
          <p className="quiet" style={{ marginBottom: 8 }}>
            Not one of the {d.total.toLocaleString()} dishes names these, so no amount of cooking will
            move them off this list. Some of that is honest (nothing asks for whey protein) and some is
            us (already-browned beef is not a thing a published ingredient list ever calls for, even
            though it is exactly what saves you a step). Either way it is ours to solve, not a thing
            you are neglecting.
          </p>
          <ul className="plainlist">
            {d.unreachable.map((i) => (
              <li key={i.id}>
                {i.name}
                <span>
                  {i.daysLeft !== null
                    ? dueInText(i.daysLeft)
                    : `${i.where}, ${i.ageDays} d`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr className="divider" style={{ marginTop: 30 }} />

      <h2 className="sec">Buy one thing, unlock this many</h2>
      <p className="quiet" style={{ marginBottom: 8 }}>
        Counted only over dishes that are short of nothing else, so the number means it rather than
        meaning &ldquo;would help with&rdquo;. No prices here: a price comes from a receipt or a live
        lookup, never from a guess.
      </p>

      <ul className="meallist">
        {d.unlocks.map((u) => (
          <li className="mealrow" key={u.item} style={{ gridTemplateColumns: '1fr' }}>
            <div className="mealbody">
              <div className="mealtop">
                <b>{u.item}</b>
                <span className="v ok">{u.count} dishes</span>
              </div>
              {/* Gaps are grouped for scoring, so the group name is often not a thing you can buy.
                  These are the ingredients the recipes actually asked for. */}
              {u.asks.length > 0 && (
                <div className="mealmeta">
                  what they ask for: {u.asks.map((a) => `${a.name}${a.n > 1 ? ` (${a.n})` : ''}`).join(', ')}
                </div>
              )}
              {u.reason && <div className="mealmiss">{u.reason}</div>}
              {u.examples.length > 0 && (
                <div className="mealvia">
                  e.g.{' '}
                  {u.examples.map((e, k) => (
                    <span key={k}>
                      {k > 0 && ' · '}
                      {e.source
                        ? <Link href={`/kitchen/want?url=${encodeURIComponent(e.source)}`}>{e.name}</Link>
                        : e.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
