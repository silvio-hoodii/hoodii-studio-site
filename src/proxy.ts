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
 * Gym is the "something private" this comment already foresaw: training weights/reps read as more
 * personal than fridge contents, so /gym pages themselves are gated too, not just its writes — added
 * 2026-08-10 with the migration off Tailscale. Same cookie as kitchen ('kos',
 * KITCHEN_SESSION_SECRET): one login for the whole hub, not a second password.
 *
 * The cookie lasts a year — one login per device, ever, not one per visit.
 */

const GATED_PAGES: string[] = ['/gym'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = req.cookies.get('kos')?.value === process.env.KITCHEN_SESSION_SECRET;

  // Writes to the event logs / set log.
  if (pathname.startsWith('/kitchen/api') || pathname.startsWith('/gym/api')) {
    if (req.method === 'GET' || authed) return NextResponse.next();
    return NextResponse.json(
      { ok: false, error: 'locked', hint: 'Sign in once and this device stays signed in.' },
      { status: 401 },
    );
  }

  if (GATED_PAGES.some((p) => pathname.startsWith(p)) && !authed && !pathname.startsWith('/gym/login')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith('/gym') ? '/gym/login' : '/kitchen/login';
    url.searchParams.set('to', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = { matcher: ['/kitchen/:path*', '/gym/:path*'] };
