import { getDigests, getItems, getSummary } from '@/lib/curio/db';
import type { CurioDigest, CurioItem } from '@/lib/curio/db';
import Today from './Today';
import gamesJson from '../../../content/curio/games.json';

interface GameItem { name: string; url: string; learn: string; do?: string; cost: 'free' | 'paid' | 'free+paid' }
const games = gamesJson as unknown as { groups: { name: string; items: GameItem[] }[] };

/* ISR, one hour. A one-way mirror of CuriosityOS/log.md that only changes when a sync runs, so a
 * render per request was pure waste. */
export const revalidate = 3600;

/* "Curio", not "Curio · Silvio Neyra": the root layout's title template appends the name now, and
 * this read "Curio · Silvio Neyra · Silvio Neyra" for as long as it took to notice. */
export const metadata = {
  title: 'Curio',
  description: 'Questions I wondered about, answered and kept.',
  alternates: { canonical: '/curio' },
};

/* The point of this page, in his words: the thing that arrives by email, "here as a way to
 * navigate it". So the archive is the page. Every morning's digest is two written-out answers,
 * and those paragraphs are the actual content; the ledger row is only a one-line summary of one.
 * Reading the ledger instead would be reading the index and calling it the book.
 *
 * The recall lane is deliberately not rendered. It is the same items coming back on a spacing
 * schedule, so on a page where everything is present at once it is pure duplication. The lane
 * only means something in an inbox, where you cannot scroll back.
 *
 * The ReadLater pile is not here either, and that one is not a taste call. See
 * content/curio/schema.sql.
 */

function Flavor({ kind }: { kind: string }) {
  return <span className={`flav flav-${kind}`}>{kind}</span>;
}

/* One morning. Lifted out so the open list and the folded one cannot drift apart. */
function Morning(d: CurioDigest) {
  return (
    <article key={d.day} className="digest">
      <div className="dday tnum">{d.day}</div>
      <div className="dbody">
        {d.opener && <p className="opener">{d.opener}</p>}
        {d.fresh.map((f, i) => (
          <div className="item" key={`${d.day}-${i}`}>
            <h3>{f.headline}</h3>
            <p>{f.body}</p>
            {f.source && (
              <a className="src" href={f.source} target="_blank" rel="noreferrer">
                source
              </a>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

/* One ledger row, shared by the open list and the folded one. */
function Row(it: CurioItem) {
  return (
    <div className="lrow" key={it.id}>
      <div className="lq">
        {it.question} <Flavor kind={it.flavor} />
      </div>
      <div className="la">
        {it.answer}{' '}
        {it.sourceUrl && (
          <a href={it.sourceUrl} target="_blank" rel="noreferrer">source</a>
        )}
        {/* `verify` MEANS NOBODY HAS CHECKED IT YET. Per CuriosityOS/README.md a row is marked
            Source=verify when the claim is numeric, dated or a myth-correction, and the weekly
            digest job checks it before sending. Until 2026-08-28 `sourceKind` was selected and
            rendered nowhere, so an unchecked row published on a public page indistinguishable from a
            verified one (05-small-apps C4). On a page whose whole subject is settled facts, that is
            the one label that has to be visible. */}
        {it.sourceKind === 'verify' && (
          <span className="unverified">
            not checked yet
          </span>
        )}
      </div>
    </div>
  );
}

/* One game or app off content/curio/games.json. The name is the link; what it teaches sits under
   it, the way the hub's rows carry a second line. */
function Game(g: GameItem) {
  return (
    <li className="game" key={g.url}>
      <a className="gname" href={g.url} target="_blank" rel="noreferrer">{g.name}</a>
      {/* Only the exceptions are labelled. Nearly every row is free, and "free" twenty times down
          the right edge was the loudest thing in the list. */}
      {g.cost !== 'free' && (
        <span className="gcost">{g.cost === 'free+paid' ? 'part paid' : 'paid'}</span>
      )}
      <span className="glearn">{g.learn}</span>
      {g.do && <span className="gdo">{g.do}</span>}
    </li>
  );
}

export default async function CurioPage() {
  const [summary, digests, items] = await Promise.all([getSummary(), getDigests(), getItems()]);

  return (
    <div className="curio">
      <h1>Curio</h1>

      {/* THE PAGE WAS AN ARCHIVE OF EMAILS UNTIL 2026-09-27, and he had stopped opening the emails.
          It opens on something to do now: recall, then check. Today renders in the browser and
          only for a signed-in device; see Today.tsx for why it is not rendered here. */}
      <Today />

      <h2 className="sec">Games</h2>
      <div className="games">
        {games.groups.map((grp) => (
          <div className="ggroup" key={grp.name}>
            <h3>{grp.name}</h3>
            <ul>{grp.items.map(Game)}</ul>
          </div>
        ))}
      </div>

      {/* The mornings and the one-line ledger stay, folded. The morning email is paused (the
          scheduled task is disabled, not deleted), so the three-day "no morning since" warning
          that used to sit here would now fire forever about a choice rather than a failure, and
          it went with the change. */}
      <h2 className="sec">Archive</h2>
      <div className="stat">
        <span className="tnum">{summary.items}</span> answered
        <span className="dot">·</span>
        <span className="tnum">{summary.digests}</span> mornings
        {summary.latestDay && <><span className="dot">·</span>latest {summary.latestDay}</>}
      </div>
      {digests.length > 0 && (
        <details className="more">
          <summary>The mornings</summary>
          <div className="digests">{digests.map(Morning)}</div>
        </details>
      )}
      {items.length > 0 && (
        <details className="more">
          <summary>Everything, in one line each</summary>
          <div className="ledger">{items.map(Row)}</div>
        </details>
      )}
    </div>
  );
}
