import Link from 'next/link';
import { getEraCounts, getLetterCounts, getShelfCounts, getShelfLiveness, getShelfPage, getTierCounts } from '@/lib/reading/shelf-db';
import { ERAS, LETTERS, SHELVES, eraLabel, shelfHref, shelfLabel, tierChip, tierLabel, tierMeaning, TIERS } from '@/lib/reading/shelf-types';
import type { Era, Shelf, ShelfEntry, ShelfFilters, Tier } from '@/lib/reading/shelf-types';

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
  searchParams: Promise<{ q?: string; shelf?: string; letter?: string; tier?: string; era?: string }>;
}) {
  const sp = await searchParams;
  const letter = sp.letter && LETTERS.includes(sp.letter) ? sp.letter : undefined;
  const filters: ShelfFilters = {
    q: sp.q?.trim() || undefined,
    shelf: SHELVES.includes(sp.shelf as Shelf) ? (sp.shelf as Shelf) : undefined,
    letter,
    tier: TIERS.includes(sp.tier as Tier) ? (sp.tier as Tier) : undefined,
    era: ERAS.includes(sp.era as Era) ? (sp.era as Era) : undefined,
  };

  const [{ entries, total }, letterCounts, shelfCounts, tierCounts, eraCounts, liveness] = await Promise.all([
    getShelfPage(filters), getLetterCounts(filters), getShelfCounts(filters),
    getTierCounts(filters), getEraCounts(filters), getShelfLiveness(),
  ]);

  const searching = !!filters.q;
  /* A letter or a search is the intended path in a shop. Anything else only lists when the filters
     have already cut it to something a thumb can get through. */
  const BROWSABLE = 50;
  const showRows = searching || !!filters.letter || total <= BROWSABLE;
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
        {filters.tier && <input type="hidden" name="tier" value={filters.tier} />}
        {filters.era && <input type="hidden" name="era" value={filters.era} />}
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

      <div className="chiprow" role="group" aria-label="How well vetted">
        <Link className={`chip ${!filters.tier ? 'on' : ''}`} href={shelfHref(filters, { tier: undefined })}>
          worth pulling ({((tierCounts.grab ?? 0) + (tierCounts.good ?? 0)).toLocaleString()})
        </Link>
        {TIERS.map((t) => (
          <Link
            key={t}
            className={`chip chip-${t} ${filters.tier === t ? 'on' : ''}`}
            href={shelfHref(filters, { tier: filters.tier === t ? undefined : t })}
          >
            {tierChip[t]} ({(tierCounts[t] ?? 0).toLocaleString()})
          </Link>
        ))}
      </div>

      <div className="chiprow" role="group" aria-label="Era">
        <Link className={`chip ${!filters.era ? 'on' : ''}`} href={shelfHref(filters, { era: undefined })}>
          any year
        </Link>
        {ERAS.map((e) => (
          <Link
            key={e}
            className={`chip ${filters.era === e ? 'on' : ''}`}
            href={shelfHref(filters, { era: filters.era === e ? undefined : e })}
          >
            {eraLabel[e]} ({eraCounts[e].toLocaleString()})
          </Link>
        ))}
      </div>

      {/* The badge is the page's whole verdict, so what it means is on the page rather than
          buried at the bottom, and it names the tier currently being filtered. */}
      {filters.tier && <p className="tiernote"><strong>{tierLabel[filters.tier]}</strong> {tierMeaning[filters.tier]}</p>}

      <p className="stat">
        <span className="tnum">{total.toLocaleString()}</span>
        {searching
          ? ` match${total === 1 ? '' : 'es'} "${filters.q}"`
          : filters.letter
            ? ` under ${filters.letter}${filters.shelf ? ` in ${shelfLabel[filters.shelf].toLowerCase()}` : ''}`
            : ' worth pulling'}
        {filters.era && <span className="why"> · {eraLabel[filters.era].toLowerCase()}</span>}
        {!filters.tier && !searching && <span className="why"> · long shots hidden</span>}
        {total > 400 && <span className="why"> · showing the first 400, pick a letter to narrow it</span>}
      </p>

      {entries.length === 0 && (
        <h2 className="sec">
          {searching
            ? `nothing matches "${filters.q}" in the ${(liveness.rows ?? 0).toLocaleString()} books on record`
            : 'nothing here. Try another letter, or widen it with the long shots chip.'}
        </h2>
      )}

      {/* NO ROWS UNTIL SOMETHING IS CHOSEN. Measured at 390px on 2026-08-21: the unfiltered landing
          rendered 400 rows and stood 51,387px tall, sixty-one phone screens, on a page whose own
          copy already said "pick a letter to narrow it". The rails above ARE the page in the shop:
          section, then author letter, the order the aisles are walked. A search or a letter is the
          intended path, and a filter that happens to leave a browsable number is fine too. */}
      {showRows ? (
        groups.map((g) => (
          <section key={g.letter}>
            <h2 className="sec shelfletter">{g.letter}</h2>
            {g.books.map((b) => <ShelfRow key={b.key} entry={b} showShelf={!filters.shelf} />)}
          </section>
        ))
      ) : (
        <h2 className="sec">
          {`Pick a letter above, or a section, to see the ${total.toLocaleString()} spines. Searching the author or the title works too.`}
        </h2>
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
