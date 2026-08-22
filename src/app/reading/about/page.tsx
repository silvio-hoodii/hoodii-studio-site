import Link from 'next/link';
import { getSourceLists } from '@/lib/reading/catalog-db';
import type { SourceList } from '@/lib/reading/catalog-db';
import { trackLabel } from '@/lib/reading/catalog-types';
import type { Track } from '@/lib/reading/catalog-types';

export const metadata = {
  title: 'Reading: How this works',
  description: 'What the score means, what the four pages are for, and the actual lists behind it.',
  alternates: { canonical: '/reading/about' },
};

/* ISR, one hour. Explains the scoring and lists the sources; it changes when a source list is
 * added, which happens a few times a year. */
export const revalidate = 3600;

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
        <Link className="rtab" href="/reading/shelf">Browse</Link>
        <Link className="rtab" href="/reading/want">Want</Link>
        <Link className="rtab" href="/reading/finished">Finished</Link>
      </p>

      <h1>How this works</h1>

      <h2 className="sec">The four pages</h2>
      <ul className="lines">
        <li><strong>Next up</strong>: the ten books I have actually committed to. It re-ranks on every run rather than topping itself up, so an unread book has no tenure: if something better shows up it loses the slot. Anything I have started is pinned and never evicted.</li>
        <li><strong>All books</strong>: everything scored, ranked. A book disappears from here the moment it enters the ten.</li>
        <li><strong>Shelf check</strong>: for standing in a second-hand shop. Section, then author letter, because that is the order the aisles are physically walked. The other pages answer &quot;what should I read next&quot;; this one answers &quot;I am holding this spine, is it worth pulling&quot;, which is a different question and needs a different shape.</li>
        <li><strong>Finished</strong>: recall decks, one per book actually finished. Nothing here for a book owned but not started, or one I&apos;m planning to trade rather than read.</li>
      </ul>

      <h2 className="sec">What the score means</h2>
      <p className="qwhy">
        Not a quality verdict. It is how much independent evidence there is that a book is worth
        reading, and it weighs four kinds of it: a jury (award), a curated list (critic), a settled
        reader vote (popular), and what is actually being read right now (live). Clearing several
        different kinds beats stacking three lists that agree with each other by construction.
      </p>
      <p className="qwhy">
        Each list is weighted by how selective it is, not counted. Winning a prize given once a year
        is worth more than being one of four hundred nominees in an archive, and rank inside a
        ranked list counts, so first on a hundred-book list beats hundredth. The same prize is only
        ever counted once, however many of the source lists carry it.
      </p>

      <h2 className="sec">Rebuilt on 21 August 2026</h2>
      <p className="qwhy">
        The old score counted how many lists a book appeared on, which mostly measured how long the
        book had existed to accumulate them: six of the seven lists behind To Kill a Mockingbird
        closed before 2019, so nothing published in 2025 could reach them at any quality. It also
        ran five separately-scored corpora whose numbers were never comparable, and the ten-book
        queue blended them behind eight variety quotas, so seven of the ten scored under four while
        The Grapes of Wrath sat outside it. One pool now, one formula, and the quotas are gone.
      </p>
      <p className="qwhy">
        The tracks below are labels on a row, not rankings. Nothing is scored against its own
        corpus any more. On Shelf check the tiers <em>are</em> per section, deliberately: general
        fiction is covered by thirteen lists and crime by one, so ranking them on one scale made
        every Edgar winner look like a long shot.
      </p>

      <h2 className="sec">Tagged vs. not detailed yet</h2>
      <p className="qwhy">
        A book needs pace, mood, and a written &quot;why&quot; before it can enter the ten. Most of
        the catalog doesn&apos;t have that yet. Shown honestly as not detailed, never hidden. Shelf
        check ignores this entirely: whether a book has been written up has nothing to do with
        whether it is worth three dollars.
      </p>

      <h2 className="sec">Sources</h2>
      <p className="qwhy">
        The actual lists the scores come from. Nothing here is a vibe or a recall: every one is a
        published list captured to a file. An Instagram scrape used to sit alongside these and was
        removed on 21 August 2026, because how many accounts in one closed snapshot happened to
        name a book is not evidence about the book.
      </p>
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
