import Link from 'next/link';
import type { Filters } from '@/lib/kitchen/corpus';

/* Filtering, as plain links and one GET form.
 *
 * No client JavaScript on purpose. Every filter is a URL, which means it works before hydration, it
 * survives a reload mid-cook, it can be bookmarked ("dishes using the chicken thighs"), and it costs
 * nothing on a phone. The whole page is already server-rendered per request against live stock.
 *
 * He asked for this directly: "some of these dishes seem to be extremely niche or really random
 * country cuisine. I wouldn't know how to filter those out." 2,586 rows with no filter is not a menu,
 * it is a haystack.
 *
 * `uses` is deliberately the FIRST filter offered, ahead of cuisine, because the question he actually
 * asks is "what can I make with the chicken thighs", not "show me Italian". It is also built from what
 * he genuinely has, so no chip ever leads to an empty room.
 */

function href(f: Filters, patch: Partial<Filters>) {
  const next = { ...f, ...patch };
  const p = new URLSearchParams();
  if (next.q) p.set('q', next.q);
  if (next.uses) p.set('uses', next.uses);
  if (next.cuisine) p.set('cuisine', next.cuisine);
  if (next.max !== undefined) p.set('max', String(next.max));
  const s = p.toString();
  return s ? `/kitchen/find?${s}` : '/kitchen/find';
}

export function FilterBar({
  filters, usesFacets, cuisineFacets, matched, total,
}: {
  filters: Filters;
  usesFacets: { id: string; name: string; count: number }[];
  cuisineFacets: { name: string; count: number }[];
  matched: number;
  total: number;
}) {
  const active = Boolean(filters.q || filters.uses || filters.cuisine || filters.max !== undefined);

  return (
    <div className="filters">
      <form action="/kitchen/find" method="get" className="searchrow">
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder={`Search ${total.toLocaleString()} dishes by name or ingredient`}
          aria-label="Search dishes by name or ingredient"
          enterKeyHint="search"
        />
        {/* Carried through so searching does not silently discard the other filters. */}
        {filters.uses && <input type="hidden" name="uses" value={filters.uses} />}
        {filters.cuisine && <input type="hidden" name="cuisine" value={filters.cuisine} />}
        {filters.max !== undefined && <input type="hidden" name="max" value={String(filters.max)} />}
        <button type="submit" className="primary">Search</button>
      </form>

      <div className="chiprow" role="group" aria-label="How much is missing">
        <span className="chiplabel">Show</span>
        <Link className={`chip ${filters.max === 0 ? 'on' : ''}`} href={href(filters, { max: filters.max === 0 ? undefined : 0 })}>
          nothing missing
        </Link>
        <Link className={`chip ${filters.max === 1 ? 'on' : ''}`} href={href(filters, { max: filters.max === 1 ? undefined : 1 })}>
          up to 1 missing
        </Link>
        <Link className={`chip ${filters.max === 2 ? 'on' : ''}`} href={href(filters, { max: filters.max === 2 ? undefined : 2 })}>
          up to 2 missing
        </Link>
      </div>

      {usesFacets.length > 0 && (
        <div className="chiprow" role="group" aria-label="Show dishes you can cook with one thing you have">
          {/* "Ready with", not "Uses", and the chip pins `max` to 0 when nothing is chosen yet.
              The count on the chip is dishes he can cook RIGHT NOW with that ingredient, so the
              filter has to return that same set or the chip is lying: tapping "chicken breast 19"
              and landing on 400 rows, most of them missing something, is the contradiction this
              file's header already warns about. An explicit "up to 1 missing" is carried through
              untouched, because that is him asking a different question on purpose. */}
          <span className="chiplabel">Ready with</span>
          {usesFacets.map((u) => (
            <Link
              key={u.id}
              className={`chip ${filters.uses === u.id ? 'on' : ''}`}
              href={href(filters, {
                uses: filters.uses === u.id ? undefined : u.id,
                max: filters.max ?? 0,
              })}
            >
              {u.name} <i>{u.count}</i>
            </Link>
          ))}
        </div>
      )}

      {cuisineFacets.length > 0 && (
        <div className="chiprow" role="group" aria-label="Filter by cuisine">
          <span className="chiplabel">Cuisine</span>
          {cuisineFacets.map((c) => (
            <Link
              key={c.name}
              className={`chip ${filters.cuisine === c.name ? 'on' : ''}`}
              href={href(filters, { cuisine: filters.cuisine === c.name ? undefined : c.name })}
            >
              {c.name} <i>{c.count}</i>
            </Link>
          ))}
        </div>
      )}

      {active && (
        <p className="quiet" style={{ marginTop: 10 }}>
          <b>{matched}</b> of {total} match. <Link href="/kitchen/find">Clear all filters</Link>
        </p>
      )}
    </div>
  );
}
