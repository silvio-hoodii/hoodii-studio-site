import Link from 'next/link';
import { getSourceLists } from '@/lib/reading/catalog-db';
import type { SourceList } from '@/lib/reading/catalog-db';
import { trackLabel } from '@/lib/reading/catalog-types';
import type { Track } from '@/lib/reading/catalog-types';

export const metadata = {
  title: 'Reading: How this works',
  description: 'What the score means, what the three pages are for, and the actual lists behind it.',
  alternates: { canonical: '/reading/about' },
};

export const dynamic = 'force-dynamic';

const TRACK_ORDER: Track[] = ['canon', 'current', 'nonfiction', 'genre', 'spanish'];

export default async function ReadingAbout() {
  const sources = await getSourceLists();
  const byTrack = new Map<Track, SourceList[]>();
  for (const s of sources) {
    if (!byTrack.has(s.track)) byTrack.set(s.track, []);
    byTrack.get(s.track)!.push(s);
  }

  return (
    <div className="reading">
      <p className="surf-nav">
        <Link className="rtab" href="/reading">Next up</Link>
        <Link className="rtab" href="/reading/all">All books</Link>
        <Link className="rtab" href="/reading/finished">Finished</Link>
      </p>

      <h1>How this works</h1>

      <h2 className="sec">The three pages</h2>
      <ul className="lines">
        <li><strong>Next up</strong>: the ten books actually queued. Refills itself when one gets finished.</li>
        <li><strong>All books</strong>: everything else scored. A book disappears from here the moment it enters the ten, which is why a book on Next up (The Correspondent, for example) will not also show up here.</li>
        <li><strong>Finished</strong>: recall decks, one per book actually finished. Nothing here for a book owned but not started, or one I&apos;m planning to trade rather than read. There is no reason for a recall deck to exist for a book that was never read and never will be.</li>
      </ul>

      <h2 className="sec">What the score means</h2>
      <p className="qwhy">
        Not a quality verdict. It counts how many <em>kinds</em> of list agree on a book: critic,
        award, popular. One prize win alone scores lower than being shortlisted for three different
        kinds of recognition.
      </p>

      <h2 className="sec">The five tracks</h2>
      <ul className="lines">
        <li><strong>canon</strong>: settled, usually decades old.</li>
        <li><strong>current</strong>: recent, this week&apos;s lists.</li>
        <li><strong>non-fiction</strong>, <strong>genre</strong> (fantasy, sci-fi, mystery, thriller): same scoring, narrower source lists.</li>
        <li><strong>Spanish</strong>: critic + award only. No Anglophone-style public-vote list exists for this one, so it never reaches three-way validation.</li>
      </ul>

      <h2 className="sec">Tagged vs. not detailed yet</h2>
      <p className="qwhy">
        A book needs pace, mood, and a written &quot;why&quot; before it can enter the ten. Most of
        the catalog doesn&apos;t have that yet. Shown honestly as not detailed, never hidden.
      </p>

      <h2 className="sec">Sources</h2>
      <p className="qwhy">The 33 actual lists the scores come from.</p>
      {TRACK_ORDER.map((track) => {
        const list = byTrack.get(track);
        if (!list?.length) return null;
        return (
          <details className="sect" key={track}>
            <summary>
              <span className="st">{trackLabel[track]}</span>
              <span className="sr">{list.length}</span>
            </summary>
            <div className="body">
              {list.map((s) => (
                <div className="qbranch" key={s.slug}>
                  <span className="qb-name">
                    {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}
                  </span>
                  <span className="qb-status">
                    {s.category}{s.count ? `, ${s.count}` : ''}{s.status === 'partial' ? ' (partial capture)' : ''}
                  </span>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
