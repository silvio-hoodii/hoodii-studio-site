import type { NextConfig } from "next";

/* The 2D site that used to serve this domain was bilingual and every indexed URL it left behind is
 * now a 404: /en, /es, /en/about, /es/about, /en/exploring, /es/exploring, /en/contact, /es/contact
 * and /studio, plus whatever case-study slugs sat under them. They were listed in that app's own
 * sitemap.ts, so search engines were told about all of them on purpose.
 *
 * A 404 tells a crawler "gone, and I have nothing to offer instead". A 308 tells it "this moved,
 * here it is", which passes the old page's standing to the front door rather than throwing it away.
 * :path* catches the deeper ones without anyone having to remember what they were.
 *
 * This does NOT clear the stale snippet Google is still serving. Only Search Console does that, and
 * it is step 1 of the operator checklist for exactly that reason.
 */
const nextConfig: NextConfig = {
  /* One header fewer on every response, and one fewer thing telling a scanner what to try. */
  poweredByHeader: false,

  /* `/favicon.ico` is a convention older than the `<link rel="icon">` tag and plenty of crawlers,
   * link-preview bots and feed readers still request it blindly at the site root.
   *
   * `src/app/favicon.ico` was DELETED on 2026-09-04: it was the create-next-app triangle from
   * before the redesign, so the browser tab of a personal site showed a framework's logo. The mark
   * that replaced it is generated from the palette at build time by `src/app/icon.tsx`, which is
   * what stops it going stale the way the share card's four hex literals did.
   *
   * That deletion left the bare path 404ing, and a Next 404 is an 11.5 KB HTML page. Every blind
   * bot request would have cost that. A rewrite rather than a redirect so the bytes arrive on the
   * first request instead of after a round trip, and rather than a committed .ico so there is still
   * exactly one drawing on this site and no binary to regenerate by hand. Browsers sniff favicon
   * bytes and do not care that a .ico URL returns image/png. */
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/icon/32' }];
  },

  /* SECURITY HEADERS. D1 of the 2026-09-04 audit: `curl -I https://hoodii.studio` returned
   * `Strict-Transport-Security` and nothing else. Verified again on 2026-09-04 before writing this:
   * one header. HSTS itself comes from Vercel, not from this file.
   *
   * These four are the cheap, no-behaviour-change ones. They are here rather than in `vercel.json`
   * so they are reviewable in the repo alongside the routes they protect, and so a preview
   * deployment gets them too.
   *
   * NO CONTENT-SECURITY-POLICY YET, DELIBERATELY, and this is also the answer to A9. A comment in
   * `src/lib/kitchen/timers.ts` asserted that "the strict CSP on this site blocks anything off-host
   * anyway", and there was no CSP: not here, not in vercel.json, not in src/proxy.ts. A comment
   * that claims a security control which does not exist is worse than no comment, because the next
   * person to add an off-host script reads it and believes they are covered. That comment now says
   * what is actually true; see it for the current statement.
   *
   * A real CSP here is not a one-liner, which is why it is not in this commit rather than being
   * half-done: the hub inlines a `ld+json` script, recipe photos come from TheMealDB, cover images
   * from Open Library, and the fonts are self-hosted by next/font but the ImageResponse routes are
   * not in the document at all. Getting it wrong silently breaks images on the surface he cooks
   * from. The path is `Content-Security-Policy-Report-Only` first, read the reports, then enforce.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          /* Stops a browser second-guessing a declared Content-Type. The concrete risk on this site
             is the JSON API routes and the generated PNGs: a sniffed type is how a response meant
             as data gets treated as script. */
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          /* Send the full URL within this origin, and only the origin to anyone else. The reason it
             matters here rather than generically: this site's filter pages carry state in the query
             string, and /reading/shelf and /kitchen/find hotlink out to external sources. Without
             this, following one of those links hands the third party the full filtered URL. */
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          /* Nothing on this site uses a camera, a microphone or geolocation. Saying so means a
             future dependency cannot quietly ask for one. */
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          /* No page here is meant to be framed, and the login form is the reason to care: framing
             it is the setup for a clickjacked password field. `frame-ancestors` in a CSP is the
             modern spelling and supersedes this, so when the CSP above lands, this becomes
             redundant rather than wrong. */
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/en', destination: '/', permanent: true },
      { source: '/en/:path*', destination: '/', permanent: true },
      { source: '/es', destination: '/', permanent: true },
      { source: '/es/:path*', destination: '/', permanent: true },
      { source: '/studio', destination: '/', permanent: true },

      /* The inline unlock moved from /kitchen/api/unlock to /api/unlock on 2026-11-02 because /gym
       * still needs it. A phone holding an old gym bundle still posts to the old path, and a 307
       * keeps the method and the body. */
      { source: '/kitchen/api/unlock', destination: '/api/unlock', permanent: false },

      /* The old per-app login pages are one route, /login (2026-09-04). Before the prefix rule
       * below, or /kitchen/login and /health/login would land on the front page instead. `:path*`
       * is not used: these were leaf pages. The `to` query survives on its own. */
      ...['kitchen', 'gym', 'health', 'french'].map((app) => ({
        source: `/${app}/login`,
        destination: '/login',
        permanent: false,
      })),

      /* EVERY ROUTE THAT LEFT THE SITE lands on the front door instead of a 404. The strip of
       * 2026-11-02 (his ruling: "hoodii studio as a whole has not been used") removed kitchen,
       * reading, curio, music, health, swim, bike and me; /work, /french and /run went earlier
       * (docs/agents/retired-routes.md has each date and reason). 307, not 308: a permanent
       * redirect is cached by the browser forever, and these are decisions that could be reversed.
       * `/gym/conditioning` is the page that became those routes on 2026-08-27. */
      ...['work', 'french', 'run', 'reading', 'kitchen', 'curio', 'music', 'health', 'swim', 'bike', 'me'].flatMap((app) => [
        { source: `/${app}`, destination: '/', permanent: false },
        { source: `/${app}/:path*`, destination: '/', permanent: false },
      ]),
      { source: '/gym/conditioning', destination: '/gym', permanent: false },
      /* The vercel.app copy of the whole site, sent home.
       *
       * Silvio, 2026-08-14: "why do we need the Hoodii Studio site, Vercel app? We can erase that."
       * You cannot. Every Vercel project gets that hostname automatically and there is no way to
       * remove it, which is why the audit's remedy was a dashboard redirect somebody had to
       * remember to set.
       *
       * A host-matched redirect does the same job from inside the repo, where it is reviewable and
       * cannot be silently undone in a web UI. Anyone landing on the vercel.app address, including
       * a crawler that indexed it as a duplicate, gets a 308 to the same path on the real domain.
       *
       * Only the PRODUCTION alias is matched, deliberately. Preview deployments get their own
       * hostnames under vercel.app too, and a wildcard here would redirect every preview to
       * production and make previews useless. */
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'hoodii-studio-site.vercel.app' }],
        destination: 'https://hoodii.studio/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
