'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* The gym is two pages, and until now only one of them was discoverable.
 *
 * /gym/conditioning shipped on 2026-08-16 with its only entrance being the word "conditioning"
 * inside a sentence. Silvio, the same day: "There is no way for me to go to conditioning other than
 * actually type in the URL... I found out that the link is there. It's just that it's not evident
 * that it's a clickable piece of text."
 *
 * He is right twice. The specific fix is this: the two surfaces are a visible choice at the top of
 * both of them, in the tab idiom already used for the days, so "there is a second page" is
 * something you SEE rather than something you have to be told. The systemic fix is in gym.css,
 * where inline links inside prose now carry an underline, because a link that looks exactly like
 * the text around it is not a link on a phone.
 *
 * Sits ABOVE the h1 on purpose. The hierarchy reads: which page, then the page title, then which
 * day. Putting it below would have given the screen two rows of identical chips meaning two
 * different things, which is the inverted hierarchy that made the blocks unreadable in August.
 *
 * A client component only because it needs usePathname to know which of the two it is on.
 */
export default function GymNav() {
  const pathname = usePathname();
  const here = (href: string) => (href === '/gym' ? pathname === '/gym' : pathname.startsWith(href));

  const surfaces = [
    { href: '/gym', label: 'Workout' },
    { href: '/gym/conditioning', label: 'Conditioning' },
  ];

  /* `surf-tab`, NOT `tab`. These look like the day tabs and share their rules in gym.css, but they
   * must not ANSWER to `.tab`: probe-gym.js selects `.tab` to test day switching, and the first
   * version of this component made that selector ambiguous. The harness clicked "Conditioning",
   * navigated off /gym, and 17 tests failed with "no set row" and "no note box".
   * A shared look is a CSS decision. A shared class name is an API. */
  return (
    <nav className="surface-nav" aria-label="Gym pages">
      {surfaces.map((s) => (
        <Link key={s.href} href={s.href} className={`surf-tab${here(s.href) ? ' on' : ''}`} aria-current={here(s.href) ? 'page' : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
