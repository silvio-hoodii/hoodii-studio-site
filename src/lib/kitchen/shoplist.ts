/* ONE SHOPPING LIST, BUILT FROM EVERY DISH. No database in this file, on purpose: everything here
 * is a pure function of rows that were already read, so `shoplist.test.ts` can run it without a
 * connection string and without touching his real list.
 *
 * WHY IT EXISTS. Until 2026-09-12 the only shopping list was per dish, on `/kitchen/<id>`. Seven
 * dishes carried 37 rows between them and they overlapped heavily: peanut butter and honey on two
 * dishes, eggs and walnuts on three, mozzarella twice on ONE dish under two different names. A trip
 * to Walmart meant opening seven pages and doing the union by hand. His words: "I want one big
 * shopping list that knows everything across every recipe."
 *
 * There was one before, at `/kitchen/shop`, deleted on 2026-09-05 with the rest of the fridge model
 * that fed it. What died with it was worth keeping and is back here: tick a row off and it stays
 * ticked, add something no recipe knows about, see which dishes each row is for.
 *
 * THE THING THAT MADE THIS UNSAFE TO BUILD, AND THE FIX. Whether a row was something to buy lived in
 * PROSE, inside the note and inside the price field: "ESSENTIAL", "STILL NEEDED", "OPTIONAL",
 * "DO NOT BUY", price "ALREADY OWNED", price "already have". A global list that greps for those
 * strings works on today's 37 rows and puts an owned item on the buy list the first time a session
 * writes "he already has this" instead. That is the same failure as the stock quantity that lived in
 * a free-text label, and `.agents/ENGINEERING.md` law 1 says to make the class unrepresentable
 * rather than to check instances.
 *
 * So a list item now carries `need`, one of three values, and this file reads that field and never
 * the prose. An item with no valid `need` is NOT guessed at in either direction: it lands in
 * `unsorted`, which the page states at the top with a count. A wrong "you already have this" is the
 * expensive direction, and a silent default to `buy` would produce the other one just as quietly.
 */

/** A row on a dish's shopping list, as stored in `dish.list`. */
export interface ListItem {
  item: string;
  qty?: string;
  url?: string;
  price?: string;
  note?: string;
  /** buy | optional | owned. Absent on rows written before 2026-09-12; see `unsorted`. */
  need?: string;
}

/** What to do about a row. The only three states, and the reason this file can be trusted. */
export type Need = 'buy' | 'optional' | 'owned';

const NEEDS = new Set<string>(['buy', 'optional', 'owned']);

export function asNeed(v: unknown): Need | null {
  return typeof v === 'string' && NEEDS.has(v) ? (v as Need) : null;
}

/* HOW LONG A TICK COUNTS FOR, and why it is not forever.
 *
 * A tick means "I bought this", which is a fact about a trip. It does not mean "I have this", which
 * is a fact about the kitchen, and modelling the kitchen is the thing that already died here once.
 * So a tick suppresses a row for a fortnight and then the row comes back CARRYING THE DATE, which is
 * a visible return he can re-tick in one tap rather than a silent reappearance.
 *
 * Fourteen days is the same window `HealthOS/CURRENT.md` calls itself stale at. Nothing about
 * groceries makes fourteen the true number; what makes it defensible is that both directions of
 * error are visible. A row that comes back says when it was last bought, and a row that is still
 * suppressed sits in a section with a count on it.
 *
 * The permanent answer to "I own this" is need 'owned' on the dish row, which a session writes
 * deliberately, the way the nori and the surimi were written on 2026-09-12 after he sent photos. */
export const TICK_DAYS = 14;

export interface DishSource {
  id: string;
  name: string;
  list: ListItem[];
}

export interface Tick {
  key: string;
  /** YYYY-MM-DD */
  at: string;
}

export interface Extra {
  id: string;
  text: string;
  /** YYYY-MM-DD */
  at: string;
}

export interface ShopRow {
  /** The identity of the thing to buy. See `keyOf`. */
  key: string;
  label: string;
  url: string | null;
  need: Need | null;
  /** Two dishes classified the same item differently. Shown rather than resolved silently. */
  conflict: boolean;
  /** Every distinct quantity asked for, in the order the dishes were read. */
  qtys: string[];
  /** The price string exactly as a session wrote it, ranges and "each" included. */
  priceText: string | null;
  /** The first dollar figure in that string, for adding up. Null when there is no figure in it. */
  priceLow: number | null;
  /** The string named two figures, so `priceLow` is a floor and not the price. */
  priceIsRange: boolean;
  notes: { dish: string; text: string }[];
  dishes: { id: string; name: string }[];
  /** Typed into the box on the page, belonging to no dish. */
  mine: boolean;
  /** The day it was last ticked off, whether or not that tick still counts. */
  gotDay: string | null;
  /** Days since that tick. Null when it has never been ticked. */
  gotAgeDays: number | null;
}

export interface ShopList {
  buy: ShopRow[];
  optional: ShopRow[];
  owned: ShopRow[];
  /** Ticked off inside the last TICK_DAYS. */
  got: ShopRow[];
  /** No valid `need` on any of its occurrences. Never guessed into another bucket. */
  unsorted: ShopRow[];
  /** Every dish contributing at least one row that is not owned, for the filter chips. */
  dishes: { id: string; name: string; count: number }[];
}

/** Days from `a` to `b`, both YYYY-MM-DD. Negative when `b` is before `a`. */
export function daysBetween(a: string, b: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((p(b) - p(a)) / 86400000);
}

/* THE IDENTITY OF A THING TO BUY, and why the URL comes first.
 *
 * The live data settles this. `easypizzadough` carries "Shredded mozzarella (Great Value Pizza
 * Mozzarella)" and "More mozzarella" as two rows with the SAME Walmart URL, because a later session
 * worked out that four pizzas need a second bag. Matching on the name leaves two rows for one bag of
 * cheese. Matching on the URL gets it right, and the URL is a product identifier written by the
 * store rather than a phrase written by an agent.
 *
 * Where there is no URL the fall-back is the item text, lowercased and with its whitespace collapsed,
 * and NOTHING FUZZIER THAN THAT. Edit distance would eventually decide that "salted butter" and
 * "unsalted butter" are one item, and a merge like that is invisible once it has happened. Two rows
 * for one thing is a nuisance; one row for two things is a wrong list. */
export function keyOf(it: ListItem): string {
  const url = (it.url ?? '').trim();
  if (url) return `url:${url}`;
  return `name:${labelOf(it.item).toLowerCase()}`;
}

/* THE DISPLAYED NAME, WITH ITS WHITESPACE COLLAPSED, and this is not cosmetic.
 *
 * The merge picks the longest of the names it saw, and the first version of that rule compared raw
 * `trim()`ed strings. Its own test suite caught it on the first run: "salted   BUTTER" is fourteen
 * characters and "Salted butter" is thirteen, so the row rendered in the aisle under the sloppier of
 * the two names. Collapsing first makes the comparison about how much the name SAYS rather than how
 * it was typed, and it keeps double spaces off the screen. */
function labelOf(item: string): string {
  return item.trim().replace(/\s+/g, ' ');
}

/** The first dollar figure in a price string, and whether the string named a second one. */
export function parsePrice(text: string | null | undefined): { low: number | null; range: boolean } {
  if (!text) return { low: null, range: false };
  const hits = [...text.matchAll(/\$\s?(\d+(?:\.\d{1,2})?)/g)];
  const nums = hits.map((h) => Number(h[1])).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { low: null, range: false };
  return { low: Math.min(...nums), range: nums.length > 1 };
}

/* WHICH CLASSIFICATION WINS when two dishes disagree about the same product.
 *
 * buy beats optional beats owned. If any dish still needs a thing, it belongs on the list, and the
 * row is marked `conflict` so the disagreement is on the screen instead of being resolved out of
 * sight. This has never fired on the live data; it is here because the moment it does fire, quietly
 * picking one and moving on is how a list starts lying. */
const RANK: Record<Need, number> = { buy: 2, optional: 1, owned: 0 };

export function buildShopList(input: {
  dishes: DishSource[];
  extras: Extra[];
  ticks: Tick[];
  today: string;
}): ShopList {
  const { dishes, extras, ticks, today } = input;
  const byKey = new Map<string, ShopRow>();
  /* The classifications seen for a key, so a disagreement can be detected rather than overwritten. */
  const seen = new Map<string, Set<string>>();

  for (const d of dishes) {
    for (const it of d.list) {
      const key = keyOf(it);
      const need = asNeed(it.need);
      const price = (it.price ?? '').trim() || null;
      const parsed = parsePrice(price);

      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          label: labelOf(it.item),
          url: (it.url ?? '').trim() || null,
          need,
          conflict: false,
          qtys: [],
          priceText: price,
          priceLow: parsed.low,
          priceIsRange: parsed.range,
          notes: [],
          dishes: [],
          mine: false,
          gotDay: null,
          gotAgeDays: null,
        };
        byKey.set(key, row);
        seen.set(key, new Set());
      } else {
        /* THE LABEL OF A MERGED ROW IS THE LONGEST ONE, which on the live data is the difference
         * between reading "Shredded mozzarella (Great Value Pizza Mozzarella)" in the aisle and
         * reading "More mozzarella". Deterministic, so the row does not rename itself when a dish is
         * added, and it favours the occurrence that names the product. */
        const name = labelOf(it.item);
        if (name.length > row.label.length) row.label = name;
        if (!row.url && (it.url ?? '').trim()) row.url = (it.url ?? '').trim();
        /* The cheapest figure across occurrences, and a range anywhere makes the row a range. */
        if (parsed.low != null && (row.priceLow == null || parsed.low < row.priceLow)) {
          row.priceLow = parsed.low;
          row.priceText = price;
        }
        if (parsed.range) row.priceIsRange = true;
        if (row.priceText == null && price) row.priceText = price;
        const rank = need ? RANK[need] : -1;
        const cur = row.need ? RANK[row.need] : -1;
        if (rank > cur) row.need = need;
      }

      if (need) seen.get(key)?.add(need);
      const qty = (it.qty ?? '').trim();
      if (qty && qty !== '-' && !row.qtys.includes(qty)) row.qtys.push(qty);
      const note = (it.note ?? '').trim();
      if (note && !row.notes.some((n) => n.text === note)) row.notes.push({ dish: d.name, text: note });
      if (!row.dishes.some((x) => x.id === d.id)) row.dishes.push({ id: d.id, name: d.name });
    }
  }

  for (const [key, kinds] of seen) {
    const row = byKey.get(key);
    if (row && kinds.size > 1) row.conflict = true;
  }

  /* Anything he typed into the box. It belongs to no dish, so it is always something to buy: he
   * would not have typed it otherwise, and there is no publisher's list to call it optional. */
  for (const e of extras) {
    const key = `extra:${e.id}`;
    byKey.set(key, {
      key,
      label: labelOf(e.text),
      url: null,
      need: 'buy',
      conflict: false,
      qtys: [],
      priceText: null,
      priceLow: null,
      priceIsRange: false,
      notes: [],
      dishes: [],
      mine: true,
      gotDay: null,
      gotAgeDays: null,
    });
  }

  /* The newest tick per key wins, so re-ticking a row that came back restarts its fortnight. */
  const newest = new Map<string, string>();
  for (const t of ticks) {
    const prev = newest.get(t.key);
    if (!prev || t.at > prev) newest.set(t.key, t.at);
  }
  for (const [key, at] of newest) {
    const row = byKey.get(key);
    if (!row) continue;
    row.gotDay = at;
    row.gotAgeDays = daysBetween(at, today);
  }

  const out: ShopList = { buy: [], optional: [], owned: [], got: [], unsorted: [], dishes: [] };
  for (const row of byKey.values()) {
    /* A tick only suppresses a row that would otherwise be shopped for. Ticking something already
     * marked owned would be odd, and hiding it in two places at once would be worse. */
    const ticked = row.gotAgeDays != null && row.gotAgeDays >= 0 && row.gotAgeDays < TICK_DAYS;
    if (row.need == null) out.unsorted.push(row);
    else if (row.need === 'owned') out.owned.push(row);
    else if (ticked) out.got.push(row);
    else if (row.need === 'buy') out.buy.push(row);
    else out.optional.push(row);
  }

  const order = (a: ShopRow, b: ShopRow) => a.label.localeCompare(b.label);
  out.buy.sort(order);
  out.optional.sort(order);
  out.owned.sort(order);
  out.unsorted.sort(order);
  /* Most recently bought first: in a store, the useful question about this section is "what did I
   * already get", and the answer decays with age. */
  out.got.sort((a, b) => (b.gotDay ?? '').localeCompare(a.gotDay ?? ''));

  /* The filter chips. A dish whose every row is owned has nothing to shop for and would be a chip
   * that empties the page, so it is left out. */
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const row of [...out.buy, ...out.optional, ...out.got, ...out.unsorted]) {
    for (const d of row.dishes) {
      const c = counts.get(d.id) ?? { id: d.id, name: d.name, count: 0 };
      c.count++;
      counts.set(d.id, c);
    }
  }
  out.dishes = [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));

  return out;
}

/** What the rows in front of him add up to, said in a way that survives every clause being empty. */
export function totalLine(rows: ShopRow[]): string {
  if (rows.length === 0) return 'Nothing here.';
  const priced = rows.filter((r) => r.priceLow != null);
  const sum = priced.reduce((n, r) => n + (r.priceLow ?? 0), 0);
  const anyRange = priced.some((r) => r.priceIsRange);

  /* THE CLAUSES GO IN AN ARRAY AND THE ARRAY PUNCTUATES ITSELF. Carried over from the page this
   * replaces, where hand-typed separators between three conditionals rendered "15 to buy. , 15 with
   * no price yet" the moment the middle clause was empty. The separator belongs to the join. */
  const clauses: string[] = [];
  if (priced.length > 0) {
    clauses.push(`${anyRange ? 'from ' : ''}$${sum.toFixed(2)} for the ${priced.length} with a price`);
  }
  const unpriced = rows.length - priced.length;
  if (unpriced > 0) clauses.push(`${unpriced} with no price`);

  const head = `${rows.length} item${rows.length === 1 ? '' : 's'}`;
  return clauses.length > 0 ? `${head}, ${clauses.join(', ')}.` : `${head}.`;
}
