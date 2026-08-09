import { fetchSpotify } from '@/lib/fetchers';
import { deriveStock, expiringSoon } from '@/lib/kitchen/stock';
import { allRecipes, offer } from '@/lib/kitchen/recipes';
import './hub.css';

export const dynamic = 'force-dynamic';

/* The index shows STATE, not link labels.
 *
 * That is the whole anti-generic move, and it matters more than any palette. Six cards saying what
 * each app is could be generated for anyone. "14 dishes ready now, beef 350 g, 2 days left" could
 * only ever be this page. Content is what makes it look human, so the design's job is to get out
 * of the way of the content.
 *
 * Corollary, and it is load-bearing: NEVER invent state for an app whose data we cannot reach.
 * Reading, swim, gym and French live elsewhere today, so they get an honest descriptor and no
 * numbers. A fabricated "3 days ago" would be worse than the cards it replaced.
 */

interface Row {
  label: string;
  line: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  external?: boolean;
  off?: boolean;
}

async function kitchenRow(): Promise<Row> {
  try {
    const [stock, recipes] = await Promise.all([deriveStock(), allRecipes()]);
    const ready = recipes.filter((r) => offer(r, stock).status === 'ready').length;
    const soon = expiringSoon(stock, 5, 2);

    // Stock display names carry the shop's branding, e.g. "spring mix salad (Your Fresh Market)".
    // Useful in the kitchen, noise on the front door.
    const short = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim();

    const sub = soon.length
      ? soon
          .map((i) => `${short(i.n)}, ${i.daysLeft! <= 0 ? 'today' : `${i.daysLeft} d left`}`)
          .join(' · ')
      : 'nothing about to turn';

    return {
      label: 'Kitchen',
      line:
        ready > 0 ? (
          <>
            <span className="live tnum">{ready}</span> dishes you can cook right now
          </>
        ) : (
          'nothing ready without a shop'
        ),
      sub,
      href: '/kitchen',
    };
  } catch {
    // A database hiccup must not take the front door down with it.
    return { label: 'Kitchen', line: 'Recipes and what is in the fridge', href: '/kitchen' };
  }
}

const STATIC_ROWS: Row[] = [
  {
    label: 'Reading',
    line: 'The shelf, the queue, and whether a book is worth keeping',
    href: 'https://readingos.vercel.app',
    external: true,
  },
  {
    label: 'Swim',
    line: 'Sessions, drills, and what to work on in the water',
    href: 'https://swim.hoodii.studio',
    external: true,
  },
  {
    label: 'Gym',
    line: 'Upper/lower split, logged between sets',
    sub: 'still on the laptop, not moved yet',
    off: true,
  },
  {
    label: 'French',
    line: 'Review queue built from three physical books',
    sub: 'still on the laptop, not moved yet',
    off: true,
  },
  {
    label: 'Desk',
    line: 'What I build, and how to reach me',
    href: 'https://github.com/silvio-hoodii',
    external: true,
  },
];

function RowView({ r }: { r: Row }) {
  const inner = (
    <>
      <div className="label">{r.label}</div>
      <div className="body">
        <div className="line">{r.line}</div>
        {r.sub && <div className="sub">{r.sub}</div>}
      </div>
      <div className="arrow">{r.off ? '·' : '→'}</div>
    </>
  );

  if (!r.href) return <div className="row off">{inner}</div>;
  return (
    <a className="row" href={r.href} {...(r.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {inner}
    </a>
  );
}

export default async function Home() {
  const [spotify, kitchen] = await Promise.all([fetchSpotify(), kitchenRow()]);
  const rows = [kitchen, ...STATIC_ROWS];

  return (
    <div className="idx">
      <div className="top">
        <h1>Silvio Neyra</h1>
        <span className="where">Calgary</span>
      </div>
      <p className="blurb">
        Small software for an audience of one, mostly to answer questions I got tired of asking
        myself. This is the front door to it.
      </p>

      <hr />
      <div className="rows">
        {rows.map((r) => <RowView key={r.label} r={r} />)}
      </div>

      <div className="foot">
        <a href="https://github.com/silvio-hoodii" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://brixelcorp.com" target="_blank" rel="noreferrer">Brixel</a>
        {spotify.isPlaying && spotify.title && (
          <span className="np">
            <span className="eq" aria-hidden="true"><i /><i /><i /></span>
            {spotify.url ? (
              <a href={spotify.url} target="_blank" rel="noreferrer">
                {spotify.title}{spotify.artist ? ` · ${spotify.artist}` : ''}
              </a>
            ) : (
              <span>{spotify.title}</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
