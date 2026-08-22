import Link from 'next/link';
import { thumb, type Candidate } from '@/lib/kitchen/corpus';

/* ONE ROW COMPONENT, SHARED. Extracted from find/page.tsx on 2026-08-21, and the reason is the whole
 * point of the change it is part of.
 *
 * /kitchen scored the 36 hand-built cook cards and said "2 ready to cook". /kitchen/find scored 2,835
 * corpus recipes and said 62 ready, 34 once thawed, 668 one thing short. Same app, same fridge, one
 * tap apart, and the front door was reading the small library. His words: "we're trapped on four or
 * five dishes... I might as well just search for a recipe online and go by that then. What's the
 * point of all this?"
 *
 * This codebase has already been here. `isOfferable()` was pulled into lib/kitchen/recipes.ts because
 * two surfaces disagreed by 14x, "14 dishes you can cook right now" against "1 ready to start". That
 * fix unified the GATE and left the surfaces reading different LIBRARIES, so it came back at 85x. The
 * lesson taken then was "extract isOfferable". The lesson actually available was "never let two
 * surfaces answer the same question from their own code", and copying this markup into the home page
 * would have been the third instance of it.
 *
 * So the row lives here and both pages render it. A change to how a dish is described cannot reach one
 * surface and miss the other. */

export function Verdict({ c }: { c: Candidate }) {
  const n = c.score.missing.length;
  if (n === 0 && c.score.verdict === 'ready') return <span className="v ok">ready</span>;
  if (n === 0) return <span className="v">{c.score.unknown.length} unsure</span>;   // named below
  return <span className="v">need {n}</span>;
}

export function MealRow({ c, label }: { c: Candidate; label: (id: string) => string }) {
  const t = thumb(c.meal.image);
  const missing = c.score.missing.map((m) => (m.item ? label(m.item) : m.shown));

  /* WHERE A ROW GOES, and it depends on what the row is short of. Changed 2026-08-22.
   *
   * Every row without a card went to `/kitchen/want`, which answers "what would I need to buy". For a
   * dish badged READY that is a screen of eleven things he already owns and nothing to buy: an answer
   * to a question he did not ask, sitting between him and the recipe, behind a live network fetch that
   * can 403. His words, tapping Air fryer chicken thighs: "Why aren't those options supposed to go? Is
   * this because he needs to read the recipe, i dont really understand whats the purpose of those
   * boxes."
   *
   * The purpose is real and it is just mis-targeted. "What would I need" is exactly right for a dish
   * that is short something, and worthless for one that is not.
   *
   *   card exists      -> the card, because it is the only thing with instructions of its own
   *   nothing missing  -> the publisher, because he tapped it to cook it
   *   short something  -> /kitchen/want, because that is the question
   *
   * The publisher's page opens in a new tab, so the list he was reading is still behind it. The
   * instructions are never copied here and never will be: that is SOURCING.md, and it is why the
   * destination for a cookable dish has to be off-site. */
  const cookable = c.score.missing.length === 0;
  const out = c.meal.source ?? '';
  const href = c.cardId
    ? `/kitchen/${c.cardId}`
    : cookable && out
      ? out
      : `/kitchen/want?url=${encodeURIComponent(out)}`;
  /* An off-site link has to say so and has to be safe. Internal routes keep next/link's prefetch. */
  const external = !c.cardId && cookable && !!out;
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
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden="true">
          {t
            ? <img className="mealthumb" src={t} alt="" loading="lazy" width={56} height={56} />
            : <div className="mealthumb" />}
        </a>
      ) : (
        <Link href={href} tabIndex={-1} aria-hidden="true">
          {t
            ? <img className="mealthumb" src={t} alt="" loading="lazy" width={56} height={56} />
            : <div className="mealthumb" />}
        </Link>
      )}
      <div className="mealbody">
        <div className="mealtop">
          {/* Leads INTO the app, not out of it. Until now the only interactive thing on a row was a
              link to the publisher, so "pick one and it gets turned into a card" had no gesture behind
              it anywhere on the page. The original recipe is still one tap further on. */}
          {external
            ? <a href={href} target="_blank" rel="noreferrer"><b>{c.meal.name}</b></a>
            : <Link href={href}><b>{c.meal.name}</b></Link>}
          {c.cardId && <span className="v ok">card</span>}
          <Verdict c={c} />
        </div>
        <div className="mealmeta">{[c.meal.area, c.meal.category].filter(Boolean).join(' · ')}</div>
        {c.usesExpiring.length > 0 && (
          <div className="mealuses">
            uses {c.usesExpiring.map((u) => `${u.name} (${u.daysLeft <= 0 ? 'today' : `${u.daysLeft} d`})`).join(', ')}
          </div>
        )}
        {/* WHAT IS STILL FROZEN, said on the row. The home page's own thaw section used to describe
            this in a sentence under the dish and the corpus rows said nothing at all, so a dish could
            sit under "once something thaws" without naming the thing. */}
        {c.needsThaw.length > 0 && (
          <div className="mealmeta">{c.needsThaw.join(', ')} still in the freezer</div>
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
        {/* The ingredient audit stays REACHABLE for a cookable dish, just no longer in the way. It is
            the right screen for "wait, do I really have everything for this", which is a question worth
            one tap and not worth being the only destination. Not offered where it is already the main
            link, and not offered on a card, which lists its own ingredients on the cook screen. */}
        {external && (
          <div className="mealmeta">
            <Link href={`/kitchen/want?url=${encodeURIComponent(out)}`}>check it against the kitchen</Link>
          </div>
        )}
      </div>
    </li>
  );
}
