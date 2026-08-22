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
