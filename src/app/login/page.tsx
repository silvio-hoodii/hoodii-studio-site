import { redirect } from 'next/navigation';
import { signInWithPassword } from '@/lib/login-server';
import { safeReturnTo, returnToLabel, DEFAULT_RETURN_TO } from '@/lib/return-to';

export const dynamic = 'force-dynamic';

/* The gate has nothing to index. The four pages this replaced each carried this line, added
 * 2026-08-28 per 06-security P3-2, because robots.ts deliberately does not Disallow a login path
 * and so the page itself has to say it. */
export const metadata = { robots: { index: false, follow: false } };

/* ONE LOGIN ROUTE. There were four: /kitchen/login, /gym/login, /health/login and /french/login,
 * each about forty lines, differing in an eyebrow, a default path and a prefix check.
 *
 * They existed because each app was gated at a different time and each new one copied the last.
 * There is only ever ONE cookie ('kos') and ONE password for the whole site, so four forms was four
 * places for the next credential change to drift, and section F of the 2026-09-04 audit put them
 * under "what is not worth it" for exactly that reason.
 *
 * IT ALSO HELD A REAL BUG, A3, and the bug was a direct consequence of there being four. Each page
 * guarded its redirect with its own app's prefix:
 *
 *     if (outcome === 'ok') redirect(to.startsWith('/kitchen') ? to : '/kitchen');
 *
 * `/reading/shelf` sends a locked device here, and `/reading/shelf` does not start with `/kitchen`,
 * so a CORRECT password landed him in the kitchen, two apps away from the book he was saving.
 * /swim, /bike, /run and /reading never had login pages of their own and all borrowed the
 * kitchen's, so every one of them was broken the same way. The guard is now `safeReturnTo` in
 * `src/lib/return-to.ts`: same-origin, no app names in it, 40 cases in `return-to.test.ts`. A new
 * gated app needs no edit here, which is the property the four prefix checks did not have.
 *
 * WHY IT IS NOT INSIDE AN APP SEGMENT. It cannot be: it serves every app, so any parent it sat
 * under would be the wrong one for the other eight. That means it renders in the root layout with
 * no per-surface stylesheet loaded, so it styles itself under `.login` in globals.css. The 404 page
 * has the same constraint and solves it the same way, and the comment on `.notfound` says so.
 */
async function signIn(formData: FormData) {
  'use server';
  const to = safeReturnTo(formData.get('to'));
  const outcome = await signInWithPassword(String(formData.get('pw') ?? ''));
  if (outcome === 'ok') redirect(to);
  redirect(
    `/login?${outcome === 'not-configured' ? 'unconfigured' : 'bad'}=1&to=${encodeURIComponent(to)}`,
  );
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; bad?: string; unconfigured?: string }>;
}) {
  const sp = await searchParams;
  /* Sanitised on the way IN as well as on the way out. The value is echoed into a hidden input, so
     a hostile `to` would otherwise sit in the markup waiting for the next reader of this file to
     trust it. It is the same call either way, so there is nothing to keep in sync. */
  const to = safeReturnTo(sp.to);
  const label = returnToLabel(to);

  return (
    <div className="login">
      {/* Derived from `to`, not hardcoded: "Kitchen" for a dish page, "Reading" for the shelf,
          nothing at all when the destination is the hub. The four deleted pages each typed their
          own, which is why the shelf never got one. */}
      {label && <div className="eyebrow">{label}</div>}
      <h1>Locked</h1>
      <p>
        This one is just for you. One password for the whole site, and this device stays signed in.
      </p>
      <form action={signIn}>
        <input
          type="password"
          name="pw"
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
        />
        <input type="hidden" name="to" value={to} />
        {sp.bad && <p className="wrong">Not that one.</p>}
        {/* An unset password or secret is not a wrong password, and saying "not that one" to a
            correct one is how an afternoon goes. */}
        {sp.unconfigured && (
          <p className="wrong">
            No password is set on this deployment, so nothing can be unlocked here.
          </p>
        )}
        <button className="primary" type="submit">
          Open
        </button>
      </form>
      {/* The four pages this replaced sat inside an app layout and inherited its SiteHeader, so
          each had a way home. At the root there is no app layout, so the way home is explicit.
          A login page with no exit is the dead end AGENTS.md records these four having before the
          shared header existed. */}
      <a className="back" href={to === DEFAULT_RETURN_TO ? '/' : to}>
        {label ? `Back to ${label} without signing in` : 'Back to the index'}
      </a>
    </div>
  );
}
