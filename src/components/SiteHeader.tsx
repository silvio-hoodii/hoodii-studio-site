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
 * `measure` exists only because /music sets a 780px column while everything else uses 680px, so a
 * fixed width here would misalign the header against the content under it. When the measure gets
 * unified into one token this prop goes away.
 */
export default function SiteHeader({ app, measure }: { app?: string; measure?: number }) {
  return (
    <header className="site-header">
      <div className="site-header-in" style={measure ? { maxWidth: measure } : undefined}>
        <Link href="/">Silvio Neyra</Link>
        {app && <span>{app}</span>}
      </div>
    </header>
  );
}
