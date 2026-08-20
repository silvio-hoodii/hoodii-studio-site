/* Shapes and labels for the live queue + acquisition status, no `server-only` and no filesystem/DB
 * import -- same split as ./types (Pack), and for the same reason: the queue page can stay a server
 * component today, but a shape file that already imports the DB client would make that a decision
 * nobody chose rather than one that was made on purpose.
 */

export type Track = 'canon' | 'current' | 'nonfiction' | 'genre';

export interface QueueEntry {
  key: string;
  position: number;
  title: string;
  author: string;
  year: number | null;
  status: string;
  track: Track;
  score: number | null;
  categories: string[];
  pace: string | null;
  paceNote: string | null;
  pages: number | null;
  era: string | null;
  language: string | null;
  mood: string[];
  format: string | null;
  why: string | null;
  pickedVia: string | null;
}

export type Verdict = 'BORROW NOW' | 'HOLD NOW' | 'FREE ONLINE' | 'BUY' | 'MISS';

export interface AcquisitionEntry {
  key: string;
  verdict: Verdict;
  verdictDetail: string | null;
  checkedAt: string | null;
  homeBranchLabel: string | null;
  homeBranchNow: boolean;
  /** The full acquire.json record for this book -- branch table, price table, per-channel detail. */
  payload: AcquirePayload;
}

export interface AcquireBranchRow {
  branch: string;
  collection: string;
  status: string;
  due: string | null;
  homeBranch: string | null;
}

export interface AcquirePriceItem {
  name?: string;
  title?: string;
  variant?: string;
  format?: string | null;
  condition?: string | null;
  price: number;
  compareAtPrice?: number | null;
  listPrice?: number | null;
  shipping?: number | null;
  shipsFrom?: string | null;
  marketplaceFloor?: number | null;
  currency?: string;
  shipToCanadaCaveat?: string | null;
}

export interface AcquirePriceChannel {
  ok: boolean;
  reason?: string;
  items: AcquirePriceItem[];
}

/** The shape scripts/acquire.mjs + scripts/price-buy-rows.mjs write per book in data/acquire.json.
 *  Only the fields the page actually renders are typed; the rest ride along in payload untyped. */
export interface AcquirePayload {
  title: string;
  author: string;
  verdict: Verdict;
  verdictDetail: string;
  branchInfo: { ok: boolean; error?: string; branches: AcquireBranchRow[] } | null;
  price: Record<string, AcquirePriceChannel> | null;
}

export const trackLabel: Record<Track, string> = {
  canon: 'canon',
  current: '🔥 current',
  nonfiction: 'non-fiction',
  genre: 'genre',
};

export const verdictLabel: Record<Verdict, string> = {
  'BORROW NOW': 'Borrow now',
  'HOLD NOW': 'Hold now',
  'FREE ONLINE': 'Free online',
  BUY: 'Buy',
  MISS: 'Miss',
};

/** The one fact that changes what to do today: a home-branch copy on the shelf right now. That is
 *  the only case that earns --signal on this page, same rule /swim uses for "open right now". */
export const isActionableNow = (a: Pick<AcquisitionEntry, 'homeBranchNow'>) => a.homeBranchNow;

export const priceChannelLabel: Record<string, string> = {
  indigo: 'Indigo', kobo: 'Kobo', abebooks: 'AbeBooks', thriftbooks: 'ThriftBooks',
  amazon: 'Amazon.ca', bookoutlet: 'BookOutlet',
};

/** Fixed display order -- object key order from JSON isn't a promise, and Indigo (new, CAD, the
 *  ceiling number) reading first is the useful default before used/USD channels. */
export const priceChannelOrder = ['indigo', 'kobo', 'amazon', 'abebooks', 'thriftbooks', 'bookoutlet'];

/** Drops exact (label, price) repeats -- a price fetch can surface the same real listing twice
 *  from two different search-result handles, and that is noise, not two offers. A different price
 *  under the same label is a genuinely different SKU (Indigo carries several distinct editions
 *  under "Kobo eBook") and always stays, so this never hides a real option, only a repeated one. */
export function dedupePriceItems(items: AcquirePriceItem[]): AcquirePriceItem[] {
  const seen = new Set<string>();
  const out: AcquirePriceItem[] = [];
  for (const item of items) {
    const label = item.variant ?? item.format ?? item.condition ?? '';
    const key = `${label}|${item.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function formatMoney(n: number, currency = 'CAD'): string {
  return currency === 'USD' ? `US$${n.toFixed(2)}` : `$${n.toFixed(2)}`;
}

/** One line per price item, matching the phrasing scripts/price-buy-rows.mjs already writes into
 *  ACQUIRE.md, so the page and the file never describe the same fetch two different ways. */
export function formatPriceLine(item: AcquirePriceItem): string {
  const label = item.variant ?? item.format ?? item.condition ?? '';
  const parts = [`${formatMoney(item.price, item.currency)}`];
  if (item.compareAtPrice) parts.push(`(was ${formatMoney(item.compareAtPrice, item.currency)})`);
  if (item.listPrice) parts.push(`(list ${formatMoney(item.listPrice, item.currency)})`);
  if (item.marketplaceFloor) parts.push(`marketplace from ${formatMoney(item.marketplaceFloor, item.currency)}`);
  if (item.shipping != null) {
    parts.push(`+ ${formatMoney(item.shipping, item.currency)} shipping from ${item.shipsFrom ?? 'unstated'}`);
    parts.push(`= landed ${formatMoney(item.price + item.shipping, item.currency)}`);
  }
  return `${label ? `${label}: ` : ''}${parts.join(' ')}`;
}
