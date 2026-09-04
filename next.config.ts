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
  async redirects() {
    return [
      { source: '/en', destination: '/', permanent: true },
      { source: '/en/:path*', destination: '/', permanent: true },
      { source: '/es', destination: '/', permanent: true },
      { source: '/es/:path*', destination: '/', permanent: true },
      { source: '/studio', destination: '/', permanent: true },

      /* /reading/all is retired into /reading/shelf, 2026-08-21. Both browsed the same pool and
       * the shelf page now does everything /reading/all did (search, filters, the full catalogue)
       * plus covers, descriptions, six sorts, tiers, a want list and pagination. The last two
       * things only /reading/all had, Spanish books and paging, moved across first.
       *
       * Two surfaces answering the same question is one of them going stale, which is a rule this
       * project wrote down after finding a standalone spine-check page duplicating this one. A
       * 307 rather than a 308: this is a product decision that could be reversed, not a permanent
       * URL move, and a permanent redirect is cached by browsers forever. */
      { source: '/reading/all', destination: '/reading/shelf', permanent: false },

      /* /gym/conditioning IS DELETED, 2026-08-27, and every URL it ever had lands somewhere real.
       *
       * It held the whole week behind two levels of query parameters: ?p=run, ?p=bike, ?p=swim and
       * ?p=week, each with a ?s=now|plan|how under it. Swim escaped on 2026-08-26 and its redirect
       * was written inside the page component, because the page still existed. It does not now, so
       * all four live here where a deleted route can still answer for itself.
       *
       * ORDER MATTERS: first match wins, so the three discipline rules come before the bare one.
       * THE PAIRED RULES ARE NOT REDUNDANT. `has` only matches when the key is PRESENT, so the
       * s-carrying rule cannot serve a bare ?p=run, and a single rule with `s` optional does not
       * exist. He was told to bookmark these at the poolside and at the treadmill; a sub-tab
       * dropped in the move is a bookmark that lands on the wrong half of a page.
       *
       * 307, not 308, matching /reading/all above and for the same reason: a permanent redirect is
       * cached by browsers forever, and this is an architecture decision rather than a law. */
      ...(['run', 'bike', 'swim'].flatMap((d) => [
        {
          source: '/gym/conditioning',
          has: [
            { type: 'query' as const, key: 'p', value: d },
            { type: 'query' as const, key: 's', value: '(?<s>.*)' },
          ],
          destination: `/${d}?s=:s`,
          permanent: false,
        },
        {
          source: '/gym/conditioning',
          has: [{ type: 'query' as const, key: 'p', value: d }],
          destination: `/${d}`,
          permanent: false,
        },
      ])),
      /* Everything else that page was: the Overview tab, and a bare /gym/conditioning. Overview
       * became /health, which is the index now. */
      { source: '/gym/conditioning', destination: '/health', permanent: false },

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
