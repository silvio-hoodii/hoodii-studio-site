/* THE ONE COMPARISON. Every gate on this site resolves to this function.
 *
 * It exists because `src/proxy.ts` did the comparison inline and did it FAIL-OPEN, found by the
 * 2026-08-26 security audit (06-security.md P1-1):
 *
 *     const authed = req.cookies.get('kos')?.value === process.env.KITCHEN_SESSION_SECRET;
 *
 * With `KITCHEN_SESSION_SECRET` unset, a request carrying NO cookie evaluates
 * `undefined === undefined` and every gated write route treats the anonymous internet as Silvio.
 * The write routes are public knowledge: this repo is public on GitHub. One missing env var on one
 * deploy opened the stock ledger, the cook log, the training log, the French card store, the want
 * list and the swim baseline.
 *
 * The DB modules (`lib/kitchen/db.ts`, `lib/gym/db.ts`, `lib/swim/db.ts`) all THROW on a missing
 * connection string, so they fail closed. The proxy was the one gate that must not fail open and was
 * the only one that did.
 *
 * WHY A MODULE AND NOT A FIXED LINE. Per law 1 in `.agents/ENGINEERING.md`: eliminate the class, do
 * not validate the instance. A fixed comparison in proxy.ts leaves the class representable, because
 * anything else that wants to know "is this Silvio" writes the comparison again. `wantByUrl` needed
 * exactly that the same day (audit theme T1). So there is one function, it is fail-closed, and
 * `scripts/lint-auth-compare.mjs` fails the build on a second implementation of it.
 *
 * NO IMPORTS IN THIS FILE, deliberately. `src/proxy.ts` runs in the Edge runtime and cannot reach
 * `next/headers` or node builtins. The server-side reader that needs the cookie jar lives in
 * `src/lib/auth-server.ts`, which imports this rather than repeating it.
 */

/** The cookie's name, so it is spelled once. */
export const AUTH_COOKIE = 'kos';

/**
 * Does this cookie value authorise a write?
 *
 * FAIL-CLOSED: an unset or empty `KITCHEN_SESSION_SECRET` authorises NOBODY. That is the whole
 * point of the function, so do not add a development bypass to it.
 */
export function cookieAuthorises(cookieValue: string | undefined | null): boolean {
  const secret = process.env.KITCHEN_SESSION_SECRET;
  if (!secret) return false;
  return cookieValue === secret;
}
