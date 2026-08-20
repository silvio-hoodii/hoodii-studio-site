import Link from 'next/link';
import { allPacks, kindLabel } from '@/lib/reading/packs';

export const metadata = {
  title: 'Reading: Finished',
  description: 'Recall cards and a debrief for books I have finished, so I can tell whether any of it stuck.',
  alternates: { canonical: '/reading/finished' },
};

/* Was /reading itself until 2026-08-20, when the live queue moved in and took the front page.
 * Moving here rather than duplicating: every line is still counted off content/reading/packs at
 * render, for the reason the original comment gave -- a written-down count drifts, a computed one
 * cannot. */
export default async function ReadingFinished() {
  const packs = await allPacks();
  const cards = packs.reduce((n, p) => n + p.cards.length, 0);

  return (
    <div className="reading">
      <p className="surf-nav">
        <Link className="rtab" href="/reading">Next up</Link>
        <span className="rtab on">Finished</span>
      </p>

      <h1>Finished</h1>
      <p className="blurb">
        What each book was about, and whether I still have it. Open one, run the cards, and whatever
        I miss comes back as a recap of just that stretch.
      </p>
      <p className="stat">
        <span className="tnum">{packs.length}</span> books
        <span className="dot">·</span>
        <span className="tnum">{cards}</span> cards
      </p>

      {packs.map((p) => (
        <Link className="bk" href={`/reading/${p.slug}`} key={p.slug}>
          <span className="bt">{p.book}</span>
          <span className="ba">{p.author} · {p.year}</span>
          <span className="bm">
            <span className="tnum">{p.cards.length}</span> cards · {kindLabel[p.kind]}
          </span>
        </Link>
      ))}

      <p className="src">
        Every fact in these was written from study guides and source texts fetched and saved at the
        time, never from a model&apos;s memory of the book. The saved pages are the reason I trust
        them, and each one lists what it was built from.
      </p>
    </div>
  );
}
