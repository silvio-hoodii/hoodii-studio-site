import Link from 'next/link';
import { getSummary } from '@/lib/curio/db';
import Today from './Today';
import gamesJson from '../../../content/curio/games.json';

interface GameItem { name: string; url: string; learn: string; do?: string; cost: 'free' | 'paid' | 'free+paid'; site?: string }
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

/* One game or app off content/curio/games.json. The name is the link; what it teaches sits under
   it, the way the hub's rows carry a second line. */
function Game(g: GameItem) {
  return (
    <li className="game" key={g.url}>
      <a className="gname" href={g.url} target="_blank" rel="noreferrer">
        {/* The site's own icon, so the list scans as pictures before words. Google's favicon service
            rather than fetching each site: one host, cached by the browser, and a missing icon
            degrades to a blank square rather than a broken page. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 16px favicons, nothing to optimise */}
        <img className="gicon" src={`https://www.google.com/s2/favicons?domain=${g.site ?? new URL(g.url).hostname}&sz=64`}
          alt="" width={20} height={20} />
        {g.name}
      </a>
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
  const summary = await getSummary();

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

      {/* THE MORNINGS AND THE LEDGER ARE A ROUTE OF THEIR OWN since 2026-09-27, /curio/archive. Folded
          under the quiz they still shipped every answer twice (HTML plus hydration data, about 83 KB
          for the ledger alone) and two extra database round trips on the page he opens daily, and a
          page whose top asks him to recall an answer had every answer printed lower down. */}
      <p className="stat">
        <Link href="/curio/archive"><span className="tnum">{summary.items}</span> questions answered, <span className="tnum">{summary.digests}</span> mornings &rarr;</Link>
      </p>
    </div>
  );
}
