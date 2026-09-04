/* THE THREE PATHS BEHIND THE VERCEL FIREWALL CHALLENGE, and why a list of them lives in the repo.
 *
 * A7 of the 2026-09-04 audit. Lighthouse on live /kitchen logs FOUR console errors on every load,
 * each a 429. Firewall rule 3 puts an edge challenge on `/reading/shelf`, `/reading/want` and
 * `/kitchen/find` for any request without the `kos` cookie, and eighteen `<Link>` elements across
 * the site point at those three paths with no `prefetch={false}` on any of them. Next prefetches a
 * Link when it enters the viewport, so every visit fires prefetches the edge is configured to
 * refuse.
 *
 * IT COSTS MORE THAN A NOISY CONSOLE. Each prefetch is a counted non-`/_next/` request against the
 * same 150-per-minute per-IP rule (rule 4) that protects the whole site, spent on a request that
 * can never succeed. /kitchen is 11 screens tall with rescue rows linking to the finder, so one
 * visit can burn a dozen of an allowance that exists to stop a scraper costing real money. Rule 3
 * was added on 2026-08-24 after /reading/shelf took 178,000 invocations in twelve hours.
 *
 * THIS LIST IS A COPY OF OFF-REPO STATE, WHICH IS THE UNCOMFORTABLE PART. AGENTS.md is explicit
 * that "four Vercel firewall rules protect this site and none of them are visible in these files",
 * and every copy of a fact in this workspace is a fact that goes stale silently: the body metrics,
 * the immigration dates, `inProgramme`, the share card's four hex literals.
 *
 * It is a copy anyway, for a reason worth stating rather than hiding: the alternative is no
 * mechanism at all. A page cannot query the firewall at build time, so either the repo knows which
 * paths are challenged or nobody does, and "nobody does" is the state that produced eighteen
 * forgotten links. What makes it tolerable is that it is ONE list, gated by
 * `scripts/lint-probe-routes.mjs`, rather than a decision re-made at eighteen call sites.
 *
 * SO: BEFORE ADDING OR REMOVING A CHALLENGE, read the real thing and update this together with it.
 *
 *     vercel firewall rules list
 *
 * And note the shape rule 3 exists for, from AGENTS.md, because it is what predicts the NEXT entry
 * here: any page that renders on every request, exposes its filter state as crawlable `<Link>`
 * hrefs, and needs no cookie is a combinatorial URL space someone will walk. /kitchen/find was
 * caught with that shape on 2026-08-20 and /reading/shelf shipped the same shape the next day.
 */

/** Paths given an edge challenge by firewall rule 3, as prefixes. */
export const WALLED_PATHS = ['/kitchen/find', '/reading/shelf', '/reading/want'] as const;

/**
 * Whether a link target sits behind the challenge, and so must not be prefetched.
 *
 * Prefix matching, because the query string is where these pages carry their filter state:
 * `/kitchen/find?uses=chicken&max=1` is the same walled page as `/kitchen/find`, and the
 * combinatorial URL space of those query strings is the entire reason rule 3 exists.
 *
 * Only same-origin absolute paths are considered. A full URL to another host is not this site's
 * problem, and a relative href is not something this codebase writes.
 */
export function isWalled(href: string): boolean {
  if (!href.startsWith('/')) return false;
  const path = href.split('?')[0]?.split('#')[0] ?? '';
  return WALLED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}
