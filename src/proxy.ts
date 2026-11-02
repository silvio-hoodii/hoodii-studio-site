import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, cookieAuthorises } from '@/lib/auth';

/* What is gated, and why it is so little.
 *
 * Every PAGE on this site is public; only WRITES need the cookie. What is private is not the
 * numbers, it is the ability to change them (his ruling, 2026-08-11: "I don't mind the world seeing
 * my weight body fat"). The set log is append-only and everything else is derived from it, so an
 * open POST is the one thing that could do damage.
 *
 * The cookie lasts a year: one login per device, ever, not one per visit.
 *
 * Stripped on 2026-11-02 to the gym. The /kitchen, /swim, /curio and /me prefixes left with their
 * routes; recover them from the tag before-strip-2026-11-02.
 */

const GATED_PAGES: string[] = [];

/* ONE LOGIN PATH, since 2026-09-04. Kept as a constant because it is still load-bearing for the
 * redirect below: without the exemption, re-gating a page whose prefix also covers the login path
 * would send the proxy in a loop. `/login` is not in `config.matcher`, so today the proxy never runs
 * on it, but a matcher entry is one line and this guard is what makes adding one safe. */
const LOGIN_PATH = '/login';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  /* FAIL-CLOSED, and the comparison is not written here. See `src/lib/auth.ts` for the account; a
   * second copy of this comparison anywhere fails `scripts/lint-auth.mjs`. */
  const authed = cookieAuthorises(req.cookies.get(AUTH_COOKIE)?.value);

  /* The unlock route is how a device BECOMES authorised, so it cannot require being authorised.
   * It answers a fetch from src/components/SaveBlocked.tsx so a write that fails at the rack offers
   * the password field in place rather than sending him off to find a page. */
  if (pathname === '/api/unlock') return NextResponse.next();

  /* Two routes that READ but are shaped as POSTs, because both take a body the URL cannot carry:
   * /gym/api/plan is handed the day's exercise list and returns suggestions, /gym/api/session is
   * handed a date and returns the sets already logged for it. Neither writes anything. Gating by
   * intent rather than by verb is what stops /gym rendering an empty grid and "0/20 sets" for a day
   * that has a full session in the database (found 2026-08-14). */
  if (pathname === '/gym/api/plan' || pathname === '/gym/api/session') return NextResponse.next();

  // Writes to the set log.
  if (pathname.startsWith('/gym/api')) {
    if (req.method === 'GET' || authed) return NextResponse.next();
    return NextResponse.json(
      { ok: false, error: 'locked', hint: 'Sign in once and this device stays signed in.' },
      { status: 401 },
    );
  }

  if (
    GATED_PAGES.some((p) => pathname.startsWith(p)) &&
    !authed &&
    !pathname.startsWith(LOGIN_PATH)
  ) {
    /* The destination is captured BEFORE the clone is rewritten, because the clone still carries
       the original query string and `searchParams.set` would append `to` beside it. */
    const destination = pathname + (req.nextUrl.search || '');
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = '';
    url.searchParams.set('to', destination);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /* API prefixes only. Re-gating a page means adding its prefix to GATED_PAGES AND to this list;
       the branch above is kept so that is two lines, not a rewrite. */
    '/api/unlock',
    '/gym/api/:path*',
  ],
};