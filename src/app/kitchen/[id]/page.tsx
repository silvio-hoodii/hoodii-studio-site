import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDish, cookRows } from '@/lib/kitchen/cookbook';
import NoteBox from '../NoteBox';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const d = await getDish(id);
  return { title: d?.name ?? 'Kitchen' };
}

const RATING_LABEL: Record<string, string> = { nailed: 'worked', fine: 'fine', wrong: 'went wrong' };

/* One dish. The recipe is the publisher's page, opened in a new tab; this page never carries their
 * text. What it carries is what a printed recipe cannot: the list built for this kitchen with the
 * store links, the protein figure with where it came from, and his own notes, including every
 * substitution he decided on in a session. */
export default async function DishPage({ params }: Params) {
  const { id } = await params;
  const d = await getDish(id);
  if (!d) notFound();
  const cooks = await cookRows(d.name);
  const host = new URL(d.sourceUrl).hostname.replace(/^www\./, '');

  return (
    <div className="wrap">
      <p className="eyebrow">Dish</p>
      <h1>{d.name}</h1>

      <a className="recipe-link" href={d.sourceUrl} target="_blank" rel="noreferrer">
        <span className="k">Open the recipe</span>
        <span className="v">{d.publisher ?? host}</span>
      </a>

      <dl className="facts">
        {d.proteinG != null && (
          <>
            <dt>Protein</dt>
            <dd>
              <span className="tnum">{Math.round(d.proteinG)} g</span> a serving
              {d.proteinNote && <span className="small">{d.proteinNote}</span>}
            </dd>
          </>
        )}
        {d.servings != null && (
          <>
            <dt>Serves</dt>
            <dd>
              <span className="tnum">{d.servings}</span>{' '}at the recipe&rsquo;s own scale
            </dd>
          </>
        )}
        <dt>Added</dt>
        <dd className="tnum">{d.addedAt}</dd>
      </dl>

      <h2 className="sec">Shopping list</h2>
      {d.list.length === 0 ? (
        <p className="empty">No list yet. It gets built in a session, with the store links.</p>
      ) : (
        <ul className="list">
          {d.list.map((it, i) => (
            <li key={i}>
              <span>
                {it.url ? (
                  <a href={it.url} target="_blank" rel="noreferrer">
                    {it.item}
                  </a>
                ) : (
                  it.item
                )}
              </span>
              {it.price && <span className="price tnum">{it.price}</span>}
              {it.qty && <span className="qty">{it.qty}</span>}
              {it.note && <span className="lnote">{it.note}</span>}
            </li>
          ))}
        </ul>
      )}

      <h2 className="sec">Notes</h2>
      {d.notes.length === 0 && cooks.length === 0 ? (
        <p className="empty">Nothing yet.</p>
      ) : (
        <ul className="notes">
          {d.notes.map((n, i) => (
            <li key={`n${i}`}>
              <span className="when tnum">{n.at}</span>
              <p>{n.text}</p>
            </li>
          ))}
          {cooks.map((c) => (
            <li key={c.id}>
              <span className="when tnum">{c.at}</span>
              <p>
                {c.rating && RATING_LABEL[c.rating] && (
                  <span className={`rating rating-${c.rating}`}>{RATING_LABEL[c.rating]}</span>
                )}
                {c.note}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="sec">How did it go</h2>
      <NoteBox dish={d.name} />
    </div>
  );
}
