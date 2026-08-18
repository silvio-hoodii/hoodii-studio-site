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
/* THREE TABS, AND THEY ARE NOUNS. Changed 2026-08-18, on his verdict: "are those 4 pages/section
 * making sense i dont think so", and before that "i dont understand where the shopping list is in the
 * app, worth buying section is not it, so i dont know how navigation works".
 *
 * What was wrong, seen on a 390px screenshot rather than in the source:
 *
 *   - Four sentence-length labels WRAPPED onto two lines, so the strip read as four unrelated links
 *     instead of a set of places.
 *   - The labels were intentions, not destinations. "I want a specific dish" cannot be recognised as
 *     "the search lives here", and it asks the same question "What could I make" does from the other
 *     end. Both end at "this dish needs X".
 *   - `Worth buying` was an analysis of what would unlock the most dishes, and he opened it looking
 *     for a shopping list. There wasn't one anywhere.
 *   - The home page then repeated three of the four destinations as prose links, worded differently
 *     from the strip, pushing the actual answer below the fold.
 *
 * `find` and `want` both live under DISHES now: the search box that used to be the whole `want` page
 * sits at the top of the scored list. `/kitchen/want` still exists and still handles a pasted URL, it
 * is just no longer a place you have to know about. */
const TABS = [
  { href: '/kitchen', key: 'home', label: 'Cook' },
  { href: '/kitchen/find', key: 'find', label: 'Dishes' },
  { href: '/kitchen/shop', key: 'shop', label: 'Shopping' },
] as const;

export default function KitchenNav({ here }: { here: 'home' | 'find' | 'want' | 'shop' }) {
  /* `want` is not a tab any more, so on that page DISHES is the one that lights up: it is where he
   * came from and where Back should feel like it goes. */
  const current = here === 'want' ? 'find' : here;
  return (
    <nav className="kosnav" aria-label="Kitchen">
      {TABS.map((t) => (
        t.key === current
          ? <span key={t.key} className="kosnav-here" aria-current="page">{t.label}</span>
          : <Link key={t.key} href={t.href}>{t.label}</Link>
      ))}
    </nav>
  );
}
