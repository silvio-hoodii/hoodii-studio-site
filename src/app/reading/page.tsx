import Link from 'next/link';
import { getShelves, GOODREADS_PROFILE, type Book } from '@/lib/reading/goodreads';
import { shortDate } from '@/lib/format';

/* Revalidates with the feeds (FEED_TTL in goodreads.ts), so a book added on Goodreads shows here the
   same day. A literal because Next reads route config statically. */
export const revalidate = 21600;

export const metadata = {
  title: 'Reading',
  description: 'What I am reading and what I have read.',
  alternates: { canonical: '/reading' },
};

/* Covers, not rows. His ask on 2026-09-27 was "more graphic stuff instead of just walls of text",
   and a book is recognised by its cover faster than by its title. Text under a cover is only what
   a cover cannot say: his stars. */

function Stars({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="stars" aria-label={`${n} of 5 stars`}>
      {'★'.repeat(n)}
      <span className="off">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

function Cover({ b, big = false }: { b: Book; big?: boolean }) {
  return (
    <a className={big ? 'cov big' : 'cov'} href={b.link} target="_blank" rel="noreferrer" title={`${b.title}, ${b.author}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote covers, no optimiser: an image
          transformation per cover is a bill for pictures Goodreads already sized. */}
      <img src={b.cover} alt={`${b.title} by ${b.author}`} loading="lazy" />
      {!big && <Stars n={b.rating} />}
    </a>
  );
}

function year(b: Book): string {
  return (b.readAt ?? b.addedAt ?? '').slice(0, 4) || 'Undated';
}

export default async function ReadingPage() {
  const { current, read, want, ok } = await getShelves();
  const pages = read.reduce((n, b) => n + (b.pages ?? 0), 0);
  const years = [...new Set(read.map(year))];

  return (
    <div className="reading">
      <h1>Reading</h1>
      {!ok && (
        <p className="empty">
          Goodreads did not answer. <a href={GOODREADS_PROFILE}>Open it there</a>.
        </p>
      )}

      {current.length > 0 && (
        <section className="now all-external">
          {current.map((b) => (
            <div className="nowrow" key={b.id}>
              <Cover b={b} big />
              <div className="nowtxt">
                <div className="eyebrow">Reading now</div>
                <div className="nt">{b.title}</div>
                <div className="na">{b.author}</div>
                <div className="nm tnum">
                  {b.pages && <>{b.pages} pages</>}
                  {b.pages && b.addedAt && <span className="dot">·</span>}
                  {b.addedAt && <>since {shortDate(b.addedAt)}</>}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {read.length > 0 && (
        <>
          <h2 className="sec">Read</h2>
          <p className="stat">
            <span className="live tnum">{read.length}</span> {read.length === 1 ? 'book' : 'books'}
            {pages > 0 && <><span className="dot">·</span><span className="tnum">{pages.toLocaleString('en-CA')}</span> pages</>}
          </p>
          {years.map((y) => (
            <div key={y}>
              {years.length > 1 && <h3 className="yr tnum">{y}</h3>}
              <div className="covers all-external">
                {read.filter((b) => year(b) === y).map((b) => <Cover key={b.id} b={b} />)}
              </div>
            </div>
          ))}
        </>
      )}

      {want.length > 0 && (
        <>
          <h2 className="sec">Want to read</h2>
          <div className="covers small all-external">
            {want.map((b) => <Cover key={b.id} b={b} />)}
          </div>
        </>
      )}

      <p className="links">
        <a href={GOODREADS_PROFILE} target="_blank" rel="noreferrer">Goodreads</a>
        <span className="dot">·</span>
        <Link href="/reading/finished">Recall decks</Link>
      </p>
    </div>
  );
}
