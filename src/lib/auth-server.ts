import 'server-only';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, cookieAuthorises } from './auth';

/* The same question as `src/proxy.ts` asks, asked from inside a server component or a server action,
 * where there is no NextRequest.
 *
 * `src/proxy.ts` gates POSTs under the api prefixes and nothing else, which is right for the site's
 * posture (every page public, every write gated). It cannot gate a GET page by side effect, and
 * `/kitchen/want?url=` is a GET page with a server-side fetch behind it: the 2026-08-26 audit's
 * theme T1, one finding that was security AND cost at once. 15,367 invocations during the
 * meta-externalagent scrape, an arbitrary-URL fetch with a spoofed Chrome user agent, available to
 * anybody.
 *
 * This is separate from `src/lib/auth.ts` only because `next/headers` cannot be imported into the
 * Edge proxy. The comparison itself is not repeated here.
 */

/** Is the caller carrying the write cookie? Fail-closed, via `cookieAuthorises`. */
export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  return cookieAuthorises(jar.get(AUTH_COOKIE)?.value);
}
