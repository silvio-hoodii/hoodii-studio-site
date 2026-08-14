import Link from 'next/link';

/* Every bad URL on this domain served Next's stock 404: black background, centred sans, no link
 * anywhere on it. That is the one page on the site guaranteed to be seen by someone who arrived
 * from a stale search result, and it was off-palette and a dead end.
 *
 * It carries its own link home rather than the shared SiteHeader, because a root not-found renders
 * inside the root layout only: a 404 under /kitchen never reaches the kitchen layout, so nothing
 * mounted there would be here.
 *
 * There is deliberately no list of routes. The index is the list, it is one tap away, and a
 * hand-kept copy of it here is the kind of duplicate that drifts.
 */
export default function NotFound() {
  return (
    <div className="notfound">
      <div className="eyebrow">Silvio Neyra</div>
      <h1>Nothing lives at this address.</h1>
      <p>Either I moved it or it was never here.</p>
      <Link href="/">Back to the index</Link>
    </div>
  );
}
