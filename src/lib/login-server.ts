import 'server-only';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from './auth';

/* THE ONE PLACE THE COOKIE GETS SET from a login form.
 *
 * There were four copies of this, one per login page (/kitchen, /gym, /health, /french), each
 * twenty identical lines, each carrying the same two defects the 2026-08-26 security audit named:
 *
 *   P2-2. No failure delay. `/kitchen/api/unlock` waits 600ms on a wrong password and says in its
 *         own comment why. The four server actions, which accept the same password against the same
 *         cookie, waited zero. Off-repo Vercel firewall rule 4 caps 150 requests per minute per IP,
 *         which does not compose across IPs and is the only other brake on the single credential
 *         for the entire write surface.
 *
 *   `process.env.KITCHEN_SESSION_SECRET!`. A non-null assertion on an env var. With the password
 *         set and the secret unset, `cookies().set('kos', undefined)` writes an empty cookie and the
 *         page redirects as though the login worked. Nothing then writes, and nothing says why.
 *
 * Both are gone here, and the reason they are gone from ONE file rather than fixed in four is law 1:
 * four copies of a credential check is four places for the next one to drift. `/kitchen/api/unlock`
 * stays separate on purpose, because it answers JSON to a fetch mid-cook rather than redirecting a
 * form, but it now shares this delay constant.
 */

/** The deliberate wait on a wrong password. Shared with `/kitchen/api/unlock`. */
export const WRONG_PASSWORD_DELAY_MS = 600;

export type LoginOutcome = 'ok' | 'wrong' | 'not-configured';

/**
 * Check a submitted password and, if it is right, authorise this device for a year.
 *
 * Returns an outcome rather than redirecting, because `redirect()` throws and the caller owns where
 * it goes. Fail-closed: if either env var is missing nobody gets a cookie, and the caller can say
 * so instead of pretending the password was wrong.
 */
export async function signInWithPassword(pw: string): Promise<LoginOutcome> {
  const expected = process.env.KITCHEN_PASSWORD;
  const secret = process.env.KITCHEN_SESSION_SECRET;
  if (!expected || !secret) return 'not-configured';

  if (!pw || pw !== expected) {
    await new Promise((r) => setTimeout(r, WRONG_PASSWORD_DELAY_MS));
    return 'wrong';
  }

  (await cookies()).set(AUTH_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return 'ok';
}
