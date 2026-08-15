import Link from 'next/link';
import KitchenNav from '../KitchenNav';
import { findCandidates, thumb, type Candidate } from '@/lib/kitchen/corpus';
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

function Verdict({ c }: { c: Candidate }) {
  const n = c.score.missing.length;
  if (n === 0 && c.score.verdict === 'ready') return <span className="v ok">ready</span>;
  if (n === 0) return <span className="v">{c.score.unknown.length} unsure</span>;   // named below
  return <span className="v">need {n}</span>;
}

function Card({ c, label }: { c: Candidate; label: (id: string) => string }) {
  const t = thumb(c.meal.image);
  const missing = c.score.missing.map((m) => (m.item ? label(m.item) : m.shown));
  return (
    <li className="mealrow">
      {/* Plain img, not next/image, on purpose: 625 external photos through Vercel's optimiser would
          burn the Hobby transform allowance for a page nobody but him opens. TheMealDB's /preview
          derivative is already grid-sized. */}
      {/* The photo is part of the link, because tapping a picture and getting nothing is worse than
          having no picture. It is hidden from assistive tech because the dish NAME immediately after it
          is the same destination, and announcing both makes every row read twice.
          alt="" rather than the dish name: with aria-hidden on the wrapper the name was announced
          nowhere at all, so it was carrying a promise it could not keep. The visible fallback when an
          image 404s is the empty tile plus the name in the row, which is what he actually sees. */}
      <Link href={`/kitchen/want?url=${encodeURIComponent(c.meal.source!)}`} tabIndex={-1} aria-hidden="true">
        {t
          ? <img className="mealthumb" src={t} alt="" loading="lazy" width={56} height={56} />
          : <div className="mealthumb" />}
      </Link>
      <div className="mealbody">
        <div className="mealtop">
          {/* Leads INTO the app, not out of it. Until now the only interactive thing on a row was a
              link to the publisher, so "pick one and it gets turned into a card" had no gesture behind
              it anywhere on the page. The original recipe is still one tap further on. */}
          <Link href={`/kitchen/want?url=${encodeURIComponent(c.meal.source!)}`}><b>{c.meal.name}</b></Link>
          <Verdict c={c} />
        </div>
        <div className="mealmeta">{[c.meal.area, c.meal.category].filter(Boolean).join(' · ')}</div>
        {c.usesExpiring.length > 0 && (
          <div className="mealuses">
            uses {c.usesExpiring.map((u) => `${u.name} (${u.daysLeft <= 0 ? 'today' : `${u.daysLeft} d`})`).join(', ')}
          </div>
        )}
        {missing.length > 0 && <div className="mealmiss">no {missing.join(', ')}</div>}
        {/* Naming the unsure ingredients, not just counting them. He asked directly: "there's no way
            for me to know what it's missing when you say unsure". A bare count is the app knowing
            something and not saying it. */}
        {c.score.unknown.length > 0 && (
          <div className="mealmeta">
            not sure about {c.score.unknown.map((u) => u.shown || u.line.trim()).join(', ')}
          </div>
        )}
        {c.score.haveVia.length > 0 && (
          <div className="mealvia">
            {c.score.haveVia.map((v) => `${v.item} via your ${v.via}`).join(' · ')}
          </div>
        )}
      </div>
    </li>
  );
}

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
        {list.slice(0, limit).map((c) => <Card key={c.meal.id} c={c} label={label} />)}
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
  searchParams: Promise<{ q?: string; uses?: string; cuisine?: string; max?: string }>;
}) {
  const sp = await searchParams;
  const maxRaw = sp.max === undefined ? undefined : Number(sp.max);
  const d = await findCandidates({
    q: sp.q,
    uses: sp.uses,
    cuisine: sp.cuisine,
    max: Number.isFinite(maxRaw) ? maxRaw : undefined,
  });

  return (
    /* `wide` is the only kitchen route that asks for it. The kitchen layout is shared with the cook
       screen, where one step filling the phone is the whole design, so the opt-in has to be per
       page rather than on the layout. See the `:has` rule in kitchen.css for how the header above
       this element follows it. */
    <div className="wrap wide">
      <KitchenNav here="find" />
      <h1>What could I make</h1>
      <p className="lede">
        {d.total} dishes checked against what is actually in the kitchen. A menu to pick from, not a
        set of recipes: nothing here has been read or cooked, and every name links to the original
        published recipe. Pick one and it gets turned into a proper card first.
      </p>
      <p className="quiet" style={{ marginTop: 10 }}>
        From {d.providers.map((p) => `${p.provider} (${p.count})`).join(', ')}. Ingested straight from
        each site&apos;s own published sitemap, and only from sites whose robots.txt permits it.
      </p>
      <p className="lede" style={{ marginTop: 6 }}>
        {d.hiddenNoSource} of {d.totalKnown} are hidden because their link does not lead to a real
        recipe, each one fetched and checked on {d.sourceCheckedAt}, and {d.dupesDropped} more were
        exact duplicates. A link offered as a recipe has to be one.
        {/* Both spaces are explicit `{' '}` and not typed spaces. Written the obvious way, as
            `<> {n} have not been checked...`, this shipped "31have not been checked" to the live
            page: the compiler dropped the space between the expression and the word after it. The
            source looks correct, which is why it survived. Found by reading the rendered page. */}
        {d.uncheckedCount > 0 && (
          <>
            {' '}
            {d.uncheckedCount}
            {' '}have not been checked either way yet and are also held back, because
            &ldquo;checked&rdquo; has to mean checked.
          </>
        )}
      </p>

      <FilterBar
        filters={d.filters}
        usesFacets={d.usesFacets}
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
            note="Fewest things missing first, and anything that saves food about to go off is lifted."
            list={d.results}
            limit={60}
            label={d.nameOf}
          />
        )
      ) : (
        <>
          <Group
            title="Cook one of these and nothing goes to waste"
            note="Cookable now, and each one uses something already on a clock. Soonest first."
            list={d.rescue}
            limit={12}
            label={d.nameOf}
          />

          <Group
            title="Ready"
            note="Every ingredient recognised and in the kitchen."
            list={d.ready}
            limit={12}
            label={d.nameOf}
          />

          {/* THAWING IS ITS OWN ANSWER. These 41 dishes used to sit inside "Ready" wearing the same
              green badge, which is a promise the kitchen cannot keep until the afternoon. */}
          <Group
            title="Ready, once something thaws"
            note="Nothing to buy, but this needs something out of the freezer first. Decide these in the morning, not at six."
            list={d.thaw}
            limit={12}
            label={d.nameOf}
          />

          <Group
            title="Probably ready"
            note="Nothing known to be missing, but one or two ingredients are not in the kitchen's vocabulary yet, so this is a maybe rather than a yes."
            list={d.probably}
            limit={8}
            label={d.nameOf}
          />

          {/* Was computed and dropped, which is why the "nothing missing" chip said 139 while the
              sections added to 135. A dish in no group is unreachable without guessing a filter. */}
          <Group
            title="Nothing missing, but too much unrecognised to promise"
            note="No known gaps, yet several ingredients are not in the kitchen's vocabulary, so the app cannot honestly say yes. Read the list before you commit."
            list={d.unclear}
            limit={8}
            label={d.nameOf}
          />

          <Group
            title="One thing short"
            note="Everything else is here. What is missing is named, and some of it you may decide you can skip or swap."
            list={d.missingOne}
            limit={12}
            label={d.nameOf}
          />
        </>
      )}

      {d.unlocks.length > 0 && (
        <>
          <h2 className="sec">One purchase, most dishes</h2>
          <p className="lede" style={{ marginBottom: 8 }}>
            Counted only over dishes missing nothing but this, so the number means it.
          </p>
          <ul className="plainlist stack">
            {d.unlocks.map((u) => (
              <li key={u.item}>
                <b>{u.count}</b> dishes need only {d.nameOf(u.item)}
                {u.reason && <span className="quiet"> · {u.reason}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <hr className="divider" style={{ marginTop: 34 }} />
      <p className="quiet">
        {d.providers.map((p) => p.attribution).join(' · ')}
      </p>
      <p className="lede" style={{ marginTop: 6 }}>
        Ingredient lists and photos only: instructions are never copied here, they stay at the original
        recipe, which is also the one thing a cook card may be built from. Sites that ask AI agents not
        to crawl them are not crawled, which is why there is no NYT Cooking, Serious Eats, Maangchi or
        Woks of Life here.
      </p>
    </div>
  );
}
