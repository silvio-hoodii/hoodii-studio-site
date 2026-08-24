import Link from 'next/link';
import { getShelfBundle } from '@/lib/reading/shelf-db';
import WantButton from './WantButton';
import {
  activeFilterCount, ERAS, LETTERS, PAGE_SIZE, SHELVES, SORTS,
  eraLabel, shelfHref, shelfLabel, sortLabel, sortNote, tierChip, tierLabel, tierMeaning, TIERS,
} from '@/lib/reading/shelf-types';
import type { Era, Shelf, ShelfEntry, ShelfFilters, Sort, Tier } from '@/lib/reading/shelf-types';

/* noindex,nofollow and in robots.ts's Disallow, the same pair /kitchen/find carries:
 * this is a filter surface over thousands of rows, queried fresh on every hit, and a crawler
 * walking its section-by-letter link grid would burn real Fluid CPU doing it. */
export const metadata = {
  title: 'Reading: Browse',
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
  searchParams: Promise<{ q?: string; shelf?: string; letter?: string; tier?: string; era?: string; sort?: string; open?: string; pick?: string; page?: string }>;
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
    page: Math.max(1, Number(sp.page) || 1),
  };
  const sort = filters.sort ?? 'author';

  /* One round trip, not nine. This was a `Promise.all` of seven functions issuing nine separate
   * HTTP queries to Neon; `getShelfBundle` sends the same nine as one transaction. See the note in
   * shelf-db.ts for why the count of round trips is the thing that costs money here rather than
   * the work the queries do. */
  const { entries, total, letterCounts, shelfCounts, tierCounts, eraCounts, liveness, wantKeys } =
    await getShelfBundle(filters);

  /* Surprise me. Picks one book from whatever is currently filtered, which is the point: "give me
   * something" is only useful if it respects "something SHORT, in non-fiction". The seed rides in
   * the URL so the pick is stable on refresh and shareable, and re-rolling is a new link rather
   * than a button that quietly changes what the page said a second ago. */
  const seed = Number(sp.pick) || 0;
  const picked = seed && entries.length ? entries[seed % entries.length] : null;
  const shown = picked ? [picked] : entries;

  const searching = !!filters.q;
  const nFilters = activeFilterCount(filters);
  const byLetter = sort === 'author' && !searching;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const groups: { letter: string; books: ShelfEntry[] }[] = [];
  if (byLetter && !picked) {
    for (const e of shown) {
      const last = groups[groups.length - 1];
      if (last && last.letter === e.letter) last.books.push(e);
      else groups.push({ letter: e.letter, books: [e] });
    }
  }

  return (
    <div className="reading">
      <p className="surf-nav">
        <Link className="rtab" href="/reading">Next up</Link>
        <span className="rtab on">Browse</span>
        <Link className="rtab" href="/reading/want">Want</Link>
        <Link className="rtab" href="/reading/finished">Finished</Link>
      </p>

      <h1>Browse</h1>
      <p className="blurb">
        Every book on record, for two different moments. In a shop or a library: search the spine
        in your hand, or walk the alphabet by author. At home: sort by best, shortest or best
        rated and see what turns up.
        {wantKeys.size > 0 && (
          <> <Link href="/reading/want">{wantKeys.size} saved to your want list</Link>.</>
        )}
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
        {totalPages > 1 && <span className="why"> · page {filters.page} of {totalPages}</span>}
      </p>

      {filters.tier && <p className="tiernote"><strong>{tierLabel[filters.tier]}</strong> {tierMeaning[filters.tier]}</p>}

      {total > 1 && (
        <p className="pickline">
          <Link className="pickbtn" href={pickHref(filters, seed)}>
            {picked ? 'Pick another' : 'Surprise me'}
          </Link>
          {picked && <Link className="pickclear" href={shelfHref(filters, {})}>show all {total.toLocaleString()}</Link>}
        </p>
      )}

      {entries.length === 0 && (
        <h2 className="sec">
          {searching
            ? `nothing matches "${filters.q}" in the ${(liveness.rows ?? 0).toLocaleString()} books on record`
            : 'nothing here. Open Filters and widen it, or clear the letter.'}
        </h2>
      )}

      {byLetter && !picked
        ? groups.map((g) => (
          <section key={g.letter}>
            <h2 className="sec shelfletter">{g.letter}</h2>
            {g.books.map((b) => <ShelfRow key={b.key} entry={b} showShelf={!filters.shelf} wanted={wantKeys.has(b.key)} />)}
          </section>
        ))
        : shown.map((b) => <ShelfRow key={b.key} entry={b} showShelf={!filters.shelf} wanted={wantKeys.has(b.key)} expanded={!!picked} />)}

      {totalPages > 1 && !picked && (
        <nav className="pager" aria-label="Pagination">
          {(filters.page ?? 1) > 1 && (
            <Link className="chip" href={shelfHref(filters, { page: (filters.page ?? 1) - 1 })}>Previous</Link>
          )}
          <span className="pager-pos">Page {filters.page} of {totalPages}</span>
          {(filters.page ?? 1) < totalPages && (
            <Link className="chip" href={shelfHref(filters, { page: (filters.page ?? 1) + 1 })}>Next</Link>
          )}
        </nav>
      )}

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

/* Advancing the seed with a linear congruential step rather than Math.random(), for three
 * reasons that all point the same way: rendering must be pure, a pick that changes on refresh is
 * a pick you cannot show anyone, and "Pick another" should be a link you can middle-click. Each
 * press lands somewhere new; the same URL always shows the same book. */
const nextSeed = (s: number) => ((s || 1) * 1103515245 + 12345) % 2147483647;
const pickHref = (f: ShelfFilters, seed: number) => {
  const base = shelfHref(f, {});
  return `${base}${base.includes('?') ? '&' : '?'}pick=${nextSeed(seed)}`;
};

const STATUS_LABEL = { read: 'read it', queued: 'on your queue', seen: 'seen in a shop' } as const;

function ShelfRow({ entry, showShelf, wanted = false, expanded = false }: { entry: ShelfEntry; showShelf: boolean; wanted?: boolean; expanded?: boolean }) {
  /* The facts line is what both reference catalogues put under the title and we did not: how long
   * it is and how it reads. Only about 5% of the pool carries those, so each part is omitted when
   * absent rather than rendered as "unknown" on nearly every row. */
  const facts = [
    entry.pages ? `${entry.pages}pp` : null,
    entry.pace,
    entry.year ? String(entry.year) : null,
    // Reader ratings, kept apart from the score on purpose: one is what juries and critics
    // decided, the other is what readers felt. Below five ratings the average is noise.
    entry.rating && (entry.ratingCount ?? 0) >= 5 ? `${entry.rating.toFixed(1)}/5` : null,
  ].filter(Boolean);

  return (
    <div className={`shelfrow ${expanded ? 'expanded' : ''}`}>
      {/* Cover left, content right, the layout both reference catalogues use. A plain img, not
          next/image: these are small external thumbnails and routing 661 of them through Vercel's
          optimiser would spend Fluid CPU to make them no better. Width and height are fixed so
          nothing reflows as they load, and a book without one gets a labelled placeholder rather
          than a hole. */}
      <span className="shelfcov">
        {entry.cover
          ? <img src={entry.cover} alt="" width={44} height={66} loading="lazy" decoding="async" />
          : <span className="nocov" aria-hidden="true">?</span>}
        <span className={`tierbadge t-${entry.tier}`}>{tierLabel[entry.tier]}</span>
      </span>

      <span className="shelftitle">
        {entry.title}
        {entry.status && <span className="ownflag">{STATUS_LABEL[entry.status]}</span>}
      </span>
      <span className="shelfby">
        <strong>{entry.fileUnder}</strong> · {entry.author}
        {facts.length > 0 && <span className="facts"> · {facts.join(' · ')}</span>}
      </span>
      {entry.description && (
        <p className={`shelfdesc ${expanded ? 'full' : ''}`}>{entry.description}</p>
      )}
      <span className="shelfmeta">
        {showShelf && entry.shelves.map((s) => (
          <span key={s} className="shelfchip">{shelfLabel[s]}</span>
        ))}
        {entry.lists.length > 0 && <span className="shelfwhy">{entry.lists.join(' / ')}</span>}
      </span>
      <span className="shelfact">
        <WantButton bookKey={entry.key} title={entry.title} author={entry.author} initial={wanted} />
      </span>
    </div>
  );
}
