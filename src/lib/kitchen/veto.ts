import 'server-only';
import { sql } from './db';

/* "STOP SHOWING ME THIS."
 *
 * The app had two signals about a dish and both were reasons to show it: he owns the ingredients, and
 * he has cooked it. Nothing said no. So Mongolian Ground Beef led the home page from the day it was
 * written, for three weeks, and he raised it in every session:
 *
 *   "Why is the fucking Mongolian ground beef thing here? I've been telling you that I don't even
 *   understand why it is there... The fact that I cook something doesn't mean that I want to eat it
 *   forever."
 *
 * No ranking can invent this. A dish he does not fancy looks identical to one he has not got round
 * to, and a dish he cooked last week looks identical to one he wants weekly. It has to be a tap.
 *
 * HIDDEN, NOT DELETED, and that distinction is load-bearing here. 2026-08-09 established that not
 * offering a dish is a ranking decision and hiding it is a navigation bug, after he said "now that
 * it's off, I can't even check what the recipe was". So a vetoed dish leaves the lists and appears in
 * one fold with an undo beside it. */

/** `card:<recipe id>` or `meal:<corpus id>`. The two libraries are separate id spaces and an
 *  unqualified id would collide eventually, which is the kind of bug that shows up as one dish
 *  silently hiding another. */
export const cardKey = (id: string) => `card:${id}`;
export const mealKey = (id: string) => `meal:${id}`;

export interface Vetoed { dish: string; name: string | null; at: string }

/** Folded at read time from the append-only log, like every other piece of state here. Last event per
 *  dish wins, so changing his mind is another row rather than a delete, and the record that a dish was
 *  once hidden survives it coming back. */
export async function vetoed(): Promise<{ ids: Set<string>; list: Vetoed[] }> {
  const rows = await sql`
    select dish, ev, name, at from dish_veto order by at asc
  ` as { dish: string; ev: string; name: string | null; at: Date }[];
  const state = new Map<string, Vetoed | null>();
  for (const r of rows) {
    state.set(r.dish, r.ev === 'hide'
      ? { dish: r.dish, name: r.name, at: new Date(r.at).toISOString().slice(0, 10) }
      : null);
  }
  const list = [...state.values()].filter((v): v is Vetoed => v !== null)
    .sort((a, b) => (a.name ?? a.dish).localeCompare(b.name ?? b.dish));
  return { ids: new Set(list.map((v) => v.dish)), list };
}

/** He tapped. Append-only: nothing here ever updates or deletes. */
export async function logVeto(ev: 'hide' | 'show', dish: string, name?: string) {
  await sql`insert into dish_veto (dish, ev, name) values (${dish}, ${ev}, ${name ?? null})`;
}
