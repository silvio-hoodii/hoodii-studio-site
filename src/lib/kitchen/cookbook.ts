import 'server-only';
import { cache } from 'react';
import { sql } from './db';
import { dayOf } from '../day';

/** One row of a dish's shopping list, written by a session. `need` is buy | optional | owned. */
export interface ListItem {
  item: string;
  qty?: string;
  url?: string;
  price?: string;
  note?: string;
  need?: string;
}

/* The cookbook, rebuilt 2026-09-05.
 *
 * One question this used to answer: "what can I cook right now from what is in the fridge". It
 * stopped being able to on 2026-08-23, the day he stopped photographing receipts, and kept answering
 * anyway. The question it answers now is the one he kept asking in his own words: "I want to make
 * this. What do I need?" A dish is chosen in a session, the agent finds the publisher's recipe and
 * builds the shopping list, and this module is what the phone reads afterwards.
 *
 * No stock. No scoring. No step rendering. The publisher's page is the recipe.
 */

export interface DishNote {
  at: string; // YYYY-MM-DD
  text: string;
}

export interface Dish {
  id: string;
  name: string;
  sourceUrl: string;
  publisher: string | null;
  servings: number | null;
  proteinG: number | null;
  proteinNote: string | null;
  list: ListItem[];
  notes: DishNote[];
  addedAt: string;
}

export interface CookRow {
  id: string;
  at: string;
  rating: string | null;
  note: string | null;
}

interface DishRecord {
  id: string;
  name: string;
  source_url: string;
  publisher: string | null;
  servings: number | null;
  protein_g: string | number | null;
  protein_note: string | null;
  list: unknown;
  notes: unknown;
  added_at: Date;
}

function toDish(r: DishRecord): Dish {
  return {
    id: r.id,
    name: r.name,
    sourceUrl: r.source_url,
    publisher: r.publisher,
    servings: r.servings,
    proteinG: r.protein_g == null ? null : Number(r.protein_g),
    proteinNote: r.protein_note,
    list: Array.isArray(r.list) ? (r.list as ListItem[]) : [],
    notes: Array.isArray(r.notes) ? (r.notes as DishNote[]) : [],
    addedAt: dayOf(r.added_at),
  };
}

export async function listDishes(): Promise<Dish[]> {
  const rows = (await sql`select * from dish order by added_at desc`) as DishRecord[];
  return rows.map(toDish);
}

/* `cache()` so generateMetadata and the page share one read per request instead of two. */
export const getDish = cache(async (id: string): Promise<Dish | null> => {
  const rows = (await sql`select * from dish where id = ${id}`) as DishRecord[];
  return rows[0] ? toDish(rows[0]) : null;
});

/* WHAT COUNTS AS A COOK, in one place: a debrief row (no step index) WITH A RATING. A row with only
 * a note is a note, not a cook. "last cooked" used to count note rows while the marks beside it did
 * not, so a dish could read "last cooked yesterday" with no mark for yesterday. */
const RATED = ['nailed', 'fine', 'wrong'];

/** Per dish, by display name: every rated cook oldest first (nailed, fine or wrong) and the day of
 *  the newest debrief of any kind. One scan of cook_log for the dish list.
 *
 *  `last` takes an unrated row too. Two dishes he cooked and wrote about without tapping a rating
 *  ("went great", "the first dish that went right") read "not cooked yet" for a morning on
 *  2026-09-27 when this required a rating for both. A note is a cook; only the mark needs a rating. */
export async function cookMarks(): Promise<Record<string, { ratings: string[]; last: string }>> {
  const rows = (await sql`
    select dish, rating, at from cook_log
     where step is null
     order by at`) as { dish: string; rating: string | null; at: Date }[];
  const out: Record<string, { ratings: string[]; last: string }> = {};
  for (const r of rows) {
    const m = (out[r.dish] ??= { ratings: [], last: '' });
    if (r.rating && RATED.includes(r.rating)) m.ratings.push(r.rating);
    m.last = dayOf(r.at);
  }
  return out;
}

/** Every debrief row for one dish, newest first. Keyed by the dish ID through a subquery, so the
 *  page can run this beside getDish instead of waiting for the name. */
/** The publisher's host for display, or the raw string when a row's URL does not parse, so one bad
 *  row cannot 500 the whole list. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export async function cookRows(dishId: string): Promise<CookRow[]> {
  const rows = (await sql`
    select id, at, rating, note from cook_log
    where dish = (select name from dish where id = ${dishId}) and step is null
    order by at desc
  `) as { id: string; at: Date; rating: string | null; note: string | null }[];
  return rows.map((r) => ({ id: String(r.id), at: dayOf(r.at), rating: r.rating || null, note: r.note || null }));
}

export async function logCook(e: { dish: string; rating?: string; note?: string }) {
  await sql`
    insert into cook_log (dish, rating, note)
    values (${e.dish}, ${e.rating ?? ''}, ${e.note ?? ''})
  `;
}
