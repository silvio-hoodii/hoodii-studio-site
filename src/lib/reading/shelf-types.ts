/* Shapes for the store-shelf finder (/reading/shelf). No `server-only`, same split as
 * catalog-types: importable from a client component later without dragging the DB client in. */

export type Shelf = 'fiction' | 'scifi' | 'mystery' | 'nonfiction';
export type Tier = 'grab' | 'good' | 'maybe';

export interface ShelfEntry {
  key: string;
  title: string;
  author: string;
  /** The name a shop files it under. NOT the join key's surname: that one takes everything
   *  after the first word and put Louisa May Alcott under M. See ReadingOS lib/keys.mjs. */
  fileUnder: string;
  letter: string;
  year: number | null;
  score: number;
  honours: number;
  tier: Tier;
  shelves: Shelf[];
  lists: string[];
  status: 'read' | 'queued' | 'seen' | null;
}

/* Section names as a second-hand shop signs them, not as the engine slugs them. "General
 * fiction" rather than "Fiction" because on a shop wall it is the label that means "the one
 * that is not sci-fi and not mystery". */
export const shelfLabel: Record<Shelf, string> = {
  fiction: 'General fiction',
  scifi: 'Sci-fi & fantasy',
  mystery: 'Mystery & crime',
  nonfiction: 'Non-fiction',
};
export const SHELVES: Shelf[] = ['fiction', 'scifi', 'mystery', 'nonfiction'];

/* What the badge means, in the words the page uses to explain itself. Kept next to the type so
 * a tier can never be added without someone writing down what it tells him to do. */
export const tierLabel: Record<Tier, string> = { grab: 'grab', good: 'good', maybe: 'long shot' };

export const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

export interface ShelfFilters {
  q?: string;
  shelf?: Shelf;
  letter?: string;
  /** Include the single-honour books. Off by default: 3,450 of the 3,612 are long shots, and a
   *  list that long is not a list. Search always covers them regardless. */
  long?: boolean;
}

export function shelfHref(f: ShelfFilters, patch: Partial<ShelfFilters>) {
  const next = { ...f, ...patch };
  const p = new URLSearchParams();
  if (next.q) p.set('q', next.q);
  if (next.shelf) p.set('shelf', next.shelf);
  if (next.letter) p.set('letter', next.letter);
  if (next.long) p.set('long', '1');
  const s = p.toString();
  return s ? `/reading/shelf?${s}` : '/reading/shelf';
}
