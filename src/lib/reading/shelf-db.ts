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

/* ---------------------------------------------------------------------------------------------
 * The queries are BUILT here and RUN below, which is the whole point of splitting them out.
 *
 * A `sql` tagged template that is never awaited is a lazy query object, so these functions cost
 * nothing until something executes them. That is what lets `getShelfBundle` hand all nine to
 * `sql.transaction()` and get one HTTP round trip to Neon instead of nine.
 *
 * Why that matters, measured 2026-08-24. Vercel bills Provisioned Memory for the whole time an
 * instance is alive INCLUDING time spent waiting on I/O, and only bills Active CPU while code is
 * actually running. This page's Active CPU was 13ms per request against a 153ms P75 time to first
 * byte: almost all of what it cost was memory held open waiting for Postgres. Nine concurrent
 * round trips in a `Promise.all` are only as fast as the slowest of them, but every one of them
 * holds its own connection and its own slice of that wait open.
 *
 * The SQL text below is unchanged from when each query lived in its own exported function. That is
 * deliberate: this is a change to how many times the network is crossed, not to what is asked.
 * ------------------------------------------------------------------------------------------- */

const qEntries = (f: ShelfFilters) => {
  const w = where(f);
  /* Postgres sorts NULLS LAST on ASC and FIRST on DESC by default, which would put every book
   * with no recorded page count at the top of "shortest first" and every book with no year at the
   * top of "newest". Both are the exact opposite of useful, so unknowns are pushed to the back of
   * whichever direction is being asked for. */
  const sort: Sort = f.sort ?? 'author';
  return sql`
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
  `;
};

const qEntryCount = (f: ShelfFilters) => {
  const w = where(f);
  return sql`
    select count(*)::int n from reading_shelf_entry
     where (${w.like}::text is null or title ilike ${w.like} or author ilike ${w.like} or file_under ilike ${w.like})
       and (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${w.letter}::text is null or letter = ${w.letter})
       and (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
  `;
};

const qLetterCounts = (f: ShelfFilters) => {
  const w = where({ ...f, q: undefined, letter: undefined });
  return sql`
    select letter, count(*)::int n
      from reading_shelf_entry
     where (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
     group by letter
  `;
};

const qTierCounts = (f: ShelfFilters) => {
  const w = where({ ...f, q: undefined, tier: undefined });
  return sql`
    select tier, count(*)::int n
      from reading_shelf_entry
     where (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
     group by tier
  `;
};

const qEraCounts = (f: ShelfFilters) => {
  const w = where({ ...f, q: undefined, era: undefined });
  return sql`
    select
      count(*) filter (where year is not null and year < ${ERA_SPLIT})::int  as classic,
      count(*) filter (where year is not null and year >= ${ERA_SPLIT})::int as contemporary
      from reading_shelf_entry
     where (${f.shelf ?? null}::text is null or shelves @> array[${f.shelf ?? null}]::text[])
       and (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
  `;
};

const qShelfCountsByShelf = (f: ShelfFilters) => {
  const w = where({ ...f, q: undefined, shelf: undefined });
  return sql`
    select s as shelf, count(*)::int n
      from reading_shelf_entry, unnest(shelves) s
     where (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
     group by s
  `;
};

const qShelfCountsAll = (f: ShelfFilters) => {
  const w = where({ ...f, q: undefined, shelf: undefined });
  return sql`
    select count(*)::int n from reading_shelf_entry
     where (${w.tier}::text is null or tier = ${w.tier})
       and (${w.hideLongShots} = false or tier <> 'maybe')
       and (${w.yearMax}::int is null or (year is not null and year <= ${w.yearMax}))
       and (${w.yearMin}::int is null or (year is not null and year >= ${w.yearMin}))
  `;
};

const qLiveness = () => sql`
  select rows, ran_at, error from reading_shelf_sync order by ran_at desc limit 1
`;

/* Lives here rather than in want-db.ts only so it can ride along in the same transaction. The
 * exported `getWantKeys` in want-db.ts is still the one anything outside this page calls. */
const qWantKeys = () => sql`select key from reading_want`;

export interface ShelfBundle {
  entries: ShelfEntry[];
  total: number;
  letterCounts: Record<string, number>;
  tierCounts: Record<string, number>;
  eraCounts: { classic: number; contemporary: number };
  shelfCounts: { all: number; byShelf: Record<string, number> };
  liveness: { rows: number | null; ranAt: string | null; lastError: string | null };
  wantKeys: Set<string>;
}

/** Everything /reading/shelf renders, in ONE round trip to Postgres.
 *
 *  The order of the array below is the order of the destructure, and nothing else ties them
 *  together, so do not reorder one without the other. */
export async function getShelfBundle(f: ShelfFilters): Promise<ShelfBundle> {
  const [
    entryRows, countRows, letterRows, tierRows, eraRows, shelfRows, shelfAllRows, livenessRows, wantRows,
  ] = (await sql.transaction([
    qEntries(f),
    qEntryCount(f),
    qLetterCounts(f),
    qTierCounts(f),
    qEraCounts(f),
    qShelfCountsByShelf(f),
    qShelfCountsAll(f),
    qLiveness(),
    qWantKeys(),
  ], { readOnly: true })) as [
    Row[],
    { n: number }[],
    { letter: string; n: number }[],
    { tier: string; n: number }[],
    { classic: number; contemporary: number }[],
    { shelf: string; n: number }[],
    { n: number }[],
    { rows: number | null; ran_at: string | null; error: string | null }[],
    { key: string }[],
  ];

  const era = eraRows[0];
  const live = livenessRows[0];

  return {
    entries: entryRows.map(toEntry),
    total: countRows[0]?.n ?? 0,
    letterCounts: Object.fromEntries(letterRows.map((r) => [r.letter, r.n])),
    tierCounts: Object.fromEntries(tierRows.map((r) => [r.tier, r.n])),
    eraCounts: { classic: era?.classic ?? 0, contemporary: era?.contemporary ?? 0 },
    shelfCounts: {
      all: shelfAllRows[0]?.n ?? 0,
      byShelf: Object.fromEntries(shelfRows.map((r) => [r.shelf, r.n])),
    },
    liveness: { rows: live?.rows ?? null, ranAt: live?.ran_at ?? null, lastError: live?.error ?? null },
    wantKeys: new Set(wantRows.map((r) => r.key)),
  };
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
