import 'server-only';
import { sql } from './db';
import { dayOf } from '../day';
import type { DishSource, Extra, ListItem, Tick } from './shoplist';

export type { ListItem } from './shoplist';

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

/* ---- the one shopping list ---------------------------------------------------------------------
 *
 * The aggregation itself is in `shoplist.ts`, which touches no database so its suite can run in CI.
 * These four read and write what it needs. Added 2026-09-12: "I want one big shopping list that
 * knows everything across every recipe."
 */

/** Every dish that carries a list, with only the fields the union needs. */
export async function shopSources(): Promise<DishSource[]> {
  const rows = (await sql`
    select id, name, list from dish
    where jsonb_array_length(list) > 0
    order by added_at desc
  `) as { id: string; name: string; list: unknown }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    list: Array.isArray(r.list) ? (r.list as ListItem[]) : [],
  }));
}

export async function shopTicks(): Promise<Tick[]> {
  const rows = (await sql`select key, at from shop_tick`) as { key: string; at: Date }[];
  return rows.map((r) => ({ key: r.key, at: dayOf(r.at) }));
}

export async function shopExtras(): Promise<Extra[]> {
  const rows = (await sql`select id, text, at from shop_extra order by at asc`) as
    { id: string | number; text: string; at: Date }[];
  return rows.map((r) => ({ id: String(r.id), text: r.text, at: dayOf(r.at) }));
}

/** Tick a row off. Re-ticking a row that came back after its fortnight restarts the clock. */
export async function tickShop(key: string, label: string) {
  await sql`
    insert into shop_tick (key, label, at) values (${key}, ${label}, now())
    on conflict (key) do update set label = excluded.label, at = now()
  `;
}

export async function untickShop(key: string) {
  await sql`delete from shop_tick where key = ${key}`;
}

export async function addShopExtra(text: string) {
  await sql`insert into shop_extra (text) values (${text})`;
}

/** Remove something he typed by mistake. The tick goes with it, or it would outlive its row. */
export async function removeShopExtra(id: string) {
  await sql`delete from shop_tick where key = ${`extra:${id}`}`;
  await sql`delete from shop_extra where id = ${Number(id)}`;
}
