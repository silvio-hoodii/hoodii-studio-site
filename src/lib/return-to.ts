/* WHERE A LOGIN IS ALLOWED TO SEND YOU, and the label it puts above the form.
 *
 * A3 of the 2026-09-04 audit. Tapping "want" on a locked device at /reading/shelf sent him to
 * `/kitchen/login?to=/reading/shelf`, and the kitchen login page then did:
 *
 *     if (outcome === 'ok') redirect(to.startsWith('/kitchen') ? to : '/kitchen');
 *
 * `/reading/shelf` does not start with `/kitchen`, so a CORRECT password landed him in the kitchen,
 * two apps away from the book he was about to save. All four login pages carried their own version
 * of that prefix check, each naming its own app, each written when that app was the only gated one.
 *
 * THE GUARD WAS RIGHT IN INTENT AND WRONG IN SCOPE. What a return path must not do is leave the
 * site: `?to=https://evil.example` or `?to=//evil.example` on a login form is an open redirect, and
 * it is worth more here than usual because the thing on the other side of this form is the only
 * credential on the site. What it must be allowed to do is go to any page on this origin, which is
 * exactly what the four prefix checks forbade.
 *
 * So: one function, same-origin only, no app names in it. A new gated app needs no edit here, which
 * is the property the four prefix checks did not have.
 *
 * This is a separate module from `login-server.ts` on purpose. That file is `server-only`, and a
 * pure string function that a test can import should not drag a server-only import into the test
 * process. `return-to.test.ts` is the suite; `scripts/verify.mjs` runs it.
 */

/** The default landing place when there is no usable `to`. The hub, because it is the one page that
 *  can reach everything else, and because a login with no destination is someone who typed the URL. */
export const DEFAULT_RETURN_TO = '/';

/**
 * A same-origin path from an untrusted `to` parameter, or the fallback.
 *
 * Accepts any absolute path on this origin. Rejects, in order:
 *
 *   - anything that is not a string, or is empty
 *   - anything not starting with `/`, which covers `https://evil.example` and `javascript:...`
 *   - `//host` and `/\host`, both of which browsers resolve as PROTOCOL-RELATIVE and therefore
 *     off-site. The backslash form matters because it is the one people forget: WHATWG URL parsing
 *     treats `\` as equivalent to `/` in the authority position, so `/\evil.example` navigates to
 *     evil.example in every current browser while passing a naive `startsWith('//')` check.
 *   - a control character or whitespace anywhere, which is how the two checks above get smuggled
 *     past a parser that strips them later (`/\tevil.example`, `/ /evil.example`).
 */
export function safeReturnTo(to: unknown, fallback: string = DEFAULT_RETURN_TO): string {
  if (typeof to !== 'string' || to.length === 0) return fallback;
  if (!to.startsWith('/')) return fallback;
  /* Both protocol-relative spellings. Checked on the raw string BEFORE any normalisation, because
     normalising first is what creates the gap. */
  if (to.startsWith('//') || to.startsWith('/\\')) return fallback;
  /* C0 controls, space and DEL, checked BY CHARACTER CODE and not by a regex range.
     A path carrying a tab, a newline or a space is not a path this site generated, and the reason
     to reject one is that a parser downstream may strip the whitespace and turn a smuggled value
     back into a protocol-relative URL after the check above has already passed.

     No regex here, and no backslash escape anywhere in this function, which is deliberate. Two
     earlier drafts of this line put the range in a character class and both ended up with literal
     NUL and DEL BYTES in this source file: an escape written in one layer and decoded in another
     produces the raw character, git reports the file as binary, and scripts/lint-prose.mjs refuses
     it. That linter exists because two BACKSPACE bytes baked into a regex by a bad escape once made
     /friday/i unable to match "Friday" while every gate in the repo passed. A comparison on
     charCodeAt has no escape layer to get wrong. */
  for (let i = 0; i < to.length; i++) {
    const code = to.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return fallback;
  }
  return to;
}

/**
 * The eyebrow above the login form, derived from where the person was going.
 *
 * DERIVED AND NOT A MAP, which is the point. The four login pages each hardcoded their own label
 * ("Kitchen", "Gym", "Health", "French"), and capitalising the first path segment produces exactly
 * those four plus the right answer for every app that had no login page of its own: `/reading/shelf`
 * gives "Reading", `/swim` gives "Swim". A hand-kept list of app names would be one more copy to go
 * stale, which is the drift AGENTS.md's own surfaces table records losing to.
 *
 * Returns null for the hub or an unusable path, and the form then shows no eyebrow rather than a
 * made-up one.
 */
export function returnToLabel(to: string): string | null {
  const seg = to.split('/')[1]?.split('?')[0]?.trim();
  if (!seg) return null;
  /* Letters only. A segment that is a slug, an id or anything with punctuation in it is not an app
     name, and titling it would print something like "12-Rules-For-Life" over a password field. */
  if (!/^[a-z]+$/i.test(seg)) return null;
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
}
