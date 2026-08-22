import Link from 'next/link';
import { getEraCounts, getLetterCounts, getShelfCounts, getShelfLiveness, getShelfPage, getTierCounts } from '@/lib/reading/shelf-db';
import {
  activeFilterCount, ERAS, LETTERS, SHELVES, SORTS,
  eraLabel, shelfHref, shelfLabel, sortLabel, sortNote, tierChip, tierLabel, tierMeaning, TIERS,
} from '@/lib/reading/shelf-types';
import type { Era, Shelf, ShelfEntry, ShelfFilters, Sort, Tier } from '@/lib/reading/shelf-types';

/* noindex,nofollow and in robots.ts's Disallow, same pair /reading/all and /kitchen/find carry:
 * this is a filter surface over thousands of rows, queried fresh on every hit, and a crawler
 * walking its section-by-letter link grid would burn real Fluid CPU doing it. */
export const metadata = {
  title: 'Reading: Shelf check',
  description: 'Look up a spine in a shop or a library, or browse for something to read next.',
  alternates: { canonical: '/reading/shelf' },
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/* Built 2026-08-21 standing in a second-hand shop, redesigned the same night after looking at how
 * the StoryGraph and the Calgary Public Library catalogue actually lay this out. Both converge on
 * the same shape, and ours did not match it:
 *
 *     [ Filters (2) ]                          [ Sort: Author A to Z ]
 *     154 books
 *
 * ONE collapsed filter control and ONE sort control, then results. The first version put three
 * chip rows and a 27-cell alphabet permanently on screen, so about 700px of controls stood between
 * the page and the first book, and there was no sort at all.
 *
 * The sort doubles as a MODE, which is the real point. Two different jobs were being served badly
 * by one layout: "I am holding this spine, is it worth pulling" wants author order, because that
 * is the physical order of a shelf. "I am in the mood to find something" wants best or shortest
 * first, and there the alphabet is furniture. So the letter rail renders only in author order.
 *
 * Still no client JS: <details> gives a real disclosure for the sort menu, and the filter panel's
 * open state rides in the URL so it does not slam shut on every filter click.
 */
export default async function ShelfCheck({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; shelf?: string; letter?: string; tier?: string; era?: string; sort?: string; open?: string }>;
}) {
  const sp = await searchParams;
  const filters: ShelfFilters = {
    q: sp.q?.trim() || undefined,
    shelf: SHELVES.includes(sp.shelf as Shelf) ? (sp.shelf as Shelf) : undefined,
    letter: sp.letter && LETTERS.includes(sp.letter) ? sp.letter : undefined,
    tier: TIERS.includes(sp.tier as Tier) ? (sp.tier as Tier) : undefined,
    era: ERAS.includes(sp.era as Era) ? (sp.era as Era) : undefined,
    sort: SORTS.includes(sp.sort as Sort) ? (sp.sort as Sort) : 'author',
    open: sp.open === '1',
  };
  const sort = filters.sort ?? 'author';

  const [{ entries, total }, letterCounts, shelfCounts, tierCounts, eraCounts, liveness] = await Promise.all([
    getShelfPage(filters), getLetterCounts(filters), getShelfCounts(filters),
    getTierCounts(filters), getEraCounts(filters), getShelfLiveness(),
  ]);

  const searching = !!filters.q;
  const nFilters = activeFilterCount(filters);
  const byLetter = sort === 'author' && !searching;

  const groups: { letter: string; books: ShelfEntry[] }[] = [];
  if (byLetter) {
    for (const e of entries) {
      const last = groups[groups.length - 1];
      if (last && last.letter === e.letter) last.books.push(e);
      else groups.push({ letter: e.letter, books: [e] });
    }
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
        Is this spine worth pulling? Search what is in your hand, or sort by what you are in the
        mood for.
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
        {filters.tier && <input type="hidden" name="tier" value={filters.tier} />}
        {filters.era && <input type="hidden" name="era" value={filters.era} />}
        {sort !== 'author' && <input type="hidden" name="sort" value={sort} />}
        <button type="submit" className="btn primary">Search</button>
      </form>

      {/* The two controls, side by side, the way both reference catalogues do it. */}
      <div className="toolbar">
        <Link className={`toolbtn ${nFilters ? 'on' : ''}`} href={shelfHref(filters, { open: !filters.open })}>
          Filters{nFilters > 0 && <span className="badge">{nFilters}</span>}
        </Link>
        <details className="sortbox">
          <summary>
            <span className="k">Sort</span>
            <span className="v">{sortLabel[sort]}</span>
          </summary>
          <div className="sortmenu">
            {SORTS.map((s) => (
              <Link key={s} className={`sortopt ${s === sort ? 'on' : ''}`} href={shelfHref(filters, { sort: s })}>
                <span className="so-name">{sortLabel[s]}</span>
                <span className="so-note">{sortNote[s]}</span>
              </Link>
            ))}
          </div>
        </details>
      </div>

      {filters.open && (
        <div className="filterpanel">
          <p className="fp-label">Section</p>
          <div className="chiprow">
            <Link className={`chip ${!filters.shelf ? 'on' : ''}`} href={shelfHref(filters, { shelf: undefined, letter: undefined })}>
              every section ({shelfCounts.all.toLocaleString()})
            </Link>
            {SHELVES.map((s) => (
              <Link key={s} className={`chip ${filters.shelf === s ? 'on' : ''}`}
                href={shelfHref(filters, { shelf: filters.shelf === s ? undefined : s, letter: undefined })}>
                {shelfLabel[s]} ({(shelfCounts.byShelf[s] ?? 0).toLocaleString()})
              </Link>
            ))}
          </div>

          <p className="fp-label">How well vetted</p>
          <div className="chiprow">
            <Link className={`chip ${!filters.tier ? 'on' : ''}`} href={shelfHref(filters, { tier: undefined })}>
              worth pulling ({((tierCounts.grab ?? 0) + (tierCounts.good ?? 0)).toLocaleString()})
            </Link>
            {TIERS.map((t) => (
              <Link key={t} className={`chip chip-${t} ${filters.tier === t ? 'on' : ''}`}
                href={shelfHref(filters, { tier: filters.tier === t ? undefined : t })}>
                {tierChip[t]} ({(tierCounts[t] ?? 0).toLocaleString()})
              </Link>
            ))}
          </div>

          <p className="fp-label">Era</p>
          <div className="chiprow">
            <Link className={`chip ${!filters.era ? 'on' : ''}`} href={shelfHref(filters, { era: undefined })}>any year</Link>
            {ERAS.map((e) => (
              <Link key={e} className={`chip ${filters.era === e ? 'on' : ''}`}
                href={shelfHref(filters, { era: filters.era === e ? undefined : e })}>
                {eraLabel[e]} ({eraCounts[e].toLocaleString()})
              </Link>
            ))}
          </div>

          {nFilters > 0 && (
            <p className="fp-clear">
              <Link href={shelfHref({ sort, open: true }, {})}>Clear all filters</Link>
            </p>
          )}
        </div>
      )}

      {/* 27 controls that only mean something in author order. In any other sort they are noise,
          so they are not rendered at all rather than sitting there greyed out. */}
      {byLetter && (
        <div className="shelfrail" role="group" aria-label="Author surname">
          {LETTERS.map((L) => {
            const n = letterCounts[L] ?? 0;
            const on = filters.letter === L;
            if (!n) return <span key={L} className="lt empty" aria-hidden="true">{L}</span>;
            return (
              <Link key={L} className={`lt ${on ? 'on' : ''}`}
                href={shelfHref(filters, { letter: on ? undefined : L, q: undefined })}
                aria-label={`${L}, ${n} book${n === 1 ? '' : 's'}`}>
                {L}<span className="ltn">{n}</span>
              </Link>
            );
          })}
        </div>
      )}

      <p className="stat">
        <span className="tnum">{total.toLocaleString()}</span>
        {searching
          ? ` match${total === 1 ? '' : 'es'} "${filters.q}"`
          : filters.letter ? ` filed under ${filters.letter}` : ' books'}
        {filters.shelf && <span className="why"> · {shelfLabel[filters.shelf].toLowerCase()}</span>}
        {filters.era && <span className="why"> · {eraLabel[filters.era].toLowerCase()}</span>}
        {!filters.tier && !searching && <span className="why"> · long shots hidden</span>}
        {total > 400 && <span className="why"> · first 400 shown, narrow it to see the rest</span>}
      </p>

      {filters.tier && <p className="tiernote"><strong>{tierLabel[filters.tier]}</strong> {tierMeaning[filters.tier]}</p>}

      {entries.length === 0 && (
        <h2 className="sec">
          {searching
            ? `nothing matches "${filters.q}" in the ${(liveness.rows ?? 0).toLocaleString()} books on record`
            : 'nothing here. Open Filters and widen it, or clear the letter.'}
        </h2>
      )}

      {byLetter
        ? groups.map((g) => (
          <section key={g.letter}>
            <h2 className="sec shelfletter">{g.letter}</h2>
            {g.books.map((b) => <ShelfRow key={b.key} entry={b} showShelf={!filters.shelf} />)}
          </section>
        ))
        : entries.map((b) => <ShelfRow key={b.key} entry={b} showShelf={!filters.shelf} />)}

      <dl className="tierlegend">
        {TIERS.map((t) => (
          <div key={t}>
            <dt><span className={`tierbadge t-${t}`}>{tierLabel[t]}</span></dt>
            <dd>{tierMeaning[t]}</dd>
          </div>
        ))}
      </dl>
      <p className="src">
        Ranked within a section, not across them: general fiction is covered by thirteen source
        lists and crime by one, so a crime novel competing against literary fiction on one scale
        made every Edgar winner look like a long shot. A <strong>grab</strong> in mystery means
        best of the mysteries.
      </p>
      <p className="src"><Link href="/reading/about">How this works and where the numbers come from</Link></p>
    </div>
  );
}

const STATUS_LABEL = { read: 'read it', queued: 'on your queue', seen: 'seen in a shop' } as const;

function ShelfRow({ entry, showShelf }: { entry: ShelfEntry; showShelf: boolean }) {
  /* The facts line is what both reference catalogues put under the title and we did not: how long
   * it is and how it reads. Only about 5% of the pool carries those, so each part is omitted when
   * absent rather than rendered as "unknown" on nearly every row. */
  const facts = [
    entry.pages ? `${entry.pages}pp` : null,
    entry.pace,
    entry.year ? String(entry.year) : null,
  ].filter(Boolean);

  return (
    <div className="shelfrow">
      <span className={`tierbadge t-${entry.tier}`}>{tierLabel[entry.tier]}</span>
      <span className="shelftitle">
        {entry.title}
        {entry.status && <span className="ownflag">{STATUS_LABEL[entry.status]}</span>}
      </span>
      <span className="shelfby">
        <strong>{entry.fileUnder}</strong> · {entry.author}
        {facts.length > 0 && <span className="facts"> · {facts.join(' · ')}</span>}
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
