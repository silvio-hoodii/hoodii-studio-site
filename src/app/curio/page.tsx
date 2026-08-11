import Link from 'next/link';
import { getDigests, getItems, getSummary } from '@/lib/curio/db';
import './curio.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Curio · Silvio Neyra',
  description: 'Questions I wondered about, answered and kept.',
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

export default async function CurioPage() {
  const [summary, digests, items] = await Promise.all([getSummary(), getDigests(), getItems()]);

  return (
    <div className="curio">
      <div className="top">
        <Link href="/" className="back">Silvio Neyra</Link>
        <span className="where">Curio</span>
      </div>

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
        {digests.map((d) => (
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
        ))}
      </div>

      <h2 className="sec">Everything, in one line each</h2>
      <div className="ledger">
        {items.map((it) => (
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
        ))}
      </div>

      <div className="foot">
        <Link href="/">Back to the index</Link>
      </div>
    </div>
  );
}
