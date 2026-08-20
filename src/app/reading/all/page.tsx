import Link from 'next/link';
import { getCatalogLiveness, getCatalogPage, getCatalogTrackCounts } from '@/lib/reading/catalog-db';
import { catalogHref, PAGE_SIZE, trackLabel } from '@/lib/reading/catalog-types';
import type { CatalogEntry, CatalogFilters, Track } from '@/lib/reading/catalog-types';

/* noindex,nofollow, and this route is ALSO in robots.ts's Disallow -- the same "belt and braces"
 * pair /kitchen/find should have shipped with from day one (found missing 2026-08-20, after a bot
 * hammered that page's own combinatorial filter links and burned real Fluid CPU doing it). This
 * page has the identical shape: real search/filter chips over thousands of rows, freshly queried
 * every hit, no cache. Shipping it with the same gap /kitchen/find had would just be the second
 * instance of a mistake already found once. */
export const metadata = {
  title: 'Reading: All books',
  description: 'Everything the canon and current engines have scored that I have not queued or read yet.',
  alternates: { canonical: '/reading/all' },
  robots: { index: false, follow: false },
};

/* Same reason /reading and /swim carry this: the data lives in Neon and only reflects what
 * content/reading/sync-catalog.mjs last pushed. Static prerendering would bake page 1 of the
 * default filters in at build time and every other query would 404 into stale HTML. */
export const dynamic = 'force-dynamic';

const TRACKS: Track[] = ['canon', 'current', 'nonfiction', 'genre'];

/* The 3,600-plus books the ranking engines know about that are not in the ten and not already
 * read -- everything QUEUE.md deliberately does not show you at once. README's own words: "You are
 * never meant to see the whole backlog." This page is the one place that promise gets broken on
 * purpose, so it earns a search box and real filters rather than a wall of rows: same reasoning
 * /kitchen/find already worked out ("2,586 rows with no filter is not a menu, it is a haystack"),
 * same mechanism too -- links and one GET form, no client JS, works before hydration, bookmarkable.
 *
 * Untagged books (about 90% of this catalog -- see ReadingOS/README.md "Deepening") still get a
 * row, honestly marked "not detailed yet" rather than hidden. scripts/add.mjs would refuse to put
 * one of these in the queue until it is tagged, but that is a fact about what's QUEUE-ELIGIBLE,
 * not a fact about whether it exists or is worth knowing about.
 */
export default async function ReadingCatalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; track?: string; tagged?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filters: CatalogFilters = {
    q: sp.q || undefined,
    track: TRACKS.includes(sp.track as Track) ? (sp.track as Track) : undefined,
    tagged: sp.tagged === '1',
    page: Math.max(1, Number(sp.page) || 1),
  };

  const [{ entries, total }, trackCounts, liveness] = await Promise.all([
    getCatalogPage(filters), getCatalogTrackCounts(), getCatalogLiveness(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, filters.page * PAGE_SIZE);

  return (
    <div className="reading">
      <p className="surf-nav">
        <Link className="rtab" href="/reading">Next up</Link>
        <span className="rtab on">All books</span>
        <Link className="rtab" href="/reading/finished">Finished</Link>
      </p>

      <h1>All books</h1>
      <p className="blurb">
        Everything the canon and current engines have scored that I haven&apos;t queued or read yet.
        Ranked, searchable, and honest about which ones aren&apos;t detailed enough to actually
        queue.
      </p>
      {liveness.totalRows != null && (
        <p className="stat">
          <span className="tnum">{liveness.totalRows.toLocaleString()}</span> books tracked
          {liveness.lastError && <span className="why"> · last sync failed: {liveness.lastError}</span>}
        </p>
      )}

      <form action="/reading/all" method="get" className="csearch">
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="Search by title or author"
          aria-label="Search books by title or author"
          enterKeyHint="search"
        />
        {filters.track && <input type="hidden" name="track" value={filters.track} />}
        {filters.tagged && <input type="hidden" name="tagged" value="1" />}
        <button type="submit" className="btn primary">Search</button>
      </form>

      <div className="chiprow" role="group" aria-label="Filter by track">
        <Link className={`chip ${!filters.track ? 'on' : ''}`} href={catalogHref(filters, { track: undefined })}>
          all ({Object.values(trackCounts).reduce((a, b) => a + b, 0).toLocaleString()})
        </Link>
        {TRACKS.map((t) => (
          <Link
            key={t}
            className={`chip ${filters.track === t ? 'on' : ''}`}
            href={catalogHref(filters, { track: filters.track === t ? undefined : t })}
          >
            {trackLabel[t]} ({trackCounts[t].toLocaleString()})
          </Link>
        ))}
      </div>
      <div className="chiprow" role="group" aria-label="Detail filter">
        <Link className={`chip ${filters.tagged ? 'on' : ''}`} href={catalogHref(filters, { tagged: !filters.tagged })}>
          detailed only
        </Link>
      </div>

      {total > 0 && (
        <p className="stat">
          <span className="tnum">{from}</span> to <span className="tnum">{to}</span> of <span className="tnum">{total.toLocaleString()}</span>
        </p>
      )}

      {entries.length === 0 && <h2 className="sec">nothing matches those filters</h2>}

      {entries.map((entry) => <CatalogRow key={entry.key} entry={entry} />)}

      {totalPages > 1 && (
        <nav className="pager" aria-label="Pagination">
          {filters.page > 1 && <Link className="chip" href={catalogHref(filters, { page: filters.page - 1 })}>Previous</Link>}
          <span className="pager-pos">Page {filters.page} of {totalPages}</span>
          {filters.page < totalPages && <Link className="chip" href={catalogHref(filters, { page: filters.page + 1 })}>Next</Link>}
        </nav>
      )}
    </div>
  );
}

function CatalogRow({ entry }: { entry: CatalogEntry }) {
  return (
    <details className="qrow">
      <summary>
        <span className="qmain">
          <span className="qt">{entry.title}</span>
          <span className="qa">{entry.author}{entry.year ? ` · ${entry.year}` : ''}</span>
        </span>
        <span className="qmeta">
          <span className="qtrack">{trackLabel[entry.track]}</span>
          <span className="tnum cscore">{entry.score}</span>
          {!entry.tagged && <span className="verdict unset">Not detailed yet</span>}
        </span>
      </summary>
      <div className="body qbody">
        {entry.why
          ? <p className="qwhy">{entry.why}</p>
          : <p className="qwhy qwhy-muted">Not tagged yet. scripts/add.mjs would refuse to queue this until it is: tag it in ReadingOS/data/tags/ to unlock pace, mood, and the actual case for it.</p>}
        {entry.tagged && (
          <p className="qtags">
            {[entry.pace, entry.era, entry.language, entry.pages ? `${entry.pages}pp` : null]
              .filter(Boolean).join(' · ')}
            {entry.mood.length > 0 && <> · {entry.mood.join(', ')}</>}
          </p>
        )}
        {entry.lists.length > 0 && (
          <p className="qtags qlists">on: {entry.lists.join(', ')}</p>
        )}
      </div>
    </details>
  );
}
