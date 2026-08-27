import { NextResponse, type NextRequest } from 'next/server';

/* What is gated, and why it is so little.
 *
 * Stated 2026-08-09: "I don't care about people seeing my fridge. What's the point? ... I just
 * don't want to put a password every time that I want to check my kitchen."
 *
 * So kitchen PAGES are public. Recipes are worth sharing, and a locked front door on a personal
 * index is friction with nothing behind it. The one thing that genuinely needs protecting is
 * WRITES: an open POST to /kitchen/api/* would let anyone put junk in his stock or his cook log, and
 * those are append-only event logs that everything else is derived from.
 *
 * Gym, Health and French were page-gated on 2026-08-10 with the migration off Tailscale, on the
 * theory that training weights and body composition read as more personal than fridge contents.
 *
 * They are all PUBLIC as of 2026-08-11. Silvio: "I don't mind the world seeing my weight body fat,
 * etc, same thing for the kitchen stuff." The gate was protecting a judgement he does not hold, and
 * it was hiding the only pages on this site that show what any of this actually does. What is
 * private here is not the numbers, it is the ability to change them.
 *
 * So the rule is now uniform and simple: every page is public, every write needs the cookie. The
 * event logs, the set log and the card store are append-only and everything else is derived from
 * them, so an open POST is the one thing that could actually do damage.
 *
 * The machinery below is deliberately left in place rather than deleted. Re-gating a route is
 * putting one string back in GATED_PAGES, and the login pages still exist and still work, which is
 * how a write gets authorised.
 *
 * The cookie lasts a year: one login per device, ever, not one per visit.
 */

const GATED_PAGES: string[] = [];
const LOGIN_PATHS = ['/gym/login', '/health/login', '/french/login'];

function loginPathFor(pathname: string): string {
  if (pathname.startsWith('/gym')) return '/gym/login';
  if (pathname.startsWith('/health')) return '/health/login';
  if (pathname.startsWith('/french')) return '/french/login';
  return '/kitchen/login';
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = req.cookies.get('kos')?.value === process.env.KITCHEN_SESSION_SECRET;

  /* The unlock route is how a device BECOMES authorised, so it cannot require being authorised.
   * Added 2026-08-11 with the inline unlock: /kitchen/login still exists, but a write that fails
   * mid-cook now offers the password field in place rather than sending him off to find a page. */
  if (pathname === '/kitchen/api/unlock') return NextResponse.next();

  /* Two routes that READ but are shaped as POSTs, because both take a body the URL cannot carry:
   * /gym/api/plan is handed the day's exercise list and returns suggestions, /gym/api/session is
   * handed a date and returns the sets already logged for it. Neither writes anything.
   *
   * The rule here is "reads are open, writes need the cookie", and the method was standing in for
   * that rule. It got these two wrong. Found 2026-08-14 by an adversarial pass: on a device without
   * the cookie both 401d, the client swallowed it, and /gym then rendered an empty grid and
   * "0/20 sets" for a day that may have a full session in the database. The page was making a claim
   * about the store out of a request the store never answered. Gating by intent rather than by verb
   * is what stops that, so they are named here rather than left to a method check that cannot see
   * the difference. */
  if (pathname === '/gym/api/plan' || pathname === '/gym/api/session') return NextResponse.next();

  // Writes to the event logs / set log / card store.
  /* /reading/api joined this on 2026-08-21 with the want list. Every /reading PAGE stays public,
   * the same as the rest of the site; only the write is gated. An unauthenticated POST that adds
   * books to a want list is not a want list, it is a guestbook. */
  /* /swim/api joined on 2026-08-26, when the swim tracker left /gym for its own route and took
   * the calibration-baseline write with it. TWO edits were needed, not one: this prefix, and
   * '/swim/api/:path*' in the `config.matcher` at the bottom of this file. The matcher named no
   * /swim path at all, so adding the prefix on its own would have read as a gate and been none. */
  if (pathname.startsWith('/kitchen/api') || pathname.startsWith('/gym/api')
      || pathname.startsWith('/french/api') || pathname.startsWith('/reading/api')
      || pathname.startsWith('/swim/api')) {
    if (req.method === 'GET' || authed) return NextResponse.next();
    return NextResponse.json(
      { ok: false, error: 'locked', hint: 'Sign in once and this device stays signed in.' },
      { status: 401 },
    );
  }

  if (
    GATED_PAGES.some((p) => pathname.startsWith(p)) &&
    !authed &&
    !LOGIN_PATHS.some((p) => pathname.startsWith(p))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = loginPathFor(pathname);
    url.searchParams.set('to', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/kitchen/:path*',
    '/gym/:path*',
    '/health/:path*',
    '/french/:path*',
    '/reading/api/:path*',
    /* Only the API, not the pages: /swim is public like every other page on this site. */
    '/swim/api/:path*',
  ],
};
