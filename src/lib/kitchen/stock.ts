import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql, kitchenDay, daysBetween } from './db';
import type { Stock, StockItem, StockLevel } from './types';

/** Anything older than this without confirmation stops being presented as fact.
 *  Ten days is STOCK.md's own long-standing threshold, kept deliberately. */
const STALE_DAYS = 10;

export const EVENT_KINDS = [
  'bought', 'low', 'out', 'tossed', 'froze', 'thawing', 'cooked', 'confirm', 'note',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

interface SeedItem {
  n: string; label?: string; where?: string; state?: string;
  by?: string; note?: string; buy?: unknown; made?: string; for?: string;
  since?: string; src?: string;
}

const CATALOGUE = join(process.cwd(), 'content', 'kitchen', 'stock', 'items.json');

/** Fold events over the seed catalogue. Order matters and later wins, which is the whole point:
 *  whatever he tapped most recently is what is true. State is never stored, only derived, which is
 *  the rule that ended thirteen contradictory hand-maintained tables in one day on 2026-08-04. */
export async function deriveStock(now = new Date()): Promise<Stock> {
  const seed = JSON.parse(await readFile(CATALOGUE, 'utf8')) as { items: Record<string, SeedItem> };

  const rows = await sql`
    select at, item_id, ev, src, note, use_by, where_at, label, display_name
    from stock_event order by at asc
  ` as {
    at: Date; item_id: string; ev: string; src: string | null; note: string | null;
    use_by: Date | null; where_at: string | null; label: string | null; display_name: string | null;
  }[];

  const items: Record<string, StockItem> = {};

  for (const [id, r] of Object.entries(seed.items)) {
    // Split the old single state onto two axes: `level` is how much is left, `where` is which
    // appliance it is in. They used to compete, so a thing could not be both owned and frozen.
    const level = (r.state === 'frozen' ? 'have' : r.state ?? 'none') as StockLevel;
    items[id] = {
      id, n: r.n, label: r.label, where: r.where ?? 'pantry', level,
      by: r.by ?? null, note: r.note ?? null, made: r.made,
      since: r.since, src: r.src ?? 'seed',
      state: level, usableNow: false, ageDays: null, daysLeft: null, conf: 'unknown',
    };
  }

  for (const e of rows) {
    const day = kitchenDay(e.at);
    let it = items[e.item_id];
    // An event for an unknown id is kept rather than dropped: the thing it describes is real and a
    // missing catalogue row is our bug, not his.
    if (!it) {
      it = items[e.item_id] = {
        id: e.item_id, n: e.display_name ?? e.item_id, where: e.where_at ?? 'pantry',
        level: 'have', since: day, src: e.src ?? 'event',
        state: 'have', usableNow: true, ageDays: null, daysLeft: null, conf: 'unknown',
      };
    }
    switch (e.ev) {
      case 'bought':  it.level = 'have'; if (e.where_at) it.where = e.where_at; break;
      case 'low':     it.level = 'low'; break;
      case 'out':
      case 'tossed':  it.level = 'out'; it.by = null; break;
      case 'froze':   it.where = 'freezer'; break;
      case 'thawing': it.where = 'fridge'; break;
      // Cooking does not tell us how much is left, so the level is unchanged. It DOES end the raw
      // ingredient's use-by clock: a roast thawed on Aug 4 with a "slice it today" deadline stops
      // being overdue the moment it is cooked, and the finished dish gets its own clock as its own
      // item. Not clearing `by` here is why the home screen was still shouting "3 DAYS PAST ITS
      // BEST, slice it TODAY" about a roast eaten three days earlier.
      case 'cooked':  it.by = null; break;
      // confirm/note leave the level alone, but the fields below still apply.
    }
    if (e.use_by !== null) it.by = typeof e.use_by === 'string' ? e.use_by : kitchenDay(e.use_by);
    if (e.display_name) it.n = e.display_name;
    if (e.label !== null) it.label = e.label ?? undefined;
    if (e.note !== null) it.note = e.note;
    if (e.ev !== 'note') { it.since = day; it.src = e.src ?? 'event'; }
  }

  const today = kitchenDay(now);
  for (const it of Object.values(items)) {
    it.state = (it.level === 'have' || it.level === 'low') && it.where === 'freezer' ? 'frozen' : it.level;
    it.usableNow = (it.level === 'have' || it.level === 'low') && it.where !== 'freezer';
    it.ageDays = it.since ? daysBetween(it.since, today) : null;
    it.daysLeft = it.by ? daysBetween(today, it.by) : null;
    it.conf =
      it.ageDays === null ? 'unknown'
      : it.ageDays > STALE_DAYS ? 'stale'
      : it.src === 'seed' ? 'modeled'
      : 'fresh';
  }

  return { generatedAt: now.toISOString(), events: rows.length, items };
}

export async function appendStockEvent(e: {
  id: string; ev: EventKind; src?: string; note?: string;
  by?: string; where?: string; label?: string; n?: string; at?: string;
}) {
  if (!e?.id || !e?.ev) throw new Error('an event needs at least an id and an ev');
  if (!EVENT_KINDS.includes(e.ev)) throw new Error(`unknown event kind '${e.ev}'`);
  await sql`
    insert into stock_event (at, item_id, ev, src, note, use_by, where_at, label, display_name)
    values (${e.at ?? new Date().toISOString()}, ${e.id}, ${e.ev}, ${e.src ?? 'tap'},
            ${e.note ?? null}, ${e.by ?? null}, ${e.where ?? null}, ${e.label ?? null}, ${e.n ?? null})
  `;
}

/** Ranked by how soon it stops being good. */
export const expiringSoon = (stock: Stock, withinDays = 14, limit = 4) =>
  Object.values(stock.items)
    .filter((i) => i.daysLeft !== null && i.daysLeft <= withinDays && i.level !== 'out' && i.level !== 'none')
    .sort((a, b) => (a.daysLeft! - b.daysLeft!))
    .slice(0, limit);
