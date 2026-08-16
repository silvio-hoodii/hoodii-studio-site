import { notFound } from 'next/navigation';
import { allPacks, getPack, unitLabel } from '@/lib/reading/packs';
import Recall from './Recall';

export async function generateStaticParams() {
  return (await allPacks()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPack(slug);
  if (!p) return { title: 'Not found' };
  return {
    title: p.book,
    description: `Recall cards and a debrief for ${p.book} by ${p.author}.`,
    alternates: { canonical: `/reading/${p.slug}` },
  };
}

/* One finished book: the deck, the shape of the thing, and how to talk about it.
 *
 * Three panels in the original, switched by tabs. Here they are three sections down the page, and
 * the deck is the only part that ships JS. Tabs hide two thirds of a page from find-in-page and
 * from a crawler in exchange for saving a reader a scroll, which is a bad trade on a page that is
 * mostly prose. /curio made the same call with <details>.
 */
export default async function PackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPack(slug);
  if (!p) notFound();

  const unit = unitLabel(p);
  const namedSources = p.sources.filter((s) => !/^raw\//.test(s));

  return (
    <div className="reading pack">
      <p className="eyebrow">Finished</p>
      <h1>{p.book}</h1>
      <p className="by">
        {p.author} · {p.year} · {p.total_chapters} {p.unit}s
      </p>

      <h2 className="sec">Do you still have it</h2>
      <Recall pack={p} />

      <h2 className="sec">The whole thing, in {p.sections.length} pieces</h2>
      {/* The count is read off the data. The template this came from had the word "six" hardcoded
          into that heading and shipped it above five sections on six of the seven books. */}
      {p.sections.map((s) => (
        <details className="sect" key={s.id}>
          <summary>
            <span className="st">{s.title}</span>
            <span className="sr">
              {unit} {s.from}{s.to !== s.from ? ` to ${s.to}` : ''}
            </span>
          </summary>
          <p className="body">{s.recap}</p>
        </details>
      ))}

      <h2 className="sec">Talking about it</h2>

      <div className="say">
        <span className="k">If someone asks what it is about</span>
        <p className="pull">{p.talk.short}</p>
        <details className="more">
          <summary>If they want more than that</summary>
          <p className="body">{p.talk.if_pressed}</p>
        </details>
      </div>

      <div className="say">
        <span className="k">What people actually argue about</span>
        {p.talk.arguments.map((a) => (
          <details className="more" key={a.q}>
            <summary>{a.q}</summary>
            <p className="body">{a.a}</p>
          </details>
        ))}
      </div>

      <div className="say">
        <span className="k">Lines worth having ready</span>
        <ul className="lines">
          {p.talk.one_liners.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </div>

      <div className="say">
        <span className="k">Questions to sit with</span>
        {/* The original put a textarea under each of these and saved the answers to localStorage.
            Dropped on purpose: a text box nobody fills in is a worse prompt than a question with
            nothing under it, and the kitchen already learned what an unread capture box costs. If
            he starts answering these somewhere, that is the moment to add a place to put them. */}
        <ul className="lines">
          {p.talk.prompts.map((q) => <li key={q}>{q}</li>)}
        </ul>
      </div>

      {p.context.length > 0 && (
        <div className="say">
          <span className="k">Worth knowing</span>
          <ul className="lines">
            {p.context.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}

      {/* Bare `raw/...` paths are dropped. Every pack lists at least one, pointing at the fetched
          evidence in the ReadingOS repo, which is where the pages were saved and where they stay:
          it is 48 MB of scraped HTML and it does not belong in a public site repo. Printing that
          path to a reader is worse than printing nothing, because it reads as a citation and
          resolves to nothing they can open. Five of the seven packs have only that, so the sentence
          has to stand on its own. */}
      <p className="src">
        Written from study guides and source texts fetched and saved at the time, never from a
        model&apos;s memory of the book.
        {namedSources.length > 0 && ` Built from ${namedSources.join('; ')}.`} Card grades are kept
        on this device only, so clearing your browser data resets them and nobody else can see them.
      </p>
    </div>
  );
}
