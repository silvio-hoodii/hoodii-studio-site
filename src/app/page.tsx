import { fetchSpotify } from '@/lib/fetchers';
import './hub.css';

export const revalidate = 60;

/* Line art, drawn rather than imported. AGENTS.md rule: no human in the asset loop, and no image
 * files to go stale. Single stroke weight, round caps, one accent colour. Each one has to read at
 * 46px on a phone, which is why they are silhouettes rather than scenes. */

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Pot() {
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <g {...S}>
        <path d="M10 22h28v11a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5V22Z" />
        <path d="M8 22h32" />
        <path d="M10 26H7a2 2 0 0 1 0-4h3M38 26h3a2 2 0 0 0 0-4h-3" />
        <path d="M21 15c0-2 2-2 2-4s-2-2-2-4M28 15c0-2 2-2 2-4s-2-2-2-4" />
      </g>
    </svg>
  );
}

function Dumbbell() {
  // Was a kettlebell for two drafts and read as a handbag both times, because a kettlebell is a
  // blob with a small arc unless it is drawn large. A dumbbell is a bar and four plates and cannot
  // be mistaken for anything else at 46px.
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <g {...S}>
        <path d="M14 24h20" />
        <path d="M11 17.5v13M15.5 14v20" />
        <path d="M37 17.5v13M32.5 14v20" />
      </g>
    </svg>
  );
}

function Book() {
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <g {...S}>
        <path d="M24 16v22" />
        <path d="M24 16c-3.5-2.5-8-3.5-14-3v22c6-.5 10.5.5 14 3" />
        <path d="M24 16c3.5-2.5 8-3.5 14-3v22c-6-.5-10.5.5-14 3" />
      </g>
    </svg>
  );
}

function Bubble() {
  // A speech bubble with an actual accented letter in it. An abstract accent tick was unreadable at
  // 46px and could have meant anything; the glyph says "another language" with no decoding.
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <g {...S}>
        <path d="M11 12h26a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H24l-9 6.5V34h-4a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z" />
      </g>
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="15"
        fontWeight="600"
        fontFamily="ui-serif, Georgia, serif"
      >
        é
      </text>
    </svg>
  );
}

function Waves() {
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <g {...S}>
        <path d="M8 19c3.2 0 3.2 3 6.4 3s3.2-3 6.4-3 3.2 3 6.4 3 3.2-3 6.4-3 3.2 3 6.4 3" />
        <path d="M8 27c3.2 0 3.2 3 6.4 3s3.2-3 6.4-3 3.2 3 6.4 3 3.2-3 6.4-3 3.2 3 6.4 3" />
        <path d="M8 35c3.2 0 3.2 3 6.4 3s3.2-3 6.4-3 3.2 3 6.4 3 3.2-3 6.4-3 3.2 3 6.4 3" />
      </g>
    </svg>
  );
}

function Lamp() {
  return (
    <svg className="art" viewBox="0 0 48 48" aria-hidden="true">
      <g {...S}>
        <path d="M12 40h18" />
        <path d="M21 40v-1a2 2 0 0 1 2-2h1" />
        <path d="M17 38 27 20" />
        <path d="M27 20 21 17" />
        <path d="m26 11 10 5-5 8-10-5 5-8Z" />
      </g>
    </svg>
  );
}

function Lock() {
  return (
    <svg className="key" viewBox="0 0 12 12" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
        <rect x="2.2" y="5.2" width="7.6" height="5.6" rx="1.3" />
        <path d="M4 5.2V3.8a2 2 0 0 1 4 0v1.4" />
      </g>
    </svg>
  );
}

type State = 'open' | 'locked' | 'shut';

interface Place {
  name: string;
  desc: string;
  href?: string;
  state: State;
  art: React.ReactNode;
  external?: boolean;
}

/* Honest states only. `shut` means it genuinely is not here yet, and it renders as a dashed card
 * with no link rather than a promise that 404s. Gym and French run on the laptop over Tailscale
 * today, which is why they are not doors on this page. */
const PLACES: Place[] = [
  {
    name: 'Kitchen',
    desc: 'What I can cook from what is actually in the fridge, one step at a time.',
    href: '/kitchen',
    state: 'locked',
    art: <Pot />,
  },
  {
    name: 'Reading',
    desc: 'The shelf, the queue, and whether a book is worth keeping.',
    href: 'https://readingos.vercel.app',
    state: 'open',
    art: <Book />,
    external: true,
  },
  {
    name: 'Swim',
    desc: 'Sessions, drills, and what to work on in the water.',
    href: 'https://swim.hoodii.studio',
    state: 'open',
    art: <Waves />,
    external: true,
  },
  {
    name: 'Gym',
    desc: 'Upper/lower split, logged between sets. Still on the laptop.',
    state: 'shut',
    art: <Dumbbell />,
  },
  {
    name: 'French',
    desc: 'Review queue built from three physical books. Still on the laptop.',
    state: 'shut',
    art: <Bubble />,
  },
  {
    name: 'Desk',
    desc: 'What I build, and how to reach me.',
    href: 'https://github.com/silvio-hoodii',
    state: 'open',
    art: <Lamp />,
    external: true,
  },
];

function PlaceCard({ p }: { p: Place }) {
  const inner = (
    <>
      {p.art}
      <div>
        <h2>{p.name}</h2>
        {p.state === 'locked' && (
          <span className="badge locked"><Lock /> Just me</span>
        )}
        {p.state === 'shut' && <span className="badge">Not moved yet</span>}
      </div>
      <p>{p.desc}</p>
    </>
  );

  if (p.state === 'shut' || !p.href) {
    return <div className="place shut">{inner}</div>;
  }
  return (
    <a
      className="place"
      href={p.href}
      {...(p.external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {inner}
    </a>
  );
}

export default async function Home() {
  const spotify = await fetchSpotify();

  return (
    <div className="hub">
      <div className="wrap">
        <header>
          <h1 className="name">Silvio Neyra</h1>
          <p className="blurb">
            I build small software for an audience of one, mostly to answer questions I got tired of
            asking myself. This is where those live.
          </p>
        </header>

        <p className="section">The house</p>
        <div className="grid">
          {PLACES.map((p) => <PlaceCard key={p.name} p={p} />)}
        </div>

        <footer>
          <span>Calgary</span>
          <a href="https://brixelcorp.com" target="_blank" rel="noreferrer">Brixel</a>
          <a href="https://github.com/silvio-hoodii" target="_blank" rel="noreferrer">GitHub</a>
          {spotify.isPlaying && spotify.title && (
            <span className="nowplaying">
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
        </footer>
      </div>
    </div>
  );
}
