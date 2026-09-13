import type { Metadata } from 'next';
import Link from 'next/link';
import { shopExtras, shopSources, shopTicks } from '@/lib/kitchen/cookbook';
import { buildShopList } from '@/lib/kitchen/shoplist';
import { today } from '@/lib/day';
import ShopClient from './ShopClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Shopping' };

/* ONE SHOPPING LIST, ACROSS EVERY DISH. Shipped 2026-09-12, in his words: "I want one big shopping
 * list that knows everything across every recipe."
 *
 * There was one here before and it was deleted on 2026-09-05 with the fridge model that fed it. This
 * one is fed by the dish rows themselves, which are written by a session and are the only thing in
 * the kitchen that is still being maintained, so it cannot go stale the way its predecessor did:
 * when a dish is added the list grows, and when a session marks something owned the row leaves.
 *
 * Everything is computed. Nothing on this page is a number somebody typed here. */
export default async function ShopPage() {
  const [dishes, ticks, extras] = await Promise.all([shopSources(), shopTicks(), shopExtras()]);
  const list = buildShopList({ dishes, ticks, extras, today: today() });

  return (
    <div className="wrap">
      <p className="eyebrow">
        <Link href="/kitchen">Kitchen</Link>
      </p>
      <h1>Shopping</h1>
      <p className="blurb">
        Everything the dishes need, in one list, each thing once however many recipes want it. Tick
        it off as you go.
      </p>
      <ShopClient list={list} />
    </div>
  );
}
