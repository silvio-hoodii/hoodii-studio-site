import Link from 'next/link';
import { getLetterCounts, getShelfCounts, getShelfLiveness, getShelfPage } from '@/lib/reading/shelf-db';
import { LETTERS, SHELVES, shelfHref, shelfLabel, tierLabel } from '@/lib/reading/shelf-types';
import type { Shelf, ShelfEntry, ShelfFilters } from '@/lib/reading/shelf-types';

/* noindex,nofollow and in robots.ts's Disallow, same pair /reading/all and /kitchen/find carry:
 * this is a filter surface over thousands of rows, queried fresh on every hit, and a crawler
 * walking its section-by-letter link grid would burn real Fluid CPU doing it. */
export const metadata = {
  title: 'Reading: Shelf check',
  description: 'Look up a spine in a second-hand shop, by the section and the author letter it is filed under.',
  alternates: { canonical: '/reading/shelf' },
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/* Built 2026-08-21, standing in a used bookshop, because the ten-book queue answered the wrong
 * question there. A queue says what to read next. In a shop the question is "I am looking at
 * this spine, is it worth pulling", asked a few hundred times an hour against whatever that shop
 * happens to have on the day, and no ranked ten can answer it.
 *
 * So the navigation copies the SHOP, not the library: section first, then author letter, because
 * that is the order the aisles are physically walked. The alphabet rail carries a count per
 * letter so a letter can be skipped from across the room rather than walked to and found empty.
 */
export default async function ShelfCheck({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; shelf?: string; letter?: string; long?: string }>;
}) {
  const sp = await searchParams;
  const letter = sp.letter && LETTERS.includes(sp.letter) ? sp.letter : undefined;
  const filters: ShelfFilters = {
    q: sp.q?.trim() || undefined,
    shelf: SHELVES.includes(sp.shelf as Shelf) ? (sp.shelf as Shelf) : undefined,
    letter,
    long: sp.long === '1',
  };

  const [{ entries, total }, letterCounts, shelfCounts, liveness] = await Promise.all([
    getShelfPage(filters), getLetterCounts(filters), getShelfCounts(filters), getShelfLiveness(),
  ]);

  const searching = !!filters.q;
  const groups: { letter: string; books: ShelfEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.letter === e.letter) last.books.push(e);
    else groups.push({ letter: e.letter, books: [e] });
  }

  return (
    <div className="reading">
      <p className="surf-nav">
        <Link className="rtab" href="/reading">Next up</Link>
        <Link className="rtab" href="/reading/all">All books</Link>
        <span className="rtab on">Shelf check</span>
        <Link className="rtab" href="/reading/finished">Finished</Link>
      </p>

      <h1>Shelf check</h1>
      <p className="blurb">
        For standing in a second-hand shop. Pick the section you are in, then the letter of the
        shelf, and compare the spines against the list. Or type what is in your hand.
      </p>

      <form action="/reading/shelf" method="get" className="csearch">
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="Author surname or title"
          aria-label="Search by author surname or title"
          enterKeyHint="search"
        />
        {filters.shelf && <input type="hidden" name="shelf" value={filters.shelf} />}
        {filters.long && <input type="hidden" name="long" value="1" />}
        <button type="submit" className="btn primary">Search</button>
      </form>

      <div className="chiprow" role="group" aria-label="Shop section">
        <Link className={`chip ${!filters.shelf ? 'on' : ''}`} href={shelfHref(filters, { shelf: undefined, letter: undefined })}>
          every section ({shelfCounts.all.toLocaleString()})
        </Link>
        {SHELVES.map((s) => (
          <Link
            key={s}
            className={`chip ${filters.shelf === s ? 'on' : ''}`}
            href={shelfHref(filters, { shelf: filters.shelf === s ? undefined : s, letter: undefined })}
          >
            {shelfLabel[s]} ({(shelfCounts.byShelf[s] ?? 0).toLocaleString()})
          </Link>
        ))}
      </div>

      {/* The rail is the actual index, so it gets counts rather than bare letters: a letter with
          nothing behind it is a walk across the shop for nothing. */}
      <div className="shelfrail" role="group" aria-label="Author surname">
        {LETTERS.map((L) => {
          const n = letterCounts[L] ?? 0;
          const on = filters.letter === L;
          if (!n) return <span key={L} className="lt empty" aria-hidden="true">{L}</span>;
          return (
            <Link
              key={L}
              className={`lt ${on ? 'on' : ''}`}
              href={shelfHref(filters, { letter: on ? undefined : L, q: undefined })}
              aria-label={`${L}, ${n} book${n === 1 ? '' : 's'}`}
            >
              {L}<span className="ltn">{n}</span>
            </Link>
          );
        })}
      </div>

      <div className="chiprow" role="group" aria-label="Depth">
        <Link className={`chip ${filters.long ? 'on' : ''}`} href={shelfHref(filters, { long: !filters.long })}>
          include long shots
        </Link>
      </div>

      <p className="stat">
        <span className="tnum">{total.toLocaleString()}</span>
        {searching
          ? ` match${total === 1 ? '' : 'es'} "${filters.q}"`
          : filters.letter
            ? ` under ${filters.letter}${filters.shelf ? ` in ${shelfLabel[filters.shelf].toLowerCase()}` : ''}`
            : ' worth pulling'}
        {!filters.long && !searching && <span className="why"> · long shots hidden</span>}
        {total > 400 && <span className="why"> · showing the first 400, pick a letter to narrow it</span>}
      </p>

      {entries.length === 0 && (
        <h2 className="sec">
          {searching
            ? `nothing matches "${filters.q}" in the ${(liveness.rows ?? 0).toLocaleString()} books on record`
            : 'nothing here, try another letter or switch on long shots'}
        </h2>
      )}

      {groups.map((g) => (
        <section key={g.letter}>
          <h2 className="sec shelfletter">{g.letter}</h2>
          {g.books.map((b) => <ShelfRow key={b.key} entry={b} showShelf={!filters.shelf} />)}
        </section>
      ))}

      <p className="src">
        <strong>grab</strong> cleared several different kinds of vetting, a jury and critics and
        readers landing on it separately. <strong>good</strong> cleared more than one honour.
        <strong> long shot</strong> cleared exactly one, usually a broad nominee archive, so it is
        a punt rather than a recommendation.
      </p>
      <p className="src"><Link href="/reading/about">How this works and where the numbers come from</Link></p>
    </div>
  );
}

const STATUS_LABEL = { read: 'read it', queued: 'on your queue', seen: 'seen in a shop' } as const;

function ShelfRow({ entry, showShelf }: { entry: ShelfEntry; showShelf: boolean }) {
  return (
    <div className="shelfrow">
      <span className={`tierbadge t-${entry.tier}`}>{tierLabel[entry.tier]}</span>
      <span className="shelftitle">
        {entry.title}
        {entry.status && <span className="ownflag">{STATUS_LABEL[entry.status]}</span>}
      </span>
      <span className="shelfby">
        <strong>{entry.fileUnder}</strong> · {entry.author}{entry.year ? ` · ${entry.year}` : ''}
      </span>
      <span className="shelfmeta">
        {showShelf && entry.shelves.map((s) => (
          <span key={s} className="shelfchip">{shelfLabel[s]}</span>
        ))}
        {entry.lists.length > 0 && <span className="shelfwhy">{entry.lists.join(' / ')}</span>}
      </span>
    </div>
  );
}
