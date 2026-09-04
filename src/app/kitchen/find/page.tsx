import KitchenNav from '../KitchenNav';
import { findCandidates, type Candidate } from '@/lib/kitchen/corpus';
// Shared with the home page. Two surfaces describing a dish from their own copy of this markup is
// the exact shape of the bug this whole change fixes. See MealRow.tsx.
import { MealRow } from '../MealRow';
import { FilterBar } from './FilterBar';

export const dynamic = 'force-dynamic';

/* What this page is for, and what it deliberately is NOT.
 *
 * Silvio, 2026-08-12, describing what he actually wanted after five cooks went sideways: "let's say
 * these are the five options so I look at them, maybe from the picture and the name. Maybe they're
 * categorizing it as ready to make or needs some stuff... Then I will look into it." And the reason
 * it matters: "I have all these ingredients, which I have no idea what to do with all of them. Some
 * of them have already been in the fridge for quite a while and I'm worried they will go to waste."
 *
 * So this is a MENU, not a recipe. Nothing here is a cook card and nothing here has been read. Every
 * row links out to the original published recipe, because that is where instructions come from, per
 * content/kitchen/schema/SOURCING.md. An agent turns one of these into a card only after he picks it.
 *
 * The counts are honest rather than flattering. An ingredient the alias table does not recognise is
 * never counted as missing (we do not know he lacks it) but it does downgrade a dish out of `ready`,
 * because on 2026-08-12 treating unknowns as nothing produced "285 dishes ready" including Singapore
 * Noodles with Shrimp in a kitchen with no shrimp.
 */

function Group({
  title, note, list, limit = 24, label,
}: { title: string; note?: string; list: Candidate[]; limit?: number; label: (id: string) => string }) {
  if (!list.length) return null;
  return (
    <>
      <h2 className="sec">{title} <span className="quiet">{list.length}</span></h2>
      {/* The note under a group heading is a whole sentence explaining what the group means, so it
          is sans. The count beside the heading stays mono: the split this site declares is that mono
          carries labels, state and numbers and sans carries prose, and a paragraph of monospace on
          the surface a beginner reads with wet hands was the wrong half of it. */}
      {note && <p className="lede" style={{ marginTop: 4, marginBottom: 10 }}>{note}</p>}
      <ul className="meallist">
        {list.slice(0, limit).map((c) => <MealRow key={c.meal.id} c={c} label={label} />)}
      </ul>
      {list.length > limit && (
        <p className="lede" style={{ marginTop: 8 }}>
          and {list.length - limit} more. Narrow it with the search box or a chip above rather than
          scrolling.
        </p>
      )}
    </>
  );
}

export default async function Find({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; uses?: string; cuisine?: string; course?: string; max?: string }>;
}) {
  const sp = await searchParams;
  const maxRaw = sp.max === undefined ? undefined : Number(sp.max);
  const d = await findCandidates({
    q: sp.q,
    uses: sp.uses,
    cuisine: sp.cuisine,
    course: sp.course,
    max: Number.isFinite(maxRaw) ? maxRaw : undefined,
  });

  return (
    /* `wide` is the only kitchen route that asks for it. The kitchen layout is shared with the cook
       screen, where one step filling the phone is the whole design, so the opt-in has to be per
       page rather than on the layout. See the `:has` rule in kitchen.css for how the header above
       this element follows it. */
    <div className="wrap wide">
      <KitchenNav here="find" />
      <h1>Dishes</h1>

      {/* CUT TO ONE LINE, 2026-08-22. This was four paragraphs before the first dish: an explanation
          of what a menu is, the provider breakdown with four counts, and 90 words on how many links
          were dead, deduped or unchecked and why "checked" has to mean checked. All of it true, none
          of it what he came for. His words, pasting the page back: "There's so much text here. It
          doesn't make sense... so much fluff that doesn't add value. Just go straight to the point."

          The honesty it was carrying does not disappear, it moves into the fold at the bottom next to
          the attribution, which is where a reader goes when they want to know where this came from. */}
      <p className="lede" style={{ marginTop: 14 }}>
        {d.total} dishes, scored against the kitchen. Every name links to the original recipe.
      </p>

      {/* Says out loud when food in the kitchen is invisible to the matcher, because on 2026-08-16 it
          was: the 08-14 receipt created thirteen stock ids with no alias row, four of which were also
          still listed as things he does not own, so this page insisted he had no potatoes with nine in
          the pantry. Zero is the normal state and this renders nothing. See `unreachableStock`. */}
      {d.invisible.length > 0 && (
        <p className="lede" style={{ marginTop: 6 }}>
          {d.invisible.length} thing{d.invisible.length === 1 ? '' : 's'} in the kitchen{' '}
          {d.invisible.length === 1 ? 'is' : 'are'} invisible to this page and cannot be credited to any
          dish: {d.invisible.map((i) => i.n).join(', ')}. That is a gap in{' '}
          <code>stock/aliases.json</code>, not in the kitchen.
        </p>
      )}

      <FilterBar
        filters={d.filters}
        usesFacets={d.usesFacets}
        courseFacets={d.courseFacets}
        cuisineFacets={d.cuisineFacets}
        matched={d.matched}
        total={d.total}
      />


      {/* FILTERED: one ranked list. The point of filtering is that the answer is now short enough to
          read straight through, so five sections would just put scrolling back. */}
      {d.isFiltered ? (
        d.results.length === 0 ? (
          <h2 className="sec">nothing matches those filters</h2>
        ) : (
          <Group
            title="Matches"
            list={d.results}
            limit={60}
            label={d.nameOf}
          />
        )
      ) : (
        <>
          <Group
            title="Cook one of these and nothing goes to waste"
            note="Each uses something about to go off."
            list={d.rescue}
            limit={12}
            label={d.nameOf}
          />

          <Group
            title="Ready"
            list={d.ready}
            limit={12}
            label={d.nameOf}
          />

          {/* THAWING IS ITS OWN ANSWER. These 41 dishes used to sit inside "Ready" wearing the same
              green badge, which is a promise the kitchen cannot keep until the afternoon. */}
          <Group
            title="Ready, once something thaws"
            note="Nothing to buy. Something needs thawing first."
            list={d.thaw}
            limit={12}
            label={d.nameOf}
          />

          <Group
            title="Probably ready"
            note="One or two ingredients the app does not recognise, so this is a maybe."
            list={d.probably}
            limit={8}
            label={d.nameOf}
          />

          {/* Was computed and dropped, which is why the "nothing missing" chip said 139 while the
              sections added to 135. A dish in no group is unreachable without guessing a filter. */}
          <Group
            title="Nothing missing, but too much unrecognised to promise"
            note="Several ingredients the app does not recognise. Read the list first."
            list={d.unclear}
            limit={8}
            label={d.nameOf}
          />

          <Group
            title="One thing short"
            note="What is missing is named."
            list={d.missingOne}
            limit={12}
            label={d.nameOf}
          />
        </>
      )}

      {d.unlocks.length > 0 && (
        <>
          <h2 className="sec">One thing to buy, most dishes</h2>
          <ul className="plainlist stack">
            {d.unlocks.map((u) => (
              <li key={u.item}>
                {/* The words the recipes use, same as the home page. `nameOf` returns the matcher's
                    bucket name and nothing in a shop is called "green vegetables". */}
                <b>{u.count}</b> dishes need only{' '}
                {u.examples.length > 0 ? u.examples.join(', ') : d.nameOf(u.item)}
                {u.note && <span className="quiet"> · {u.note}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* MOVED BELOW THE RESULTS, 2026-08-22. These two boxes ask a DIFFERENT question from the page:
          "I want a dish, what would it need", where this page answers "what can I make". Both are
          useful and only one of them is why he opened this tab, and sitting at the top they pushed the
          dishes off a 390px screen, alongside the page's own search box, which made three text inputs
          above the first result. His words: "There's so much text here. It doesn't make sense."

          Folded rather than removed. It is the only route to a site this app will not crawl, so it has
          to stay reachable, and "Not here?" is where you look when the list did not have it. */}
      <hr className="divider" style={{ marginTop: 30 }} />
      <details className="fold">
        <summary>Not here? Name it, or paste a link</summary>
        <form action="/kitchen/want" method="get" className="searchrow" style={{ marginTop: 10 }}>
          <input
            type="search"
            name="q"
            placeholder="name a dish: beef stroganoff"
            aria-label="Name a dish you want to make"
            enterKeyHint="search"
          />
          <button type="submit" className="primary">Check</button>
        </form>
        <form action="/kitchen/want" method="get" className="searchrow" style={{ marginTop: 8 }}>
          <input
            type="url"
            name="url"
            placeholder="or paste a recipe link"
            aria-label="Paste a recipe web address"
            enterKeyHint="go"
          />
          <button type="submit" className="primary">Read it</button>
        </form>
      </details>

      {/* FOLDED, 2026-08-22. The attribution is owed to the publishers and the crawling position is
          worth stating, and neither is worth 120 words of standing text under a list of dinners. Both
          are one tap away and unchanged. The counts of dead links, duplicates and unchecked rows moved
          in here too, from four paragraphs above the first dish. */}
      <hr className="divider" style={{ marginTop: 34 }} />
      <details className="fold">
        <summary>Where these came from</summary>
        <p className="lede" style={{ marginTop: 8 }}>
          {d.providers.map((p) => `${p.provider} (${p.count})`).join(', ')}, from each site&apos;s own
          sitemap, and only from sites whose robots.txt permits it. Ingredient lists and photos only:
          instructions stay at the original recipe. That is why there is no NYT Cooking, Serious Eats,
          Maangchi or Woks of Life here.
        </p>
        <p className="lede" style={{ marginTop: 6 }}>
          {d.hiddenNoSource} of {d.totalKnown} are held back because their link does not lead to a real
          recipe, checked on {d.sourceCheckedAt}, and {d.dupesDropped} were exact duplicates.
          {d.uncheckedCount > 0 && <> {d.uncheckedCount} have not been checked either way.</>}
        </p>
        <p className="quiet" style={{ marginTop: 6 }}>
          {d.providers.map((p) => p.attribution).join(' · ')}
        </p>
      </details>
    </div>
  );
}
