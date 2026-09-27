import type { Metadata } from 'next';
import { getDigests, getItems, getSummary } from '@/lib/curio/db';
import type { CurioDigest, CurioItem } from '@/lib/curio/db';

/* The mornings and the one-line ledger, off /curio since 2026-09-27. They were folded under the
 * quiz, which printed every answer the quiz asks him to recall on the same page and cost every
 * visit two database round trips and the whole ledger twice over. Here they are still reachable,
 * still indexable, and still one ISR hour behind the sync that writes them. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Curio archive',
  description: 'Every question, answered and kept, and the mornings they arrived in.',
  alternates: { canonical: '/curio/archive' },
};

function Flavor({ kind }: { kind: string }) {
  return <span className={`flav flav-${kind}`}>{kind}</span>;
}

/* One morning. */
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

/* One ledger row. */
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
        {/* `verify` means nobody has checked it yet (CuriosityOS/README.md): a numeric, dated or
            myth-correcting claim the weekly job checks before it is sent. On a page of settled facts
            that is the one label that has to be visible. */}
        {it.sourceKind === 'verify' && (
          <span className="unverified">
            not checked yet
          </span>
        )}
      </div>
    </div>
  );
}

export default async function CurioArchivePage() {
  const [summary, digests, items] = await Promise.all([getSummary(), getDigests(), getItems()]);

  return (
    <div className="curio">
      <h1>Curio archive</h1>
      <div className="stat">
        <span className="tnum">{summary.items}</span> answered
        <span className="dot">&middot;</span>
        <span className="tnum">{summary.digests}</span> mornings
      </div>

      {items.length > 0 && (
        <>
          <h2 className="sec">Everything, in one line each</h2>
          <div className="ledger">{items.map(Row)}</div>
        </>
      )}

      {digests.length > 0 && (
        <>
          <h2 className="sec">The mornings</h2>
          <div className="digests">{digests.map(Morning)}</div>
        </>
      )}
    </div>
  );
}
