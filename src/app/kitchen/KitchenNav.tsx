import Link from 'next/link';

/* One strip, on every kitchen surface except the cook screen.
 *
 * Until now find, want and shop each carried a single "back to Kitchen" link and could not see each
 * other, so getting from "what could I make" to "what should I buy" meant going home and starting
 * again. Silvio, on this app: "the navigation and the whole experience still needs improving" and,
 * earlier, "there's nothing here that's intuitive".
 *
 * NOT on the cook screen, deliberately. Once a pan is on, the only navigation that should exist is
 * Next, Back and one way out, and a row of tempting links next to a hot stove is the opposite of that.
 *
 * `here` marks the current page rather than hiding it. A strip that changes shape per page is harder to
 * learn than one that stays put, and the current item is the anchor that makes the rest legible.
 */
const TABS = [
  { href: '/kitchen', key: 'home', label: 'Kitchen' },
  { href: '/kitchen/find', key: 'find', label: 'What could I make' },
  { href: '/kitchen/want', key: 'want', label: 'I want a specific dish' },
  { href: '/kitchen/shop', key: 'shop', label: 'Worth buying' },
] as const;

export default function KitchenNav({ here }: { here: 'home' | 'find' | 'want' | 'shop' }) {
  return (
    <nav className="kosnav" aria-label="Kitchen">
      {TABS.map((t) => (
        t.key === here
          ? <span key={t.key} className="kosnav-here" aria-current="page">{t.label}</span>
          : <Link key={t.key} href={t.href}>{t.label}</Link>
      ))}
    </nav>
  );
}
