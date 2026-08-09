import { NextResponse, type NextRequest } from 'next/server';

/* What is gated, and why it is so little.
 *
 * Stated 2026-08-09: "I don't care about people seeing my fridge. What's the point? ... I just
 * don't want to put a password every time that I want to check my kitchen."
 *
 * So the PAGES are public. Recipes are worth sharing, and a locked front door on a personal index
 * is friction with nothing behind it. The one thing that genuinely needs protecting is WRITES: an
 * open POST to /kitchen/api/* would let anyone put junk in his stock or his cook log, and those are
 * append-only event logs that everything else is derived from.
 *
 * So writes need the cookie, which lasts a year. That is one login per device, ever, not one per
 * visit. If something private lands later (body composition from HealthOS is the obvious one), add
 * its prefix to GATED_PAGES.
 */

const GATED_PAGES: string[] = [];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = req.cookies.get('kos')?.value === process.env.KITCHEN_SESSION_SECRET;

  // Writes to the event logs.
  if (pathname.startsWith('/kitchen/api')) {
    if (req.method === 'GET' || authed) return NextResponse.next();
    return NextResponse.json(
      { ok: false, error: 'locked', hint: 'Sign in once at /kitchen/login and this device stays signed in.' },
      { status: 401 },
    );
  }

  if (GATED_PAGES.some((p) => pathname.startsWith(p)) && !authed) {
    const url = req.nextUrl.clone();
    url.pathname = '/kitchen/login';
    url.searchParams.set('to', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = { matcher: ['/kitchen/:path*'] };
