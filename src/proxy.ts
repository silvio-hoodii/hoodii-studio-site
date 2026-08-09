import { NextResponse, type NextRequest } from 'next/server';

/** /kitchen is his fridge, his body-composition-derived protein target, and what he ate.
 *  hoodii.studio is a public site, so the route is gated. Everything else is untouched. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/kitchen')) return NextResponse.next();
  if (pathname.startsWith('/kitchen/login')) return NextResponse.next();

  const token = req.cookies.get('kos')?.value;
  if (token && token === process.env.KITCHEN_SESSION_SECRET) return NextResponse.next();

  if (pathname.startsWith('/kitchen/api')) {
    return NextResponse.json({ ok: false, error: 'locked' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/kitchen/login';
  url.searchParams.set('to', pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/kitchen/:path*'] };
