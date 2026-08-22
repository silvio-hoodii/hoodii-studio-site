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
  if (next.course) p.set('course', next.course);
  if (next.max !== undefined) p.set('max', String(next.max));
  const s = p.toString();
  return s ? `/kitchen/find?${s}` : '/kitchen/find';
}

export function FilterBar({
  filters, usesFacets, courseFacets, cuisineFacets, matched, total,
}: {
  filters: Filters;
  usesFacets: { id: string; name: string; count: number }[];
  courseFacets: { id: string; label: string; count: number }[];
  cuisineFacets: { name: string; count: number }[];
  matched: number;
  total: number;
}) {
  const active = Boolean(filters.q || filters.uses || filters.cuisine || filters.course || filters.max !== undefined);

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
        {filters.course && <input type="hidden" name="course" value={filters.course} />}
        {filters.max !== undefined && <input type="hidden" name="max" value={String(filters.max)} />}
        <button type="submit" className="primary">Search</button>
      </form>

      {/* THE CHIPS FOLD ONCE HE IS SEARCHING, and open when he is not. Changed 2026-08-22.
          Eighteen chips across four labelled rows is a good browse control and it is 700px of
          furniture between a search box and its results. He typed "banana" and the first dish was
          off the bottom of the phone, under two other search boxes and every chip on the page.

          `open={!active}` is the whole rule: browsing, they are the point; filtering, the answer is.
          They stay one tap away in both states, because hiding a control is a navigation bug. */}
      <details className="fold" open={!active}>
        <summary>{active ? 'Filters' : 'Narrow it down'}</summary>
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

      {/* WHAT KIND OF FOOD, first, because it is the question a person asks before any other.
          Added 2026-08-16: "where is all this i dont see it in the app". The oat and baking recipes
          were in the corpus, scored, and reachable only by guessing the word "oat" in a search box.
          Same rule as the ingredient chips below: counted over cookable dishes, and the chip pins
          max=0 so the number on it is the number of rows it produces. */}
      {courseFacets.length > 0 && (
        <div className="chiprow" role="group" aria-label="What kind of food">
          <span className="chiplabel">Kind</span>
          {courseFacets.map((c) => (
            <Link
              key={c.id}
              className={`chip ${filters.course === c.id ? 'on' : ''}`}
              href={href(filters, {
                course: filters.course === c.id ? undefined : c.id,
                max: filters.max ?? 0,
              })}
            >
              {c.label} <i>{c.count}</i>
            </Link>
          ))}
        </div>
      )}

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

      </details>

      {active && (
        <p className="quiet" style={{ marginTop: 10 }}>
          <b>{matched}</b> of {total} match. <Link href="/kitchen/find">Clear all filters</Link>
        </p>
      )}
    </div>
  );
}
