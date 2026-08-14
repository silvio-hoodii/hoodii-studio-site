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
    ];
  },
};

export default nextConfig;
