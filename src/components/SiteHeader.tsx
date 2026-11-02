import Link from 'next/link';

/* One way home, in the same place, on every surface that is not the front page. It lives in the
 * LAYOUTS rather than in the pages so a new route gets a way home whether or not anyone remembers
 * to add one. Server component on purpose: it is a link and nothing here should ship JS.
 *
 * It reads `--measure`, the one reading column the whole site shares.
 *
 * The app row that sat beside the home link (Training, Curio, Music, Reading) went with those apps
 * on 2026-11-02; with one app left there is nothing to switch between. */
export default function SiteHeader() {
  return (
    <header className="site-header">
      <nav className="site-header-in" aria-label="Home">
        <Link href="/" className="home">Silvio Neyra</Link>
      </nav>
    </header>
  );
}