import type { MetadataRoute } from 'next';

/* The front page and nothing else. Every other route is noindex, a write API, or gone (see
 * docs/agents/retired-routes.md). No lastModified: it would be stamped at build time, which says
 * "changed whenever I last deployed", and a date that is confidently wrong is worse than none. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    /* No trailing slash: the canonical this site emits for the front page is
     * `https://hoodii.studio`, and a sitemap that names a different string for the same page is
     * two answers to one question. */
    { url: 'https://hoodii.studio', changeFrequency: 'monthly', priority: 1 },
  ];
}