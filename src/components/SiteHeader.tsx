import Link from 'next/link';

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
export default function SiteHeader({ app }: { app?: string }) {
  return (
    <header className="site-header">
      <div className="site-header-in">
        <Link href="/">Silvio Neyra</Link>
        {app && <span>{app}</span>}
      </div>
    </header>
  );
}
