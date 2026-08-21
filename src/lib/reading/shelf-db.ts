import 'server-only';
import { sql } from './queue-db';
import type { Shelf, ShelfEntry, ShelfFilters, Tier } from './shelf-types';

type Row = {
  key: string; title: string; author: string; file_under: string; letter: string;
  year: number | null; score: string; honours: number; tier: Tier;
  shelves: Shelf[]; lists: string[]; status: ShelfEntry['status'];
};

const toEntry = (r: Row): ShelfEntry => ({
  key: r.key, title: r.title, author: r.author, fileUnder: r.file_under, letter: r.letter,
  year: r.year, score: Number(r.score), honours: r.honours, tier: r.tier,
  shelves: r.shelves, lists: r.lists, status: r.status,
});

/* Every query here shares one predicate, so it lives in one place. Getting the browse list and
 * the per-letter counts to disagree would be worse than either being wrong: the rail would
 * promise books that the list then does not show.
 *
 * Two rules inside it are the page's whole behaviour:
 *   - a search covers the long shots even when the browse list hides them, because the shop has
 *     things no list ranks and "not on any list" is still a real answer to give at the shelf;
 *   - a letter filter is ignored while searching, since he is checking a spine in his hand
 *     rather than walking the alphabet. */
const where = (f: ShelfFilters) => {
  const like = f.q ? `%${f.q}%` : null;
  const searching = !!f.q;
  return { like, searching, letter: searching ? null : (f.letter ?? null) };
};

export async function getShelfPage(f: ShelfFilters): Promise<{ entries: ShelfEntry[]; total: number }> {
  const { like, searching, letter } = where(f);
  const includeLong = f.long || searching;

  const rows = (await sql`
    select key, title, author, file_under, letter, year, score, honours, tier, shelves, lists, status
      from reading_shelf_entry
     where (${like}::text is null or title ilike ${like} or author ilike ${like} or file_under ilike ${like})
       and (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${letter}::text is null or letter = ${letter})
       and (${includeLong} = true or tier <> 'maybe')
     order by file_under, title
     limit 400
  `) as Row[];

  const [countRow] = (await sql`
    select count(*)::int n from reading_shelf_entry
     where (${like}::text is null or title ilike ${like} or author ilike ${like} or file_under ilike ${like})
       and (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${letter}::text is null or letter = ${letter})
       and (${includeLong} = true or tier <> 'maybe')
  `) as { n: number }[];

  return { entries: rows.map(toEntry), total: countRow?.n ?? 0 };
}

/** Books per letter under the CURRENT section and long-shot setting, so the rail can show him
 *  what is actually behind each letter before he walks to it, and grey out the empty ones.
 *  Deliberately ignores `letter` itself: the rail must not collapse to the letter already
 *  selected. Ignores `q` too, since during a search the rail is not what he is using. */
export async function getLetterCounts(f: ShelfFilters): Promise<Record<string, number>> {
  const rows = (await sql`
    select letter, count(*)::int n
      from reading_shelf_entry
     where (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${f.long ?? false} = true or tier <> 'maybe')
     group by letter
  `) as { letter: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.letter, r.n]));
}

/** Counts for the section chips, under the current long-shot setting only. A book can sit on
 *  two shelves (a Pulitzer-winning crime novel is in both), so these deliberately sum to more
 *  than the total and the page must not present them as a partition. */
export async function getShelfCounts(f: ShelfFilters): Promise<{ all: number; byShelf: Record<string, number> }> {
  const rows = (await sql`
    select s as shelf, count(*)::int n
      from reading_shelf_entry, unnest(shelves) s
     where (${f.long ?? false} = true or tier <> 'maybe')
     group by s
  `) as { shelf: string; n: number }[];
  const [allRow] = (await sql`
    select count(*)::int n from reading_shelf_entry
     where (${f.long ?? false} = true or tier <> 'maybe')
  `) as { n: number }[];
  return { all: allRow?.n ?? 0, byShelf: Object.fromEntries(rows.map((r) => [r.shelf, r.n])) };
}

export async function getShelfLiveness(): Promise<{ rows: number | null; ranAt: string | null; lastError: string | null }> {
  const [r] = (await sql`
    select rows, ran_at, error from reading_shelf_sync order by ran_at desc limit 1
  `) as { rows: number | null; ran_at: string | null; error: string | null }[];
  return { rows: r?.rows ?? null, ranAt: r?.ran_at ?? null, lastError: r?.error ?? null };
}
