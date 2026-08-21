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
export const TIERS: Tier[] = ['grab', 'good', 'maybe'];
export const tierChip: Record<Tier, string> = { grab: 'grab', good: 'good', maybe: 'long shots' };
/* One line each, shown under the filter so the badge never has to be guessed at. */
export const tierMeaning: Record<Tier, string> = {
  grab: 'best of its section, and vetted more than one way: a jury, critics and readers landing on it separately',
  good: 'more than one honour, or one honour it actually won',
  maybe: 'exactly one honour, usually a nomination in a broad archive, so it is a punt not a recommendation',
};

/* The shop signs a Classics wall and a Contemporary one. Where the line falls is a judgement no
 * shop agrees on, so the label carries the year rather than pretending there is a standard.
 * 1970 splits this catalogue 1,152 / 2,362. The 96 books with no recorded year match neither
 * filter and are only reachable unfiltered, which is the honest behaviour: the data does not
 * know where they go. */
export type Era = 'classic' | 'contemporary';
export const ERA_SPLIT = 1970;
export const eraLabel: Record<Era, string> = {
  classic: `Classics (before ${ERA_SPLIT})`,
  contemporary: `Contemporary (${ERA_SPLIT} on)`,
};
export const ERAS: Era[] = ['classic', 'contemporary'];

export const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

export interface ShelfFilters {
  q?: string;
  shelf?: Shelf;
  letter?: string;
  era?: Era;
  /** Exact tier. Unset means grab + good, which is the browse default: the long shots are
   *  3,171 of 3,610 and a list that long is not a list. Search always covers them regardless. */
  tier?: Tier;
}

export function shelfHref(f: ShelfFilters, patch: Partial<ShelfFilters>) {
  const next = { ...f, ...patch };
  const p = new URLSearchParams();
  if (next.q) p.set('q', next.q);
  if (next.shelf) p.set('shelf', next.shelf);
  if (next.letter) p.set('letter', next.letter);
  if (next.era) p.set('era', next.era);
  if (next.tier) p.set('tier', next.tier);
  const s = p.toString();
  return s ? `/reading/shelf?${s}` : '/reading/shelf';
}
