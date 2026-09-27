import Link from 'next/link';
import Track from './Track';

/* One way home, in the same place, on every surface that is not the hub.
 *
 * Before this there were three idioms and several gaps. Kitchen, gym, health and french each
 * printed their own "back to Silvio Neyra" eyebrow inside the PAGE, so it existed on the four app
 * front doors and nowhere else: /kitchen/find, /kitchen/want, /kitchen/shop, every dish page and
 * all four login pages were dead ends with no link off them. Music and curio printed a different
 * thing again, a copy of the hub masthead. A visitor who landed on any subpage from a search
 * result had no way to discover the rest of the site existed.
 *
 * It lives in the LAYOUTS rather than in the pages, which is the actual fix: a new route under
 * /kitchen gets a way home whether or not anyone remembers to add one. A per-page eyebrow is a
 * rule that has to be followed, and the four login pages are the proof of what that is worth.
 *
 * Server component on purpose: it is a link and a label, and nothing here should ship JS.
 *
 * It takes no width. It reads `--measure`, the one reading column the whole site shares, so a
 * surface that needs a wider one (music, which is the only page with a three-column grid) overrides
 * that variable on a wrapper and the header follows it automatically. The prop this component used
 * to carry for exactly that job is gone, along with its own docstring predicting it would be.
 */
/* THE HEADER IS THE NAVIGATION SINCE 2026-09-27. It was a link home and a label, so going from the
 * gym to the swim page meant going home first, every time. His ask that day: "the navigation
 * experience ... that way I don't have to click so much". Every app is one tap from every other
 * now, and the one you are in is marked.
 *
 * Kitchen is not in the row: it left the front page the same day, and its dish pages are reached
 * from the links sessions send him. The row scrolls sideways rather than wrapping if it ever outgrows
 * a phone.
 *
 * Track counts the open, for him only; see Track.tsx. */
const NAV: { href: string; label: string; key: string }[] = [
  { href: '/gym', label: 'Training', key: 'training' },
  { href: '/curio', label: 'Curio', key: 'curio' },
  { href: '/music', label: 'Music', key: 'music' },
  { href: '/reading', label: 'Reading', key: 'reading' },
];

/* ONE "TRAINING" ENTRY, NOT THREE. The first version of this row listed Gym, Health and Swim, and on
   a phone the training pages then carried three stacked rows of navigation: this one, the training
   chips (Lift, Swim, Run, Bike, Body) and the page's own tabs, the first two naming the same places.
   The training chips already reach all five, so this row takes you into training and they take it
   from there. It lands on /gym because lifting is what he opens most. */
const SECTION: Record<string, string> = { gym: 'training', health: 'training', swim: 'training', run: 'training', bike: 'training' };

export default function SiteHeader({ app }: { app?: string }) {
  const key = app?.toLowerCase() ?? '';
  const here = SECTION[key] ?? key;
  return (
    <header className="site-header">
      <nav className="site-header-in" aria-label="Apps">
        <Link href="/" className="home">Silvio Neyra</Link>
        <div className="appnav">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} className={n.key === here ? 'on' : undefined}
              aria-current={n.key === here ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
      {key && key !== 'callback' && <Track app={key} />}
    </header>
  );
}
