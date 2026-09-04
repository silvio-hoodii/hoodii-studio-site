import WalledLink from '@/components/WalledLink';
import { getWants } from '@/lib/reading/want-db';

export const metadata = {
  title: 'Reading: Want list',
  description: 'Books saved for the next shop or library trip.',
  alternates: { canonical: '/reading/want' },
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/* Deliberately NOT the queue, and the distinction is the whole reason this page exists.
 *
 * The queue is ten books he is reading next, it re-ranks, and adding to it pushes something out.
 * A want costs nothing and evicts nothing: it is "remember this for the next shop trip". Folding
 * the two together is exactly the confusion that made Middlesex sit at the top of the queue for
 * three weeks because it had been seen on a thrift shelf once. */
export default async function WantList() {
  const wants = await getWants();

  return (
    <div className="reading">
      <p className="surf-nav">
        <WalledLink className="rtab" href="/reading">Next up</WalledLink>
        <WalledLink className="rtab" href="/reading/shelf">Browse</WalledLink>
        <span className="rtab on">Want</span>
        <WalledLink className="rtab" href="/reading/finished">Finished</WalledLink>
      </p>

      <h1>Want list</h1>
      <p className="blurb">
        Saved from <WalledLink href="/reading/shelf">Shelf check</WalledLink> for the next shop or library trip.
        Nothing here is in the queue, and saving one never pushes a book out of the ten.
      </p>

      {wants.length === 0
        ? (
          <h2 className="sec">
            Nothing saved yet. Tap <strong>want</strong> on any row in Shelf check.
          </h2>
        )
        : (
          <>
            <p className="stat"><span className="tnum">{wants.length}</span> saved</p>
            {wants.map((w) => (
              <div className="shelfrow" key={w.key}>
                <span className="tierbadge t-good">want</span>
                <span className="shelftitle">{w.title}</span>
                <span className="shelfby">{w.author}</span>
                <span className="shelfmeta">
                  <span className="shelfwhy">saved {new Date(w.addedAt).toISOString().slice(0, 10)}</span>
                  {w.note && <span className="shelfwhy">{w.note}</span>}
                </span>
              </div>
            ))}
            <p className="src">
              Remove one from its row on <WalledLink href="/reading/shelf">Shelf check</WalledLink>, where the
              button knows whether a book is already saved.
            </p>
          </>
        )}
    </div>
  );
}
