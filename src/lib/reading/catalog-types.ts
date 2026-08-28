/* Shapes for the retired /reading/all catalogue browse, no `server-only`. That page was folded
 * into /reading/shelf on 2026-08-21; what survives here is what /reading/about still needs to
 * list the source lists behind the scores. Same split as queue-types
 * and ./types: this file can be imported by a client component later without dragging the DB
 * client with it. */

import type { Track } from './queue-types';

export type { Track };

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

/* IMPORTED, not declared. This was a byte-identical copy of queue-types.ts's map, and the copy is
 * how the fire emoji survived being removed from one of them: a shared literal in two files is one
 * file going stale. 08-ux-ui P2-3. */
export { trackLabel } from './queue-types';

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
