import Link from 'next/link';
import { getDigests, getItems, getSummary } from '@/lib/curio/db';
import type { CurioDigest, CurioItem } from '@/lib/curio/db';

export const dynamic = 'force-dynamic';

/* "Curio", not "Curio · Silvio Neyra": the root layout's title template appends the name now, and
 * this read "Curio · Silvio Neyra · Silvio Neyra" for as long as it took to notice. */
export const metadata = {
  title: 'Curio',
  description: 'Questions I wondered about, answered and kept.',
  alternates: { canonical: '/curio' },
};

/* The point of this page, in his words: the thing that arrives by email, "here as a way to
 * navigate it". So the archive is the page. Every morning's digest is two written-out answers,
 * and those paragraphs are the actual content; the ledger row is only a one-line summary of one.
 * Reading the ledger instead would be reading the index and calling it the book.
 *
 * The recall lane is deliberately not rendered. It is the same items coming back on a spacing
 * schedule, so on a page where everything is present at once it is pure duplication. The lane
 * only means something in an inbox, where you cannot scroll back.
 *
 * The ReadLater pile is not here either, and that one is not a taste call. See
 * content/curio/schema.sql.
 */

function Flavor({ kind }: { kind: string }) {
  return <span className={`flav flav-${kind}`}>{kind}</span>;
}

/* One morning. Lifted out so the open list and the folded one cannot drift apart. */
function Morning(d: CurioDigest) {
  return (
    <article key={d.day} className="digest">
      <div className="dday tnum">{d.day}</div>
      <div className="dbody">
        {d.opener && <p className="opener">{d.opener}</p>}
        {d.fresh.map((f, i) => (
          <div className="item" key={`${d.day}-${i}`}>
            <h3>{f.headline}</h3>
            <p>{f.body}</p>
            {f.source && (
              <a className="src" href={f.source} target="_blank" rel="noreferrer">
                source
              </a>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

/* One ledger row, shared by the open list and the folded one. */
function Row(it: CurioItem) {
  return (
    <div className="lrow" key={it.id}>
      <div className="lq">
        {it.question} <Flavor kind={it.flavor} />
      </div>
      <div className="la">
        {it.answer}{' '}
        {it.sourceUrl && (
          <a href={it.sourceUrl} target="_blank" rel="noreferrer">source</a>
        )}
      </div>
    </div>
  );
}

/* How many ledger rows stay open. */
const OPEN_ROWS = 12;

/* How many mornings stay open. Six is about a screen and a half of reading, which is enough to see
   what this is without committing to all of it. */
const OPEN_MORNINGS = 6;

export default async function CurioPage() {
  const [summary, digests, items] = await Promise.all([getSummary(), getDigests(), getItems()]);
  const recent = digests.slice(0, OPEN_MORNINGS);
  const earlier = digests.slice(OPEN_MORNINGS);

  return (
    <div className="curio">
      {/* Every other surface opens with a title. These two opened straight into a paragraph, so
          their only name was the 12px word in the header bar, and a screen reader found no h1 at
          all on the page. */}
      <h1>Curio</h1>
      <p className="blurb">
        Things I got curious about and looked up properly, two a morning. Kept here because the
        answer is worth more than the moment of wondering, and because I forget them otherwise.
      </p>

      <div className="stat">
        <span className="live tnum">{summary.items}</span> answered
        <span className="dot">·</span>
        <span className="live tnum">{summary.digests}</span> mornings
        {summary.latestDay && <><span className="dot">·</span>latest {summary.latestDay}</>}
      </div>

      <h2 className="sec">The mornings</h2>
      <div className="digests">
        {recent.map(Morning)}
      </div>

      {/* This page was 28,000px tall and every one of them was open. Two answers a morning is not a
          lot; two hundred of them in one scroll is, and the newest is the one worth arriving at.
          A native <details> rather than pagination or a "load more" button: the older mornings stay
          in the document, so browser find-in-page and a crawler both still reach them, and it costs
          no client JavaScript on a page that otherwise ships none. */}
      {earlier.length > 0 && (
        <details className="more">
          <summary>{earlier.length} earlier mornings, back to {earlier[earlier.length - 1]?.day}</summary>
          <div className="digests">
            {earlier.map(Morning)}
          </div>
        </details>
      )}

      <h2 className="sec">Everything, in one line each</h2>
      <div className="ledger">{items.slice(0, OPEN_ROWS).map(Row)}</div>
      {/* The ledger was 13,289px of a 19,108px page at 390 wide: 64 rows, and "one line each" is a
          line and a half on a phone. Same fold as the mornings above. */}
      {items.length > OPEN_ROWS && (
        <details className="more">
          <summary>the other {items.length - OPEN_ROWS}</summary>
          <div className="ledger">{items.slice(OPEN_ROWS).map(Row)}</div>
        </details>
      )}

      <div className="foot">
        <Link href="/">Back to the index</Link>
      </div>
    </div>
  );
}
