import 'server-only';
import { sql } from './queue-db';

export interface Want { key: string; title: string; author: string; addedAt: string; note: string | null }

/** Idempotent on purpose: tapping "want" twice is a fat finger, not a request for two rows. */
export async function addWant(w: { key: string; title: string; author: string; note: string | null }) {
  await sql`
    insert into reading_want (key, title, author, note)
    values (${w.key}, ${w.title}, ${w.author}, ${w.note})
    on conflict (key) do update set note = coalesce(excluded.note, reading_want.note)
  `;
}

export async function removeWant(key: string) {
  await sql`delete from reading_want where key = ${key}`;
}

export async function getWants(): Promise<Want[]> {
  const rows = (await sql`
    select key, title, author, added_at, note from reading_want order by added_at desc
  `) as { key: string; title: string; author: string; added_at: string; note: string | null }[];
  return rows.map((r) => ({ key: r.key, title: r.title, author: r.author, addedAt: r.added_at, note: r.note }));
}

/** Just the keys, for marking rows on the shelf page without shipping the whole table. */
export async function getWantKeys(): Promise<Set<string>> {
  const rows = (await sql`select key from reading_want`) as { key: string }[];
  return new Set(rows.map((r) => r.key));
}
