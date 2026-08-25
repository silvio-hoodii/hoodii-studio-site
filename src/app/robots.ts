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
 * meta tags before deciding to fetch it. `robots.txt Disallow` is the signal a well-behaved bot of
 * either kind checks before requesting a URL.
 *
 * CORRECTED 2026-08-24. That last sentence used to read "the one signal both kinds of bot actually
 * check", and it is wrong. A scraper with no reason to read a meta tag has no reason to read this
 * file either, and on 2026-08-24 the two most-requested routes on the whole site were
 * /reading/shelf and /reading/want, both listed below, at a sustained 3.55 req/s: 178,000
 * invocations and 40 minutes of Active CPU in twelve hours, ten times the entire Hobby monthly
 * allowance. Every line above was reasoning about what a bot would honour, and none of it executed.
 *
 * THE ENFORCEMENT IS NOT IN THIS FILE and cannot be, because this file is a request. It is three
 * Vercel firewall rules (`vercel firewall rules list`): the `kos` cookie bypasses, those paths
 * otherwise get an edge challenge, and a per-IP burst limit catches the next such page before
 * anyone names it. See AGENTS.md, "What costs money, and the gate that is NOT in this repo".
 *
 * These Disallow lines stay anyway. They cost nothing and they still work on the bots that read
 * them. They are just not the reason those paths are safe.
 *
 * Found 2026-08-20 via `vercel logs`: in one ~28-minute window, 136 of 200 sampled requests to
 * hoodii.studio were GET /kitchen/find, arriving every 150-300ms, which is not a person clicking.
 * Every filter chip on that page is a real crawlable <Link>, and the page recomputes candidate
 * scoring over the ~2,600-dish corpus on every hit with no cache -- exactly the shape a bot walking
 * the combinatorial filter-URL space would turn into real, billed CPU time on Vercel's Fluid
 * compute model, which is what actually drove that day's usage spike.
 *
 * /reading/shelf gets the same Disallow (it inherited /reading/all's, which was added the same
 * day that page shipped and moved across when it was retired into the shelf on 2026-08-21): same shape
 * (search + filter chips over thousands of rows, freshly queried every hit, no cache), so it gets
 * the fix at the same time it's built rather than after a bot finds it first.
 */
/* The named AI-training crawlers, 2026-08-25. `meta-externalagent` is here because it was measured
 * doing 208,938 of 215,673 edge requests in thirty hours; the rest are its peers, listed before
 * they show up rather than after.
 *
 * This block is NOT what stops them, and adding it changes nothing on its own: the `*` rules above
 * already disallowed two of the paths Meta was hammering, and it hammered them anyway. The
 * firewall's deny rule is the mechanism. This is here because a per-agent block is the one form of
 * the request some crawlers honour when they ignore the wildcard, it costs nothing to state, and a
 * bot that stops on its own never reaches the edge at all.
 *
 * Search and link-preview bots are deliberately absent: googlebot, bingbot and facebookexternalhit
 * are wanted, and facebookexternalhit is a different agent from meta-externalagent despite both
 * being Meta. */
const AI_TRAINING_CRAWLERS = [
  'meta-externalagent', 'GPTBot', 'ClaudeBot', 'Bytespider', 'CCBot', 'PerplexityBot',
  'Amazonbot', 'Applebot-Extended', 'Google-Extended', 'Diffbot', 'Omgilibot',
  'ImagesiftBot', 'Timpibot', 'Webzio-Extended', 'anthropic-ai', 'cohere-ai',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/kitchen/find', '/reading/shelf', '/reading/want'],
      },
      { userAgent: AI_TRAINING_CRAWLERS, disallow: '/' },
    ],
    sitemap: 'https://hoodii.studio/sitemap.xml',
    host: 'https://hoodii.studio',
  };
}
