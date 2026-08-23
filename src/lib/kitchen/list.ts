import 'server-only';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sql, kitchenDay, daysBetween } from './db';
import { deriveStock } from './stock';
import { scoreRecipe } from '../../../content/kitchen/match.mjs';

/* THE SHOPPING LIST. Added 2026-08-18, and it did not exist before.
 *
 * Silvio: "i dont understand where the shopping list is in the app, worth buying section is not it".
 * Correct on both halves. `/kitchen/shop` answered "which single purchase unlocks the most dishes",
 * which is an analysis, and `KitchenOS/SHOPPING.md` claimed the app already held a list "grouped by
 * department with the specs on each line and tick-off that survives a reload". That sentence described
 * the retired laptop page and two new sections were appended underneath it the same day, by an agent
 * that did not check the claim above where it was typing.
 *
 * THE LIST IS FOLDED, NOT STORED. Its contents come from stock rows he marked low or out and from what
 * the recipes are actually short of. Only his own additions and his tick-offs are events. A stored list
 * is a list that goes stale, and this project retired thirteen hand-maintained tables in one day for
 * exactly that reason.
 *
 * PRICES CARRY THEIR PROVENANCE. `content/kitchen/prices.json` records where each price was read, when,
 * and from which surface, because on 2026-08-18 two Walmart search tiles disagreed with their own
 * product pages by $4.66 and $10.28, on the two lines the whole trip rested on. A price older than
 * PRICE_STALE_DAYS renders as stale rather than as fact, and a row with no price says so rather than
 * being filled with a guess.
 */

/** Past this, a price is history rather than information. Groceries move faster than this file can. */
const PRICE_STALE_DAYS = 14;

const CONTENT = join(process.cwd(), 'content', 'kitchen');

export interface PriceRow {
  item: string;
  label: string;
  price: number;
  size?: string;
  unitPrice?: string;
  store?: string;
  seller?: string;
  url?: string;
  readAt: string;
  readFrom: 'product-page' | 'tile' | 'listing' | 'receipt';
  note?: string;
}

export interface ListItem {
  /** Stock id, `gap:<name>`, or a free label he typed. */
  id: string;
  /** What to look for on a shelf. */
  name: string;
  /** Every reason this is on the list, so a row is never unexplained. */
  why: string[];
  /** Dishes waiting on it, by name. */
  dishes: string[];
  /** Ran out, but not yet a reason on its own. Promoted to a `why` only if a dish wants it. */
  ranOut?: boolean;
  price: PriceRow | null;
  priceAgeDays: number | null;
  priceStale: boolean;
  state: 'open' | 'got';
  addedByHim: boolean;
  gotDay: string | null;
}

export interface ShoppingList {
  open: ListItem[];
  got: ListItem[];
  /** Sum of the priced open rows only, and the count it is over, because a total that silently
   *  omits rows is the same lie as a guessed price. */
  pricedTotal: number;
  pricedCount: number;
  unpricedCount: number;
  stalePriceCount: number;
}

async function prices(): Promise<Map<string, PriceRow>> {
  const raw = JSON.parse(await readFile(join(CONTENT, 'prices.json'), 'utf8')) as { prices: PriceRow[] };
  const m = new Map<string, PriceRow>();
  for (const p of raw.prices) m.set(p.item, p);
  return m;
}

/** Every dish this kitchen actually holds a built, reviewed card for, as name plus ingredient lines. */
async function dishesToScore(): Promise<{ name: string; lines: string[] }[]> {
  const out: { name: string; lines: string[] }[] = [];

  const recipeDir = join(CONTENT, 'recipes');
  for (const f of await readdir(recipeDir)) {
    if (!f.endsWith('.json')) continue;
    const r = JSON.parse(await readFile(join(recipeDir, f), 'utf8')) as {
      name?: string; form?: string; _migration?: boolean;
      provenance?: { cookedResult?: string | null };
      ingredients?: { display?: string; qty?: number; unit?: string; staple?: boolean }[];
    };
    if (!r.name || !Array.isArray(r.ingredients)) continue;
    /* ONLY DISHES THE APP WOULD ACTUALLY OFFER. The first version scored every file in the folder and
     * produced 26 rows, of which several were for things he will never cook: the 21 machine-migrated
     * cards that predate the schema, Chicken Piccata which is stamped `failed`, and the technique and
     * method entries. "Slice the Roast and Bank the Beef" wanted sliced beef cut from a sirloin roast,
     * which is an intermediate product and not a thing on a shelf. A shopping list that pads itself
     * with rows he cannot act on is the same failure as a stock table that overstates: it teaches him
     * not to trust the page. */
    if (r._migration) continue;
    if (r.provenance?.cookedResult === 'failed') continue;
    if (r.form && !['dish', 'assembly', 'macro'].includes(r.form)) continue;
    /* A card's ingredients are already resolved to stock ids, so scoring its prose again would be
     * asking the matcher a question the card already answered. What is needed here is only the lines,
     * for the ones a card cannot satisfy. Staples are skipped: presence is binary and lives in
     * KITCHEN.md, and a card cannot be short of salt. */
    const lines = r.ingredients
      .filter((i) => !i.staple)
      .map((i) => [i.qty ?? '', i.unit ?? '', i.display ?? ''].join(' ').trim())
      .filter(Boolean);
    out.push({ name: r.name, lines });
  }

  /* `content/kitchen/imported/` is NOT scored here. Added 2026-08-23, and it should never have been:
   * import.mjs's own header says a capture "lives in imported/, never in recipes/, so an unfinished
   * one can never be offered and can never break pnpm build" -- that promise held for the cook pages
   * and broke here. A capture is the publisher's raw text, not a reviewed card: nobody has mapped its
   * lines to stock, flagged what is actually buyable, or noticed a line like the pastafrittata
   * capture's "4 ounces cold leftover spaghetti", which cannot be bought at any store. Two separate,
   * never-finished captures of the same dish (arrozconpollo.json and arrozconpolloaji.json, one with
   * a comma-mangled scraped title) is why "3 dishes waiting on it" read as three different names for
   * one dish he cannot even cook yet. If a capture becomes a real card, it already scores above once
   * it lands in recipes/ -- nothing needs to be counted twice by reaching into the staging folder. */
  return out;
}

export async function shoppingList(): Promise<ShoppingList> {
  const [stock, priceMap, dishes, rows] = await Promise.all([
    deriveStock(),
    prices(),
    dishesToScore(),
    sql`select item_id, ev, label, src, note, at from shop_item order by at asc` as unknown as Promise<
      { item_id: string; ev: string; label: string | null; src: string | null; note: string | null; at: Date }[]
    >,
  ]);

  const usable = new Set<string>();
  for (const it of Object.values(stock.items)) if (it.level === 'have' || it.level === 'low') usable.add(it.id);

  const items = new Map<string, ListItem>();
  const blank = (id: string, name: string): ListItem => ({
    id, name, why: [], dishes: [], price: null, priceAgeDays: null, priceStale: false,
    state: 'open', addedByHim: false, gotDay: null,
  });
  const touch = (id: string, name: string) => {
    let it = items.get(id);
    if (!it) items.set(id, (it = blank(id, name)));
    return it;
  };

  /* 1. Stock he has flagged himself. `low` still counts as usable, so these are a heads-up rather
   *    than a blocker, and the difference is stated on the row instead of being flattened away. */
  for (const it of Object.values(stock.items)) {
    /* NOTHING HE COOKS GOES ON A LIST OF THINGS TO BUY. Added 2026-08-22.
     *
     * `spaghetti_cooked` ran out, because he ate it, and the list offered him cooked spaghetti. His
     * words: "Why is cooked spaghetti in the list? This is a shopping list. It doesn't make sense."
     * Same for browned beef, the bolognese sauce, the pickles and the tzatziki: every one is made in
     * his own kitchen out of something that has its own row, and it is that row which belongs here.
     *
     * A property of the item in `stock/items.json`, not a name pattern, because `beef` is browned beef
     * and `beef-raw` is the thing you buy, and no rule reading the id could tell them apart. */
    if (it.buyable === false) continue;
    if (it.level === 'low') {
      const row = touch(it.id, it.n);
      row.why.push('running low');
    } else if (it.level === 'none' && it.src !== 'seed') {
      /* `none` on a row that only ever came from the seed catalogue means never owned, which is most
       * of the catalogue and is not a shopping list. `none` on a row with events behind it means he
       * had it and it ran out, which is.
       *
       * RAN OUT IS NOT A REASON ON ITS OWN, changed 2026-08-22. It was, and it filled the list with
       * things nothing wanted: beer bought for one dish, capers bought for a dish cooked once. "Why
       * would I need beer? ... Capers again for a dish that we made once." Running out of something is
       * only a shopping item if something is waiting on it, so the row is created and the reason is
       * added below in step 2 where dish demand is known. Marked, not pushed. */
      touch(it.id, it.n).ranOut = true;
    }
  }

  /* 2. What the dishes are short of. Named per dish, because "buy tortillas" is a different sentence
   *    from "the burritos cannot happen without tortillas" and only the second one is a reason. */
  for (const d of dishes) {
    const score = scoreRecipe(d.lines, usable);
    for (const m of score.missing) {
      const id = m.item && !String(m.item).startsWith('__')
        ? (stock.items[m.item] ? m.item : `gap:${m.item}`)
        : `gap:${m.shown}`;
      const name = stock.items[m.item as string]?.n ?? String(m.item ?? m.shown);
      const row = touch(id, name);
      if (!row.dishes.includes(d.name)) row.dishes.push(d.name);
    }
  }

  /* 3. His own events, last one wins. These come last so a tick-off beats every generated reason:
   *    if he says he has it, the app does not argue. */
  for (const e of rows) {
    const row = touch(e.item_id, e.label ?? items.get(e.item_id)?.name ?? e.item_id);
    if (e.label) row.name = e.label;
    if (e.ev === 'add') { row.state = 'open'; row.addedByHim = true; row.gotDay = null; if (!row.why.includes('you added it')) row.why.push('you added it'); }
    if (e.ev === 'got') { row.state = 'got'; row.gotDay = kitchenDay(e.at); }
    if (e.ev === 'drop') { row.state = 'got'; row.gotDay = null; }
  }

  const today = kitchenDay(new Date());
  for (const row of items.values()) {
    const p = priceMap.get(row.id) ?? null;
    row.price = p;
    if (p) {
      row.priceAgeDays = daysBetween(p.readAt, today);
      row.priceStale = row.priceAgeDays > PRICE_STALE_DAYS;
    }
    if (row.dishes.length) {
      row.why.push(row.dishes.length === 1 ? '1 dish waiting on it' : `${row.dishes.length} dishes waiting on it`);
      /* "ran out" earns its place once something is waiting on it, and says so in that order. */
      if (row.ranOut) row.why.unshift('ran out');
    }
  }

  const all = [...items.values()].filter((r) => r.why.length || r.addedByHim);
  const open = all.filter((r) => r.state === 'open');
  const got = all.filter((r) => r.state === 'got');

  /* Rank by what is blocked, then by what he flagged, then alphabetically. A list ordered by price or
   * by aisle would be prettier and would bury the row that is stopping a dinner. */
  const rank = (r: ListItem) => -(r.dishes.length * 10 + (r.why.includes('ran out') ? 3 : 0) + (r.why.includes('running low') ? 2 : 0));
  open.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  got.sort((a, b) => (b.gotDay ?? '').localeCompare(a.gotDay ?? '') || a.name.localeCompare(b.name));

  const priced = open.filter((r) => r.price && !r.priceStale);
  return {
    open,
    got,
    pricedTotal: priced.reduce((s, r) => s + (r.price?.price ?? 0), 0),
    pricedCount: priced.length,
    unpricedCount: open.length - priced.length,
    stalePriceCount: open.filter((r) => r.priceStale).length,
  };
}

/** He tapped a row. Append-only: nothing here ever updates or deletes. */
export async function logShop(ev: 'add' | 'got' | 'drop', itemId: string, label?: string, note?: string) {
  await sql`insert into shop_item (item_id, ev, label, src, note)
            values (${itemId}, ${ev}, ${label ?? null}, 'tap', ${note ?? null})`;
}
