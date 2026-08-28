import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '@/lib/auth';
import { WRONG_PASSWORD_DELAY_MS } from '@/lib/login-server';

/* Unlock this device from wherever the write failed, without leaving the page.
 *
 * Why this exists, 2026-08-11. Every page went public because he does not want to type a password
 * to look at his own kitchen, which is right. Writes still need the cookie, because these are
 * append-only logs that stock levels, makeability and cook history are all derived from, and the
 * site is on the open internet with a public repo. But with no gated page left, nothing ever routed
 * him to /kitchen/login, so the lock had no keyhole: he cooked all evening, typed three notes, and
 * every one was silently refused. "Why is there a login? I don't understand."
 *
 * /kitchen/login still exists and still works. This is the same thing reachable in one tap from the
 * exact spot where the save failed, so authorising costs a password entry and not a journey.
 *
 * `proxy.ts` must exempt this path, since it gates every other POST under /kitchen/api and this
 * route IS how a device becomes authorised.
 */

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
    /* An endpoint that anyone may POST to is a password-guessing target, and this one has to be
     * open by definition. A deliberate delay on failure is the cheapest thing that makes an online
     * guessing attack impractical without adding state to track attempts.
     *
     * The constant moved to `src/lib/login-server.ts` on 2026-08-28, when the four login pages got
     * the same brake. They had none, which meant the same password against the same cookie was
     * guessable at whatever rate the network allowed on four of the five doors. */
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
