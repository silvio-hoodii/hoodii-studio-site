import type { MetadataRoute } from 'next';

/* There was no robots.txt and no sitemap: both 404d on the live domain, and nothing on the site
 * declared a canonical origin. Meanwhile hoodii-studio-site.vercel.app serves an identical copy at
 * HTTP 200, which is a duplicate of the whole site with no signal saying which one is real.
 *
 * The four login pages are excluded because they are password boxes with nothing to read, and
 * /callback because it is an OAuth landing that only means anything for about ten minutes. The four
 * app routes are NOT excluded here: their own layouts already carry a noindex robots meta, which is
 * the stronger and more local statement. A disallow in this file would only stop the crawl, which
 * can leave a URL indexed with no description at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/kitchen/login', '/gym/login', '/health/login', '/french/login', '/callback'],
    },
    sitemap: 'https://hoodii.studio/sitemap.xml',
    host: 'https://hoodii.studio',
  };
}
