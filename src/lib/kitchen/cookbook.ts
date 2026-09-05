import 'server-only';
import { sql } from './db';
import { dayOf } from '../day';

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

export interface ListItem {
  item: string;
  qty?: string;
  url?: string;
  price?: string;
  note?: string;
}

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

export interface InboxRow {
  id: string;
  at: string;
  text: string;
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

export async function getDish(id: string): Promise<Dish | null> {
  const rows = (await sql`select * from dish where id = ${id}`) as DishRecord[];
  return rows[0] ? toDish(rows[0]) : null;
}

/** The last time each dish was cooked, by display name. A row with no step index is a debrief. */
export async function lastCooked(): Promise<Record<string, string>> {
  const rows = (await sql`
    select dish, max(at) as at from cook_log where step is null group by dish
  `) as { dish: string; at: Date }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.dish] = dayOf(r.at);
  return out;
}

export async function cookRows(dishName: string): Promise<CookRow[]> {
  const rows = (await sql`
    select id, at, rating, note from cook_log
    where dish = ${dishName} and step is null
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

export async function openInbox(): Promise<InboxRow[]> {
  const rows = (await sql`
    select id, at, text from inbox where handled = false order by at desc
  `) as { id: string; at: Date; text: string }[];
  return rows.map((r) => ({ id: String(r.id), at: dayOf(r.at), text: r.text }));
}

export async function addInbox(text: string) {
  await sql`insert into inbox (text) values (${text})`;
}
