import Link from 'next/link';
import { allPacks, kindLabel } from '@/lib/reading/packs';

export const metadata = {
  title: 'Reading',
  description: 'Recall cards and a debrief for books I have finished, so I can tell whether any of it stuck.',
  alternates: { canonical: '/reading' },
};

/* Was readingos.vercel.app, a separate project shipping seven generated HTML files.
 *
 * EVERY LINE ON THIS PAGE IS COUNTED, not typed. The card counts, the kind labels, the number of
 * books: all read off content/reading/packs at render. The old index carried them as text, which is
 * correct on the day it is generated and drifts silently after. That exact defect is why the hub row
 * for this app described the wrong thing for months, and it was only caught by someone opening the
 * deployed page.
 */
export default async function ReadingIndex() {
  const packs = await allPacks();
  const cards = packs.reduce((n, p) => n + p.cards.length, 0);

  return (
    <div className="reading">
      <h1>Reading</h1>
      <p className="blurb">
        What each book was about, and whether I still have it. Open one, run the cards, and whatever
        I miss comes back as a recap of just that stretch.
      </p>
      <p className="stat">
        <span className="tnum">{packs.length}</span> books
        <span className="dot">·</span>
        <span className="tnum">{cards}</span> cards
      </p>

      <h2 className="sec">Finished, with recall cards and a debrief</h2>
      {packs.map((p) => (
        <Link className="bk" href={`/reading/${p.slug}`} key={p.slug}>
          <span className="bt">{p.book}</span>
          <span className="ba">{p.author} · {p.year}</span>
          <span className="bm">
            <span className="tnum">{p.cards.length}</span> cards · {kindLabel[p.kind]}
          </span>
        </Link>
      ))}

      {/* The provenance claim, and it is narrower than the one the old site made. That page said
          every fact was "written from pages fetched to raw/companions/", which was true and pointed
          at a folder in another repo. Naming a path that does not exist here would be a claim a
          reader cannot check, so this says the same thing without the false address. The evidence
          itself stays in ReadingOS, where it was gathered. */}
      <p className="src">
        Every fact in these was written from study guides and source texts fetched and saved at the
        time, never from a model&apos;s memory of the book. The saved pages are the reason I trust
        them, and each one lists what it was built from.
      </p>
    </div>
  );
}
