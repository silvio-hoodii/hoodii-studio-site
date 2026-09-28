import Link from 'next/link';
import { allPacks, kindLabel } from '@/lib/reading/packs';

export const metadata = {
  title: 'Reading: Recall',
  description: 'Recall cards and a debrief for books I have finished, so I can tell whether any of it stuck.',
  alternates: { canonical: '/reading/finished' },
};

/* Every count here is read off content/reading/packs at render: a written-down count drifts, a
 * computed one cannot. */
export default async function ReadingFinished() {
  const packs = await allPacks();
  const cards = packs.reduce((n, p) => n + p.cards.length, 0);

  return (
    <div className="reading">
      <p className="surf-nav">
        <Link className="rtab" href="/reading">Books</Link>
        <span className="rtab on">Recall</span>
      </p>

      <h1>Recall</h1>
      <p className="stat">
        <span className="tnum">{packs.length}</span> books
        <span className="dot">·</span>
        <span className="tnum">{cards}</span> cards
      </p>

      <div className="bks">
      {packs.map((p) => (
        <Link className="bk" href={`/reading/${p.slug}`} key={p.slug}>
          <span className="bt">{p.book}</span>
          <span className="ba">{p.author} · {p.year}</span>
          <span className="bm">
            <span className="tnum">{p.cards.length}</span> cards · {kindLabel[p.kind]}
          </span>
        </Link>
      ))}
      </div>

    </div>
  );
}
