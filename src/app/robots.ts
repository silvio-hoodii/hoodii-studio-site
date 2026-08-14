import type { MetadataRoute } from 'next';

/* There was no robots.txt and no sitemap: both 404d on the live domain, and nothing on the site
 * declared a canonical origin. Meanwhile hoodii-studio-site.vercel.app serves an identical copy at
 * HTTP 200, which is a duplicate of the whole site with no signal saying which one is real.
 *
 * NOTHING is disallowed, and that is the point. Every page that should stay out of the index says
 * so in its own head: the four app layouts, the four login pages and /callback all serve
 * `noindex, nofollow`. A Disallow would stop the crawler READING those pages, which means it never
 * sees the noindex, which is how a URL ends up listed with no title and no description and no way
 * to get rid of it.
 *
 * The first version of this file disallowed the five login-ish paths while its own comment argued
 * against doing exactly that for the app routes. An adversarial pass caught the contradiction on
 * 2026-08-14. One rule: if a page should not be indexed, it says so itself, and the crawler is let
 * in to read it saying so.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://hoodii.studio/sitemap.xml',
    host: 'https://hoodii.studio',
  };
}
