/* REGRESSION SUITE FOR THE ONE SHOPPING LIST.
 *
 *   node --experimental-strip-types src/lib/kitchen/shoplist.test.ts
 *
 * WHAT THIS IS GUARDING. The list is a union of seven dishes with heavy overlap, and every way of
 * getting it wrong is invisible on the page: a merge that should have happened leaves two rows for
 * one bag of cheese, a merge that should not have happened leaves one row for two products, and a
 * misclassified row either sends him to the shop for something in his cupboard or leaves a blocking
 * ingredient off the trip. None of those look like a bug. They look like a shopping list.
 *
 * THE CASES THAT MATTER MOST ARE THE ONES THAT ASSERT THE FIELD BEATS THE PROSE. Before 2026-09-12,
 * whether a row was something to buy was written in English inside the note: "ESSENTIAL",
 * "DO NOT BUY", price "ALREADY OWNED". The obvious way to build this page was to grep for those
 * strings, and it would have passed every eyeball check on today's data. Two cases below give a row
 * a note that says the OPPOSITE of its `need` field, in both directions, so an implementation that
 * reads the prose fails here rather than in a store.
 *
 * The fixtures are shaped from the live rows: the mozzarella pair really does sit on one dish under
 * two names with one URL, and the eggs really are on three dishes.
 */
import {
  buildShopList,
  daysBetween,
  keyOf,
  parsePrice,
  totalLine,
  TICK_DAYS,
  type DishSource,
  type ShopList,
  type ShopRow,
} from './shoplist.ts';

let failed = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    console.log(`ok    ${name}`);
    return;
  }
  failed++;
  console.log(`FAIL  ${name}\n        expected ${w}\n        got      ${g}`);
}

const labels = (rows: ShopRow[]) => rows.map((r) => r.label);
const find = (list: ShopList, label: string): ShopRow | undefined =>
  [...list.buy, ...list.optional, ...list.owned, ...list.got, ...list.unsorted].find((r) => r.label === label);

const MOZZ = 'https://www.walmart.ca/mozzarella';
const PB = 'https://www.walmart.ca/peanutbutter';
const EGGS = 'https://www.walmart.ca/eggs';

const build = (dishes: DishSource[], opts: Partial<Parameters<typeof buildShopList>[0]> = {}) =>
  buildShopList({ dishes, extras: [], ticks: [], today: '2026-09-12', ...opts });

/* ---- the merge, in the three shapes the live data actually has --------------------------------- */

const pbTwoDishes: DishSource[] = [
  { id: 'oatballs', name: 'Oat Balls', list: [{ item: 'Peanut butter, smooth, 1 kg jar', url: PB, price: '$5.97', need: 'buy', qty: '1 jar' }] },
  { id: 'nutbars', name: 'Nut Bars', list: [{ item: 'Peanut butter, smooth, 1 kg jar', url: PB, price: '$5.97', need: 'buy', qty: '1 jar' }] },
];
eq('the same product on two dishes is one row', labels(build(pbTwoDishes).buy), ['Peanut butter, smooth, 1 kg jar']);
eq('and the row names both dishes', build(pbTwoDishes).buy[0]?.dishes.map((d) => d.name), ['Oat Balls', 'Nut Bars']);
eq('and it is counted once, not twice', build(pbTwoDishes).buy.length, 1);

/* THE MOZZARELLA. Two rows, ONE dish, one URL, two names, because a later session worked out that
 * four pizzas need a second bag. This is the case that kills name matching. */
const mozzOneDish: DishSource[] = [
  {
    id: 'pizza',
    name: 'Pizza',
    list: [
      { item: 'Shredded mozzarella (Great Value Pizza Mozzarella)', url: MOZZ, price: '$4.98', need: 'buy', qty: '1 bag' },
      { item: 'More mozzarella', url: MOZZ, price: '$4.98 to $7.98', need: 'buy', qty: '1 more pack' },
    ],
  },
];
eq('two rows on ONE dish sharing a URL collapse to one', build(mozzOneDish).buy.length, 1);
eq('the merged row keeps the name that identifies the product', build(mozzOneDish).buy[0]?.label, 'Shredded mozzarella (Great Value Pizza Mozzarella)');
eq('and keeps both quantities', build(mozzOneDish).buy[0]?.qtys, ['1 bag', '1 more pack']);
eq('and both notes are kept when they differ', build(mozzOneDish).buy[0]?.notes.length, 0);
eq('a range anywhere makes the merged row a range', build(mozzOneDish).buy[0]?.priceIsRange, true);
eq('and the figure is the low end, never the high one', build(mozzOneDish).buy[0]?.priceLow, 4.98);

/* No URL: the fall-back is the exact text, normalised for case and whitespace and nothing else. */
const noUrl: DishSource[] = [
  { id: 'a', name: 'A', list: [{ item: 'Salted butter', need: 'buy' }, { item: '  salted   BUTTER ', need: 'buy' }] },
  { id: 'b', name: 'B', list: [{ item: 'Unsalted butter', need: 'buy' }] },
];
eq('case and spacing do not make two rows', build(noUrl).buy.length, 2);
eq('but salted and unsalted stay two products', labels(build(noUrl).buy), ['Salted butter', 'Unsalted butter']);
eq('keyOf prefers the URL over the name', keyOf({ item: 'x', url: 'u' }), 'url:u');
eq('keyOf falls back to the normalised name', keyOf({ item: '  Two   Words ' }), 'name:two words');

/* ---- the field beats the prose, in both directions. THE REASON THIS FILE EXISTS ----------------- */

const proseLies: DishSource[] = [
  {
    id: 'x',
    name: 'X',
    list: [
      /* Reads like the retired convention for "he already has it" and is classified as a buy. */
      { item: 'Trap one', need: 'buy', price: 'ALREADY OWNED', note: 'DO NOT BUY. Confirmed by photo.' },
      /* Reads like the retired convention for "get this" and is classified as owned. */
      { item: 'Trap two', need: 'owned', price: '$7.97', note: 'ESSENTIAL AND BLOCKING. STILL NEEDED.' },
    ],
  },
];
eq('a note saying DO NOT BUY does not move a buy row', labels(build(proseLies).buy), ['Trap one']);
eq('a note saying ESSENTIAL does not move an owned row', labels(build(proseLies).owned), ['Trap two']);

/* ---- an unclassified row is never guessed at, in either direction ------------------------------ */

const unsorted: DishSource[] = [
  { id: 'x', name: 'X', list: [{ item: 'No field at all' }, { item: 'Nonsense field', need: 'maybe' }, { item: 'Empty field', need: '' }] },
];
eq('three unclassified rows land in unsorted', labels(build(unsorted).unsorted), ['Empty field', 'No field at all', 'Nonsense field']);
eq('and none of them silently become a buy', build(unsorted).buy.length, 0);
eq('and none of them silently become owned', build(unsorted).owned.length, 0);

/* ---- disagreement between dishes is shown, not resolved out of sight --------------------------- */

const disagree: DishSource[] = [
  { id: 'a', name: 'A', list: [{ item: 'Eggs', url: EGGS, need: 'owned' }] },
  { id: 'b', name: 'B', list: [{ item: 'Eggs', url: EGGS, need: 'buy' }] },
];
eq('if any dish still needs it, it is on the buy list', labels(build(disagree).buy), ['Eggs']);
eq('and the row says the dishes disagree', build(disagree).buy[0]?.conflict, true);
eq('agreement does not raise the flag', build(pbTwoDishes).buy[0]?.conflict, false);

/* ---- the tick, and the fortnight it lasts ------------------------------------------------------ */

const one: DishSource[] = [{ id: 'a', name: 'A', list: [{ item: 'Sushi rice', url: 'u1', price: '$7.97', need: 'buy' }] }];
const tickAt = (day: string) => build(one, { ticks: [{ key: 'url:u1', at: day }] });

eq('ticked today, it leaves the buy list', tickAt('2026-09-12').buy.length, 0);
eq('and it is in the got list', labels(tickAt('2026-09-12').got), ['Sushi rice']);
/* THE TWO SIDES OF THE BOUNDARY. Written after checking that a single case here passes with the
 * comparison in either direction, which would make the expiry untested. */
eq(`ticked ${TICK_DAYS - 1} days ago it is still suppressed`, labels(tickAt('2026-08-30').got), ['Sushi rice']);
eq(`ticked exactly ${TICK_DAYS} days ago it comes back`, labels(tickAt('2026-08-29').buy), ['Sushi rice']);
eq('and it comes back carrying the day it was bought', tickAt('2026-08-29').buy[0]?.gotDay, '2026-08-29');
eq('with the age, so the page can say how long ago', tickAt('2026-08-29').buy[0]?.gotAgeDays, 14);
eq('a row never ticked has no date on it', build(one).buy[0]?.gotDay, null);

eq(
  'the newest tick wins, so re-ticking restarts the fortnight',
  labels(build(one, { ticks: [{ key: 'url:u1', at: '2026-08-01' }, { key: 'url:u1', at: '2026-09-11' }] }).got),
  ['Sushi rice'],
);
eq(
  'a tick for something no longer on any dish is ignored',
  build(one, { ticks: [{ key: 'url:gone', at: '2026-09-12' }] }).buy.length,
  1,
);

/* An owned row is already off the shopping part of the page. A tick must not also file it under
 * "got it", which would show the same thing in two collapsed sections. */
const ownedTicked = build([{ id: 'a', name: 'A', list: [{ item: 'Nori', need: 'owned' }] }], {
  ticks: [{ key: 'name:nori', at: '2026-09-12' }],
});
eq('a tick on an owned row leaves it owned', labels(ownedTicked.owned), ['Nori']);
eq('and does not also put it in got', ownedTicked.got.length, 0);

/* ---- items he typed himself -------------------------------------------------------------------- */

const withExtra = build(one, { extras: [{ id: '7', text: 'Dish soap', at: '2026-09-12' }] });
eq('an item he typed is on the buy list', labels(withExtra.buy), ['Dish soap', 'Sushi rice']);
eq('and is marked as his, not a dish requirement', find(withExtra, 'Dish soap')?.mine, true);
eq('and belongs to no dish', find(withExtra, 'Dish soap')?.dishes, []);
eq(
  'and can be ticked off like anything else',
  labels(build(one, { extras: [{ id: '7', text: 'Dish soap', at: '2026-09-12' }], ticks: [{ key: 'extra:7', at: '2026-09-12' }] }).got),
  ['Dish soap'],
);

/* ---- the filter chips -------------------------------------------------------------------------- */

const chips = build([
  { id: 'pizza', name: 'Pizza', list: [{ item: 'Pepperoni', need: 'buy' }, { item: 'Basil', need: 'optional' }] },
  { id: 'sushi', name: 'Sushi', list: [{ item: 'Nori', need: 'owned' }] },
]);
eq('a dish with something to shop for gets a chip', chips.dishes.map((d) => `${d.name}:${d.count}`), ['Pizza:2']);
eq('a dish whose every row is owned gets no chip, because the chip would empty the page', chips.dishes.length, 1);

/* ---- prices, exactly as sessions write them ---------------------------------------------------- */

eq('a plain price', parsePrice('$5.97'), { low: 5.97, range: false });
eq('a range takes the low end and says so', parsePrice('$4.98 to $7.98'), { low: 4.98, range: true });
eq('a unit price is a price', parsePrice('$1.44 each'), { low: 1.44, range: false });
eq('a price with a space after the sign', parsePrice('$ 12'), { low: 12, range: false });
eq('"already have" is not a number', parsePrice('already have'), { low: null, range: false });
eq('"ALREADY OWNED" is not a number', parsePrice('ALREADY OWNED'), { low: null, range: false });
eq('an empty price', parsePrice(''), { low: null, range: false });
eq('a missing price', parsePrice(undefined), { low: null, range: false });
/* A note that happens to mention a second price must not turn the row into a range. Only the price
 * field is parsed, and this case pins that the field is what reaches `parsePrice`. */
eq('three figures still take the smallest', parsePrice('$7.98, or $4.98, or $3.27'), { low: 3.27, range: true });

/* ---- the total line, including every clause being empty ---------------------------------------- */

const row = (label: string, price: string | null): ShopRow => ({
  key: label, label, url: null, need: 'buy', conflict: false, qtys: [],
  priceText: price, priceLow: parsePrice(price).low, priceIsRange: parsePrice(price).range,
  notes: [], dishes: [], mine: false, gotDay: null, gotAgeDays: null,
});

eq('nothing at all', totalLine([]), 'Nothing here.');
eq('one priced item is singular', totalLine([row('a', '$5.00')]), '1 item, $5.00 for the 1 with a price.');
eq('two priced items add up', totalLine([row('a', '$5.00'), row('b', '$2.50')]), '2 items, $7.50 for the 2 with a price.');
eq('an unpriced item is counted, not guessed at', totalLine([row('a', '$5.00'), row('b', null)]), '2 items, $5.00 for the 1 with a price, 1 with no price.');
eq('nothing priced at all', totalLine([row('a', null), row('b', null)]), '2 items, 2 with no price.');
/* THE PUNCTUATION CASE. The page this replaces printed "15 to buy. , 15 with no price yet" when the
 * middle clause was empty, because the separators were typed between the conditionals. */
eq('a range makes the total a floor', totalLine([row('a', '$4.98 to $7.98')]), '1 item, from $4.98 for the 1 with a price.');

/* ---- day arithmetic ---------------------------------------------------------------------------- */

eq('same day', daysBetween('2026-09-12', '2026-09-12'), 0);
eq('across a month end', daysBetween('2026-08-29', '2026-09-12'), 14);
eq('across a year end', daysBetween('2025-12-30', '2026-01-02'), 3);
eq('across 29 February', daysBetween('2028-02-28', '2028-03-01'), 2);
/* Calgary changes clock on 2026-11-01. These are UTC midnights, so the hour never enters it, and a
 * tick taken the day before the change must not read as 13 or 15 days. */
eq('across the autumn clock change', daysBetween('2026-10-25', '2026-11-08'), 14);
eq('backwards is negative, and never suppresses a row', daysBetween('2026-09-12', '2026-09-10'), -2);
eq('a tick dated in the future does not suppress', build(one, { ticks: [{ key: 'url:u1', at: '2026-09-20' }] }).buy.length, 1);

/* ---- ordering ----------------------------------------------------------------------------------- */

const sorted = build([{ id: 'a', name: 'A', list: [{ item: 'Zucchini', need: 'buy' }, { item: 'Avocado', need: 'buy' }, { item: 'Milk', need: 'buy' }] }]);
eq('the buy list is alphabetical, so a row keeps its place between visits', labels(sorted.buy), ['Avocado', 'Milk', 'Zucchini']);

console.log('-'.repeat(70));
console.log(failed ? `${failed} FAILED` : 'all shopping list cases pass');
process.exit(failed ? 1 : 0);
