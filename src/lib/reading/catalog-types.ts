/* Shapes for the full catalog browse (/reading/all), no `server-only`. Same split as queue-types
 * and ./types: this file can be imported by a client component later without dragging the DB
 * client with it. */

export type Track = 'canon' | 'current' | 'nonfiction' | 'genre';

export interface CatalogEntry {
  key: string;
  track: Track;
  title: string;
  author: string;
  year: number | null;
  score: number;
  categories: string[];
  lists: string[];
  tagged: boolean;
  pace: string | null;
  paceNote: string | null;
  pages: number | null;
  era: string | null;
  language: string | null;
  mood: string[];
  why: string | null;
}

export const trackLabel: Record<Track, string> = {
  canon: 'canon', current: '🔥 current', nonfiction: 'non-fiction', genre: 'genre',
};

export interface CatalogFilters {
  q?: string;
  track?: Track;
  tagged?: boolean;
  page: number;
}

const PAGE_SIZE = 50;
export { PAGE_SIZE };

/** Any filter change resets to page 1 unless the caller explicitly passes a page (pagination
 *  links do; filter/search/chip links never do), so picking a new filter never lands you on a
 *  page number that filter doesn't have. */
export function catalogHref(f: CatalogFilters, patch: Partial<CatalogFilters>) {
  const next = { ...f, ...patch, page: patch.page ?? 1 };
  const p = new URLSearchParams();
  if (next.q) p.set('q', next.q);
  if (next.track) p.set('track', next.track);
  if (next.tagged) p.set('tagged', '1');
  if (next.page && next.page > 1) p.set('page', String(next.page));
  const s = p.toString();
  return s ? `/reading/all?${s}` : '/reading/all';
}
