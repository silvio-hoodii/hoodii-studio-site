import type { MetadataRoute } from 'next';

/* Only what is meant to be found. Kitchen, gym, health and french are deliberately noindex, so
 * listing them here would be asking for exactly what their own metadata refuses.
 *
 * No lastModified. It would be stamped at build time, which says "changed whenever I last deployed"
 * rather than "changed when the content changed", and a date that is confidently wrong is worse
 * than no date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    /* No trailing slash: the canonical this site emits for the front page is
     * `https://hoodii.studio`, and a sitemap that names a different string for the same page is
     * two answers to one question. */
    { url: 'https://hoodii.studio', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://hoodii.studio/curio', changeFrequency: 'daily', priority: 0.7 },
    { url: 'https://hoodii.studio/music', changeFrequency: 'daily', priority: 0.5 },

    /* Two apps that used to be someone else's subdomain, moved here 2026-08-16. The individual
     * /reading/[slug] pages are deliberately NOT listed: they are linked from /reading, which is
     * enough for a crawler, and a sitemap that has to be hand-extended every time a book is added
     * is the same hand-maintained list this whole migration exists to get rid of.
     *
     * /swim was `daily` until 2026-08-26, which was true of a timetable scraped every morning and
     * is not true of a training log. The schedule was deleted that day and the page became his own
     * swimming: a tier ladder, a ten-week plan and two coaching handbooks, all of which change when
     * he changes them. `weekly` is the honest answer now. */
    { url: 'https://hoodii.studio/swim', changeFrequency: 'weekly', priority: 0.6 },
    { url: 'https://hoodii.studio/reading', changeFrequency: 'monthly', priority: 0.6 },

    /* The four project pages, published 2026-08-16. `monthly` rather than `weekly`: they describe
     * work that is finished, so the honest answer is that they change rarely. Each one declares its
     * own canonical, which is the rule this site follows for every indexed route. */
    { url: 'https://hoodii.studio/work/themoment', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://hoodii.studio/work/versatile', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://hoodii.studio/work/brixel', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://hoodii.studio/work/kitchen', changeFrequency: 'monthly', priority: 0.8 },
    /* Added 2026-09-04 with the page. It is the one /work page whose figures move, because they
       are counted out of the repo on every build rather than written once, so it changes as
       often as the site does. */
    { url: 'https://hoodii.studio/work/site', changeFrequency: 'weekly', priority: 0.8 },
  ];
}
