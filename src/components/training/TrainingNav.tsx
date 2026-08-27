'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ONE ROW, FIVE ROUTES, MOUNTED IN EVERY LAYOUT. Phase C, 2026-08-27.
 *
 * Training used to be two routes and a query string: /gym for lifting, and /gym/conditioning?p=run,
 * ?p=bike, ?p=swim for everything else. Swim escaped on 2026-08-26. This finishes the job: run and
 * bike get routes of their own, /gym is lifting and only lifting, and /health becomes the index the
 * other four hang off.
 *
 * IN THE LAYOUTS, NOT THE PAGES. The house rule that put SiteHeader and GymNav there holds for the
 * same reason: a route added later inherits an entrance whether or not anyone remembers to add one.
 * /gym/conditioning shipped on 2026-08-16 with its only entrance being the word "conditioning"
 * inside a sentence, and he found it by reading the source: "There is no way for me to go to
 * conditioning other than actually type in the URL."
 *
 * REPLACES GymNav, which said Workout / The week. That component existed to make a second gym page
 * discoverable, and there is no second gym page any more.
 *
 * `surf-tab`, NOT `tab`. These look like the day tabs on /gym and share their rules in training.css,
 * but they must not ANSWER to `.tab`: scripts/probe-gym.js selects `.tab` to test day switching, and
 * the first version of GymNav made that selector ambiguous. The harness clicked through to the
 * other page and SEVENTEEN tests failed with "no set row" and "no note box". A shared look is a CSS
 * decision. A shared class name is an API.
 *
 * BODY IS LAST, not first, even though it is the index. The four disciplines are what he opens the
 * phone to reach; the index is where he goes to ask how the week went. Ordering it first would put
 * the least-used tap under his thumb at the top of every training page.
 */
const ROUTES = [
  { href: '/gym', label: 'Lift' },
  { href: '/swim', label: 'Swim' },
  { href: '/run', label: 'Run' },
  { href: '/bike', label: 'Bike' },
  { href: '/health', label: 'Body' },
] as const;

export default function TrainingNav() {
  const pathname = usePathname();
  /* Exact, or a real child segment. `startsWith(href)` alone would light "Lift" on a future
     /gymnastics, which is the class of bug that is invisible until the route exists. */
  const here = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="surface-nav" aria-label="Training">
      {ROUTES.map((r) => (
        <Link
          key={r.href}
          href={r.href}
          className={`surf-tab${here(r.href) ? ' on' : ''}`}
          aria-current={here(r.href) ? 'page' : undefined}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
