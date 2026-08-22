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
/* ADDENDUM, 2026-08-20. One exception to "nothing is disallowed," and the reasoning above still
 * holds for why it is an exception rather than a reversal.
 *
 * /kitchen/find already declares `noindex, nofollow` at the layout level (src/app/kitchen/
 * layout.tsx) and always has, so it was never at risk of the 2026-08-14 problem: there is no
 * indexed URL under it that a Disallow could orphan, because there is nothing to orphan. noindex
 * only speaks to SEARCH crawlers deciding what to index. It says nothing to an AI-training
 * scraper, which isn't building a search index and has no reason to read or honour a page's own
 * meta tags before deciding to fetch it. `robots.txt Disallow` is the one signal both kinds of bot
 * actually check before requesting a URL.
 *
 * Found 2026-08-20 via `vercel logs`: in one ~28-minute window, 136 of 200 sampled requests to
 * hoodii.studio were GET /kitchen/find, arriving every 150-300ms, which is not a person clicking.
 * Every filter chip on that page is a real crawlable <Link>, and the page recomputes candidate
 * scoring over the ~2,600-dish corpus on every hit with no cache -- exactly the shape a bot walking
 * the combinatorial filter-URL space would turn into real, billed CPU time on Vercel's Fluid
 * compute model, which is what actually drove that day's usage spike.
 *
 * /reading/all gets the same Disallow, added the same day and BEFORE it ever shipped: same shape
 * (search + filter chips over thousands of rows, freshly queried every hit, no cache), so it gets
 * the fix at the same time it's built rather than after a bot finds it first.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/kitchen/find', '/reading/all', '/reading/shelf', '/reading/want'],
    },
    sitemap: 'https://hoodii.studio/sitemap.xml',
    host: 'https://hoodii.studio',
  };
}
