import WalledLink from '@/components/WalledLink';
import KitchenNav from '../KitchenNav';
import { shoppingView } from '@/lib/kitchen/shop';
import { shoppingList } from '@/lib/kitchen/list';
import ListClient from './ListClient';
import { dueInText } from '@/lib/format';

export const dynamic = 'force-dynamic';

/* The shopping list, and the anti-shopping list.
 *
 * "Maybe we build a shopping list to sort of add. For example you mentioned no potatoes. That will open
 * up a bunch of recipes so I will be open to buying potatoes BUT I ALSO HAVE SWEET POTATOES THAT HAVE
 * BEEN SITTING THERE FOR A WHILE NOW."
 *
 * Both halves of that, and they pull against each other. A list that only ever adds is how a kitchen
 * fills up with food nobody eats, and he has already lost clearance peppers that way.
 *
 * What he already owns and is not using used to come FIRST, above anything to buy. Changed 2026-08-16:
 * "why in Worth Buying do we have a section that says already there, nothing used? ... So I have to
 * keep scrolling to get to the thing that is supposed to be on the page." The anti-list keeps its
 * place on the page and loses its claim on the top of it.
 */

export default async function Shop() {
  const [d, list] = await Promise.all([shoppingView(), shoppingList()]);

  return (
    <div className="wrap">
      <KitchenNav here="shop" />
      <h1>Shopping</h1>

      {/* THE LIST COMES FIRST because it is the page. Until 2026-08-18 this route opened on an
          analysis of which single purchase would unlock the most dishes, and he went looking for a
          shopping list, could not find one, and was right: there wasn't one. */}
      <ListClient
        open={list.open}
        got={list.got}
        pricedTotal={list.pricedTotal}
        pricedCount={list.pricedCount}
        unpricedCount={list.unpricedCount}
      />

      <hr className="divider" style={{ marginTop: 26 }} />

      <details className="fold">
        <summary>What one purchase would unlock the most dishes ({d.unlocks.length} counted)</summary>
      <p className="lede" style={{ marginBottom: 8 }}>
        {d.cookableNow} of {d.total} dishes need nothing bought.
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
              {u.note && <div className="mealmiss">{u.note}</div>}
              {u.examples.length > 0 && (
                <div className="mealvia">
                  e.g.{' '}
                  {u.examples.map((e, k) => (
                    <span key={k}>
                      {k > 0 && ' · '}
                      {e.source
                        ? <WalledLink href={`/kitchen/want?url=${encodeURIComponent(e.source)}`}>{e.name}</WalledLink>
                        : e.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      </details>
      <hr className="divider" style={{ marginTop: 30 }} />

      {/* FOLDED, 2026-08-16. These two sat ABOVE the buying list, with a paragraph each, on a page
          he opens to answer "what should I buy". His words: "why in Worth Buying do we have a
          section that says already there, nothing used? Don't really care about that. No recipes
          for this either. So I have to keep scrolling to get to the thing that is supposed to be on
          the page."

          The old comment argued they came first on purpose, because a shopping list that only ever
          adds is how a kitchen fills with food nobody eats. That reasoning is still right and it
          does not justify putting them between him and the answer. They keep their place on the
          page, one tap down. */}
      <details className="fold">
        <summary>What is already here and going unused ({d.idle.length + d.unreachable.length})</summary>
      <h2 className="sec">
        Already here, nothing uses it <span className="quiet">{d.idle.length}</span>
      </h2>
      <p className="lede" style={{ marginBottom: 8 }}>
        In the kitchen, and no dish here wants it.
      </p>
      {d.idle.length === 0 ? (
        <p className="lede">Nothing idle. Everything in the kitchen is reachable by something.</p>
      ) : (
        <ul className="plainlist">
          {d.idle.map((i) => (
            <li key={i.id}>
              <WalledLink href={`/kitchen/find?uses=${encodeURIComponent(i.id)}`}>{i.name}</WalledLink>
              <span>
                {i.daysLeft !== null
                  ? dueInText(i.daysLeft)
                  : (i.ageDays !== null ? `in ${i.where}, ${i.ageDays} d` : i.where)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="lede" style={{ marginTop: 8 }}>
        Tap one to see every dish that uses it.
      </p>

      {d.unreachable.length > 0 && (
        <>
          <h2 className="sec">
            No recipe asks for these <span className="quiet">{d.unreachable.length}</span>
          </h2>
          <p className="lede" style={{ marginBottom: 8 }}>
            No recipe anywhere names these. Ours to fix, not yours.
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

      </details>
    </div>
  );
}
