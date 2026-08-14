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
  ];
}
