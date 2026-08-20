import 'server-only';
import { sql } from './queue-db';
import { PAGE_SIZE } from './catalog-types';
import type { CatalogEntry, CatalogFilters, Track } from './catalog-types';

function toEntry(r: {
  key: string; track: Track; title: string; author: string; year: number | null;
  score: string; categories: string[]; lists: string[]; tagged: boolean; pace: string | null;
  pace_note: string | null; pages: number | null; era: string | null; language: string | null;
  mood: string[]; why: string | null;
}): CatalogEntry {
  return {
    key: r.key, track: r.track, title: r.title, author: r.author, year: r.year,
    score: Number(r.score), categories: r.categories, lists: r.lists, tagged: r.tagged,
    pace: r.pace, paceNote: r.pace_note, pages: r.pages, era: r.era, language: r.language,
    mood: r.mood, why: r.why,
  };
}

/** One query, `q ilike both title and author, track and tagged as exact filters, score desc,
 *  paginated. 3,615 rows with no index tuning is fine at this scale; this is a personal catalog,
 *  not a product search box. */
export async function getCatalogPage(f: CatalogFilters): Promise<{ entries: CatalogEntry[]; total: number }> {
  const like = f.q ? `%${f.q}%` : null;
  const rows = (await sql`
    select key, track, title, author, year, score, categories, lists, tagged, pace, pace_note,
           pages, era, language, mood, why
      from reading_catalog_entry
     where (${like}::text is null or title ilike ${like} or author ilike ${like})
       and (${f.track ?? null}::text is null or track = ${f.track ?? null})
       and (${f.tagged ?? false} = false or tagged = true)
     order by score desc, title
     limit ${PAGE_SIZE} offset ${(f.page - 1) * PAGE_SIZE}
  `) as Parameters<typeof toEntry>[0][];

  const [countRow] = (await sql`
    select count(*)::int n from reading_catalog_entry
     where (${like}::text is null or title ilike ${like} or author ilike ${like})
       and (${f.track ?? null}::text is null or track = ${f.track ?? null})
       and (${f.tagged ?? false} = false or tagged = true)
  `) as Array<{ n: number }>;

  return { entries: rows.map(toEntry), total: countRow?.n ?? 0 };
}

export async function getCatalogTrackCounts(): Promise<Record<Track, number>> {
  const rows = (await sql`select track, count(*)::int n from reading_catalog_entry group by track`) as Array<{ track: Track; n: number }>;
  const out = { canon: 0, current: 0, nonfiction: 0, genre: 0 } as Record<Track, number>;
  for (const r of rows) out[r.track] = r.n;
  return out;
}

export interface CatalogLiveness {
  lastOkAt: string | null;
  totalRows: number | null;
  lastError: string | null;
}

export async function getCatalogLiveness(): Promise<CatalogLiveness> {
  const [ok] = (await sql`
    select ran_at, rows from reading_catalog_sync where ok = true order by ran_at desc limit 1
  `) as Array<{ ran_at: unknown; rows: number }>;
  const [bad] = (await sql`
    select error from reading_catalog_sync where ok = false order by ran_at desc limit 1
  `) as Array<{ error: string | null }>;
  return {
    lastOkAt: ok?.ran_at instanceof Date ? ok.ran_at.toISOString() : null,
    totalRows: ok?.rows ?? null,
    lastError: bad?.error ?? null,
  };
}
