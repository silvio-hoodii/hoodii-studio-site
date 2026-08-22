import 'server-only';
import { sql } from './queue-db';
import { ERA_SPLIT, PAGE_SIZE } from './shelf-types';
import type { Shelf, ShelfEntry, ShelfFilters, Sort, Tier } from './shelf-types';

type Row = {
  key: string; title: string; author: string; file_under: string; letter: string;
  year: number | null; score: string; honours: number; tier: Tier;
  shelves: Shelf[]; lists: string[]; status: ShelfEntry['status'];
  pages: number | null; pace: string | null;
  cover_url: string | null; description: string | null;
  rating: string | null; rating_count: number | null; subjects: string[];
};

const toEntry = (r: Row): ShelfEntry => ({
  key: r.key, title: r.title, author: r.author, fileUnder: r.file_under, letter: r.letter,
  year: r.year, score: Number(r.score), honours: r.honours, tier: r.tier,
  shelves: r.shelves, lists: r.lists, status: r.status,
  pages: r.pages, pace: r.pace,
  cover: r.cover_url, description: r.description,
  rating: r.rating == null ? null : Number(r.rating),
  ratingCount: r.rating_count, subjects: r.subjects ?? [],
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
  return {
    like,
    searching,
    letter: searching ? null : (f.letter ?? null),
    // Era is a year range, not a stored column, so the 96 books with no recorded year match
    // neither side rather than being silently swept into one.
    yearMax: f.era === 'classic' ? ERA_SPLIT - 1 : null,
    yearMin: f.era === 'contemporary' ? ERA_SPLIT : null,
    // An explicit tier wins. With none set, browsing shows grab + good and a search shows
    // everything, because at the shelf "it is on no list at all" is still a real answer.
    tier: f.tier ?? null,
    hideLongShots: !f.tier && !searching,
  };
};

export async function getShelfPage(f: ShelfFilters): Promise<{ entries: ShelfEntry[]; total: number }> {
  const w = where(f);
  /* Postgres sorts NULLS LAST on ASC and FIRST on DESC by default, which would put every book
   * with no recorded page count at the top of "shortest first" and every book with no year at the
   * top of "newest". Both are the exact opposite of useful, so unknowns are pushed to the back of
   * whichever direction is being asked for. */
  const sort: Sort = f.sort ?? 'author';

  const rows = (await sql`
    select key, title, author, file_under, letter, year, score, honours, tier, shelves, lists, status,
           pages, pace, cover_url, description, rating, rating_count, subjects
      from reading_shelf_entry
     where (${w.like}::text is null or title ilike ${w.like} or author ilike ${w.like} or file_under ilike ${w.like})
       and (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${w.letter}::text is null or letter = ${w.letter})
       and (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
     order by
       case when ${sort} = 'author' then file_under end asc nulls last,
       case when ${sort} = 'best'   then score      end desc nulls last,
       case when ${sort} = 'short'  then pages      end asc  nulls last,
       case when ${sort} = 'loved' and rating_count >= 5 then rating end desc nulls last,
       case when ${sort} = 'new'    then year       end desc nulls last,
       case when ${sort} = 'old'    then year       end asc  nulls last,
       title
     limit ${PAGE_SIZE} offset ${((f.page ?? 1) - 1) * PAGE_SIZE}
  `) as Row[];

  const [countRow] = (await sql`
    select count(*)::int n from reading_shelf_entry
     where (${w.like}::text is null or title ilike ${w.like} or author ilike ${w.like} or file_under ilike ${w.like})
       and (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${w.letter}::text is null or letter = ${w.letter})
       and (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
  `) as { n: number }[];

  return { entries: rows.map(toEntry), total: countRow?.n ?? 0 };
}

/** Books per letter under the CURRENT section and long-shot setting, so the rail can show him
 *  what is actually behind each letter before he walks to it, and grey out the empty ones.
 *  Deliberately ignores `letter` itself: the rail must not collapse to the letter already
 *  selected. Ignores `q` too, since during a search the rail is not what he is using. */
export async function getLetterCounts(f: ShelfFilters): Promise<Record<string, number>> {
  const w = where({ ...f, q: undefined, letter: undefined });
  const rows = (await sql`
    select letter, count(*)::int n
      from reading_shelf_entry
     where (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
     group by letter
  `) as { letter: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.letter, r.n]));
}

/** Counts for the tier chips, under the current section and era but ignoring tier itself, so a
 *  chip always shows what selecting it would give rather than collapsing to the current pick. */
export async function getTierCounts(f: ShelfFilters): Promise<Record<string, number>> {
  const w = where({ ...f, q: undefined, tier: undefined });
  const rows = (await sql`
    select tier, count(*)::int n
      from reading_shelf_entry
     where (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
     group by tier
  `) as { tier: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.tier, r.n]));
}

/** Counts for the era chips, ignoring era itself for the same reason. */
export async function getEraCounts(f: ShelfFilters): Promise<{ classic: number; contemporary: number }> {
  const w = where({ ...f, q: undefined, era: undefined });
  const [r] = (await sql`
    select
      count(*) filter (where year is not null and year < ${ERA_SPLIT})::int  as classic,
      count(*) filter (where year is not null and year >= ${ERA_SPLIT})::int as contemporary
      from reading_shelf_entry
     where (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
  `) as { classic: number; contemporary: number }[];
  return { classic: r?.classic ?? 0, contemporary: r?.contemporary ?? 0 };
}

/** Counts for the section chips, under the current long-shot setting only. A book can sit on
 *  two shelves (a Pulitzer-winning crime novel is in both), so these deliberately sum to more
 *  than the total and the page must not present them as a partition. */
export async function getShelfCounts(f: ShelfFilters): Promise<{ all: number; byShelf: Record<string, number> }> {
  const w = where({ ...f, q: undefined, shelf: undefined });
  const rows = (await sql`
    select s as shelf, count(*)::int n
      from reading_shelf_entry, unnest(shelves) s
     where (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
     group by s
  `) as { shelf: string; n: number }[];
  const [allRow] = (await sql`
    select count(*)::int n from reading_shelf_entry
     where (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
  `) as { n: number }[];
  return { all: allRow?.n ?? 0, byShelf: Object.fromEntries(rows.map((r) => [r.shelf, r.n])) };
}

export async function getShelfLiveness(): Promise<{ rows: number | null; ranAt: string | null; lastError: string | null }> {
  const [r] = (await sql`
    select rows, ran_at, error from reading_shelf_sync order by ran_at desc limit 1
  `) as { rows: number | null; ran_at: string | null; error: string | null }[];
  return { rows: r?.rows ?? null, ranAt: r?.ran_at ?? null, lastError: r?.error ?? null };
}

/** Front-door numbers. Computed, never written down: the hub's reading row once carried a
 *  hand-typed line describing a queue feature that did not exist yet, and it read perfectly
 *  plausibly until someone opened the page. */
export async function getShelfStats(): Promise<{ total: number; worth: number }> {
  const [r] = (await sql`
    select count(*)::int total,
           count(*) filter (where tier <> 'maybe')::int worth
      from reading_shelf_entry
  `) as { total: number; worth: number }[];
  return { total: r?.total ?? 0, worth: r?.worth ?? 0 };
}
