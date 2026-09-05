import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '@/lib/auth';
import { WRONG_PASSWORD_DELAY_MS } from '@/lib/login-server';

/* The inline unlock: answers JSON to a fetch from a write box, so a locked device types the password
 * where the write failed instead of being sent to /login. One of three files allowed to read the
 * secret (scripts/lint-auth.mjs), and the one shared by every surface's SaveBlocked. Kept verbatim
 * through the 2026-09-05 kitchen rebuild for that reason. */
export async function POST(req: Request) {
  let pw = '';
  try {
    pw = String(((await req.json()) as { pw?: unknown }).pw ?? '');
  } catch {
    return Response.json({ ok: false, error: 'bad-body' }, { status: 400 });
  }

  const expected = process.env.KITCHEN_PASSWORD;
  const secret = process.env.KITCHEN_SESSION_SECRET;
  if (!expected || !secret) {
    return Response.json({ ok: false, error: 'not-configured' }, { status: 500 });
  }

  if (pw !== expected) {
    await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
    return Response.json({ ok: false, error: 'wrong' }, { status: 401 });
  }

  (await cookies()).set(AUTH_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return Response.json({ ok: true });
}
