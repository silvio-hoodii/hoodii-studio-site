import Link from 'next/link';
import { findCandidates, thumb, type Candidate } from '@/lib/kitchen/corpus';

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
  if (n === 0) return <span className="v">{c.score.unknown.length} unsure</span>;
  return <span className="v">need {n}</span>;
}

function Card({ c, label }: { c: Candidate; label: (id: string) => string }) {
  const t = thumb(c.meal.image);
  const missing = c.score.missing.map((m) => (m.item ? label(m.item) : m.name));
  return (
    <li className="mealrow">
      {/* Plain img, not next/image, on purpose: 625 external photos through Vercel's optimiser would
          burn the Hobby transform allowance for a page nobody but him opens. TheMealDB's /preview
          derivative is already grid-sized. */}
      {t
        ? <img className="mealthumb" src={t} alt="" loading="lazy" width={80} height={80} />
        : <div className="mealthumb" aria-hidden="true" />}
      <div className="mealbody">
        <div className="mealtop">
          {c.meal.source
            ? <a href={c.meal.source} target="_blank" rel="noreferrer"><b>{c.meal.name}</b></a>
            : <b>{c.meal.name}</b>}
          <Verdict c={c} />
        </div>
        <div className="mealmeta">
          {[c.meal.area, c.meal.category].filter(Boolean).join(' · ')}
          {!c.meal.source && <> · no original recipe linked, so this one cannot become a card</>}
        </div>
        {c.usesExpiring.length > 0 && (
          <div className="mealuses">
            uses {c.usesExpiring.map((u) => `${u.name} (${u.daysLeft <= 0 ? 'today' : `${u.daysLeft} d`})`).join(', ')}
          </div>
        )}
        {missing.length > 0 && <div className="mealmiss">no {missing.join(', ')}</div>}
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
      <p className="count" style={{ marginTop: 30 }}>{title} <span className="quiet">{list.length}</span></p>
      {note && <p className="quiet" style={{ marginBottom: 10 }}>{note}</p>}
      <ul className="meallist">
        {list.slice(0, limit).map((c) => <Card key={c.meal.id} c={c} label={label} />)}
      </ul>
      {list.length > limit && (
        <p className="quiet" style={{ marginTop: 8 }}>
          and {list.length - limit} more, not shown. Ask for a cuisine or an ingredient and I will
          narrow it rather than making you scroll.
        </p>
      )}
    </>
  );
}

export default async function Find() {
  const d = await findCandidates();

  return (
    <div className="wrap">
      <Link href="/kitchen" className="eyebrow" style={{ textDecoration: 'none' }}>← Kitchen</Link>
      <h1>What could I make</h1>
      <p className="lede">
        {d.total} dishes checked against what is actually in the kitchen. This is a menu to pick from,
        not a set of recipes: nothing here has been read or cooked, and every name links to the
        original published recipe. Pick one and it gets turned into a proper card first.
      </p>

      <hr className="divider" />

      <Group
        title="Cook one of these and nothing goes to waste"
        note="Cookable now, and each one uses something already on a clock. Soonest first."
        list={d.rescue}
        label={d.nameOf}
      />

      <Group
        title="Ready"
        note="Every ingredient recognised and in the kitchen."
        list={d.ready}
        label={d.nameOf}
      />

      <Group
        title="Probably ready"
        note="Nothing known to be missing, but one or two ingredients are not in the kitchen's vocabulary yet, so this is a maybe rather than a yes."
        list={d.probably}
        label={d.nameOf}
      />

      <Group
        title="One thing short"
        note="Everything else is here. What is missing is named, and some of it you may decide you can skip or swap."
        list={d.missingOne}
        limit={30}
        label={d.nameOf}
      />

      <Group title="Two things short" list={d.missingTwo} limit={12} label={d.nameOf} />

      {d.unlocks.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>One purchase, most dishes</p>
          <p className="quiet" style={{ marginBottom: 8 }}>
            Counted only over dishes missing nothing but this, so the number means it.
          </p>
          <ul className="plainlist">
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
        {d.attribution}. Ingredient lists and photos only: instructions are never copied here, they
        stay at the original recipe, which is also the one thing a cook card may be built from.
      </p>
    </div>
  );
}
