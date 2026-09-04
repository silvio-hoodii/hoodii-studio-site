import Link from 'next/link';
import WalledLink from '@/components/WalledLink';
import KitchenNav from './KitchenNav';
import { deriveStock, expiringSoon, amountText } from '@/lib/kitchen/stock';
import { allRecipes, offer, isOfferable, rank, type Cookable } from '@/lib/kitchen/recipes';
import { lastCookedMap, proteinToday } from '@/lib/kitchen/cook';
import { dueInText } from '@/lib/format';
import { getProteinTarget } from '@/lib/kitchen/protein';
/* THE ENGINE. Added 2026-08-21, and it is the whole change.
 *
 * This page scored `allRecipes()`, the 36 hand-built cook cards, and printed "2 ready to cook".
 * /kitchen/find scored the 2,835-recipe corpus against the same fridge and found 62 ready, 34 once
 * thawed and 668 one ingredient short with the ingredient named. Same app, same fridge, one tap
 * apart, and the page titled "what you can cook right now" was reading the small library.
 *
 * His words, and they are the spec: "we have all these ingredients, all these tools. How come are we
 * able to say this is something that you can make with what you have... I don't want to think about
 * the dishes. I'm bringing the dishes because the app itself is not offering me anything." And the
 * consequence if this is not fixed: "I might as well just search for a recipe online and go by that
 * then. What's the point of all this?"
 *
 * He was right, and the thing he was asking for was already built and behind a tab called Dishes.
 *
 * WHY IT WAS BUILT THIS WAY, because the reasoning was sound and the conclusion was not. A cook card
 * is the only artefact you can actually be walked through: verbatim from one publisher, every step
 * read as rendered, hash-stamped. That machinery exists because Chicken Piccata burnt. It is right
 * for a hard dish and absurd as the gate on "what can I eat", because building one costs an evening,
 * so the card library can never be the answer to what is for dinner. Cards are now a PROPERTY of a
 * dish, shown as a badge, rather than the universe the question is asked over. */
import { findCandidates, type Candidate } from '@/lib/kitchen/corpus';
import { MealRow } from './MealRow';
import HideDish from './HideDish';
import { vetoed, cardKey } from '@/lib/kitchen/veto';

export const dynamic = 'force-dynamic';

/* Math.round(90/60) is 2, so a 90 minute dish read "2 h" and overstated by a quarter. He plans around
 * these. Minutes all the way to two hours, then halves. */
const mins = (n?: number | null) => {
  if (n == null) return null;
  if (n < 120) return `${n} min`;
  const h = Math.floor(n / 60);
  const rest = n % 60;
  return rest === 0 ? `${h} h` : rest === 30 ? `${h}.5 h` : `${h} h ${rest} min`;
};

/** Strip the shop's branding: "spring mix salad (Your Fresh Market)". */
const short = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim();
/** Ingredient display names carry their prep: "capers, drained", "red onion, sliced 3 mm thick".
 *  Right at the stove, wrong in a sentence explaining why a dish is unavailable. */
const head = (s: string) => short(s).split(',')[0]!.trim().toLowerCase();

/** The first line of `why`, which is where a recipe says what the food actually IS.
 *
 *  Added 2026-08-11. The card showed a name, a time, a protein figure and a step count, and he
 *  could not find the dish he had just asked for: "Not sure what I'm supposed to be looking for."
 *  Nothing on it said beef, mushrooms or rice. `why` was written for exactly this and the home
 *  page never rendered it. */
const gist = (why?: string) => {
  if (!why) return null;
  const first = why.split(/(?<=\.)\s/)[0]!.trim();
  return first.length > 150 ? `${first.slice(0, 147).trimEnd()}...` : first;
};

/* DINNER FIRST. Added 2026-08-22.
 *
 * Every corpus bucket arrives sorted by NAME, which is fine on /kitchen/find where he is browsing with
 * filters and a search box, and useless as the top of the front page. Sorted A to Z, "ready" opened on
 * Air Fryer Asparagus, Air Fryer Hard Boiled Eggs, air fryer patatas bravas and two kinds of cookie,
 * and "one ingredient short" opened on `"All-Edge" Warm and Spicy Brownies` followed by baked oatmeal
 * and pancakes. 501 dishes behind an alphabet is not an answer to what is for dinner.
 *
 * His words: "Why is it not something as simple as 'Oh chicken and rice with something, whatever,
 * tuna'?" That dish exists in the corpus and was buried under the letter A.
 *
 * `courses` is already derived per candidate from the publisher's own category, so this needs no
 * tagging and cannot drift from the filter chips that use the same field. Sides and sweets are not
 * hidden, they sort last, and the Sweet & baking chip on /kitchen/find is still the way to ask for
 * them on purpose. */
const COURSE_RANK: Record<string, number> = {
  dinner: 0, lunch: 1, soup: 2, breakfast: 3, side: 4, sweet: 5,
};
const courseRank = (c: Candidate) =>
  Math.min(6, ...c.courses.map((id) => COURSE_RANK[id] ?? 6));
/** Dinner-ish first, then whatever order the bucket already had, which is meaningful for `rescue`
 *  (soonest to spoil) and alphabetical elsewhere. A stable sort keeps both. */
const mealFirst = (list: Candidate[]) =>
  [...list].sort((a, b) =>
    courseRank(a) - courseRank(b)
    /* Then FEWEST UNRECOGNISED INGREDIENTS. Within one course the buckets are alphabetical, so the
     * first ten dinners were whatever began with A: air-fryer roast chicken, an anchovy spaghetti,
     * four asparagus dishes. Confidence is the honest tiebreak, because a dish with three lines the
     * matcher could not read is a weaker claim than one it read completely, and it happens to bury
     * the alphabet. */
    || a.score.unknown.length - b.score.unknown.length);

function Dish({ c }: { c: Cookable }) {
  const r = c.recipe;
  const o = c.offer;
  const t = mins(r.time.totalMin);
  const summary = gist(r.why);
  return (
    <Link className="dish" href={`/kitchen/${r.id}`}>
      <h2>{r.name}</h2>
      <span className="arrow">→</span>
      {summary && <p className="gist">{summary}</p>}
      <div className="meta">
        {t && <span><b>{t}</b></span>}
        {r.serves.proteinPerUnit ? (
          <span><b>{r.serves.proteinPerUnit} g</b> protein{r.serves.unit ? ` / ${r.serves.unit}` : ''}</span>
        ) : null}
        <span>{r.steps.length} steps</span>
        {/* Never cooked is worth saying. Asked for a NEW dish on 2026-08-11 and had no way to tell
            which of these he had already eaten. */}
        {c.lastCooked === null && <span>never cooked</span>}
        {o.status === 'thaw' && <span>needs a thaw</span>}
        {o.status === 'adapt' && <span>one swap</span>}
      </div>

      {o.status === 'adapt' && (
        <p className="changes">
          No {o.missing.map((m) => head(m.display)).join(', ')}.{' '}
          {o.missing.find((m) => m.altText)?.altText ?? 'The dish still works without it.'}
        </p>
      )}
      {o.status === 'thaw' && (
        <p className="changes">
          {o.frozen.join(', ')} {o.frozen.length > 1 ? 'are' : 'is'} still frozen.{' '}
          {o.thawText ?? 'Move to the fridge tonight and this is tomorrow.'}
        </p>
      )}
    </Link>
  );
}

/* The card row's own "not this", OUTSIDE the Link. A button inside an anchor is invalid HTML and the
 * browser resolves it by firing the navigation, so the tap would open the recipe instead of hiding it.
 * Cheap to get wrong and invisible in review, since the markup reads fine. */
function DishRow({ c }: { c: Cookable }) {
  return (
    <div>
      <Dish c={c} />
      <div className="mealmeta" style={{ marginTop: -6, marginBottom: 10 }}>
        <HideDish dish={cardKey(c.recipe.id)} name={c.recipe.name} />
      </div>
    </div>
  );
}

export default async function KitchenHome() {
  const stock = await deriveStock();
  const recipes = await allRecipes();
  const cooked = await lastCookedMap();
  const [proteinLogged, proteinTarget] = await Promise.all([proteinToday(), getProteinTarget()]);
  /* Unfiltered, so the buckets are the same ones /kitchen/find shows by default. Both surfaces now
   * read one function, which is what stops them drifting apart again. */
  const d = await findCandidates();
  const veto = await vetoed();

  /* Same filter as the corpus side, on the same log. A card and a corpus dish are two id spaces and
   * one decision: "stop showing me this" cannot mean two different things depending on which library
   * the dish happens to live in. */
  const all: Cookable[] = recipes.filter((r) => !veto.ids.has(cardKey(r.id))).map((r) => {
    const last = cooked[r.name];
    return {
      recipe: r,
      offer: offer(r, stock),
      lastCooked: last?.at ?? null,
      daysSinceCooked: last?.days ?? null,
    };
  });

  /* A recipe is only OFFERED once every one of its steps has been read as the app renders them, at
   * its current build. Decided 2026-08-09 after the app spent the day offering 29 dishes of which
   * zero had ever been cooked from it successfully, and every single one he opened had a defect in
   * the first few seconds. A list of 29 things that might be wrong is worth less than a list of one
   * that is right. The rest stay reachable at the bottom, because not offering a dish is a ranking
   * decision and hiding it is a navigation bug. */
  /* VERBATIM ONLY, decided 2026-08-11. Law 1 of .agents/ENGINEERING.md.
   *
   * `adapted` is no longer offered, whatever else it passes. Five defects reached him from one
   * adapted recipe in a single evening and every one was an agent sentence, not a figure from a
   * source: a vessel swap, an invented browning target, an invented fond note, a unit conversion the
   * appliance does not use, and a sauce test three times thicker than the source asks for.
   *
   * The transformation half of what this app adds has caused every failure across five cooks. The
   * annotation half (technique words in place, real stock, protein arithmetic, timers, doneness where
   * the source gives one) has caused none. So the renderer stays and the transformations go. */
  /* One definition of offerable, shared with the hub row. See isOfferable() in lib/kitchen/recipes.ts:
   * these two surfaces used to disagree by 14x because each had its own idea of "ready". */
  const isRead = (c: Cookable) => isOfferable(c.recipe);

  const read = all.filter(isRead);
  /* Adapted recipes are NOT hidden. Not offering a dish is a ranking decision; hiding it is a
   * navigation bug, raised 2026-08-09: "now that it's off, I can't even check what the recipe was." */
  const adapted = all.filter((c) => !isRead(c) && c.recipe.provenance?.tier === 'adapted');
  const unread = all.filter((c) => !isRead(c) && c.recipe.provenance?.tier !== 'adapted');
  const offered = rank(read);
  const blocked = read.filter((c) => c.offer.status === 'blocked');
  const readyAll = offered.filter((c) => c.offer.status === 'ready');
  /* SPLIT, 2026-08-16. The five things at the top of this page were overnight oats, a smoothie, a
   * protein shake, a yogurt bowl and frozen cottage cheese bites, under a heading reading
   * "5 READY TO START" on a page titled "What you can cook right now". His words: "I don't think a
   * smoothie needs a recipe. Protein shake also doesn't need a recipe... nowhere on the first page
   * can I see what I can make."
   *
   * He is right, and the split is already in the data: `form` is `dish` for a thing you cook and
   * `assembly` or `macro` for things you stir in a glass. They are offered only through the heat-free
   * exemption in SOURCING.md, which was about honesty rather than about them being dinner. They stay
   * reachable one tap down, because hiding a dish is a navigation bug. They just stop being the
   * answer to "what can I cook". */
  const NO_RECIPE_FORMS = new Set(['assembly', 'macro']);
  /* A THIRD BUCKET, 2026-08-22, and it is his distinction rather than mine.
   *
   * "The caramelized onion and the cheese and the pizza dough are different things than a dish...
   * Do we need a separate session for this? I don't know but I want it to be there. That way I come
   * home and I make it instead of coming into here and talking to you."
   *
   * He is right and the data already had the word: `form: "method"` has existed since the schema
   * was written, holding "Brown the Beef and Split It" and "Slice the Roast and Bank the Beef".
   * Both are machine-migrated and therefore never offered, so the form had never once reached a
   * screen and nobody noticed it had no home.
   *
   * These are not answers to "what do I cook tonight". They are things you make so that later
   * cooking is quick: a dough, a batch of onions for the freezer, a bag of grated cheese. Left in
   * `now` they compete with dinner, which is the same mistake the assembly/macro split fixed on
   * 2026-08-16. They get their own visible heading rather than a fold, because the entire point is
   * that he sees them when he walks in. */
  const now = readyAll.filter(
    (c) => !NO_RECIPE_FORMS.has(c.recipe.form) && c.recipe.form !== 'method',
  );
  const noRecipe = readyAll.filter((c) => NO_RECIPE_FORMS.has(c.recipe.form));
  const makeAhead = readyAll.filter((c) => c.recipe.form === 'method');
  /* Split on 2026-08-11. These used to share one heading, "With one small change", which reads as a
   * caveat and is wrong for a thaw: a bag of thin slices needing 20 minutes on the counter is not a
   * dish you have to change anything about. Two headings, each saying which thing it means. */
  const thawing = offered.filter((c) => c.offer.status === 'thaw');
  const adapting = offered.filter((c) => c.offer.status === 'adapt');
  const soon = expiringSoon(stock, 7, 3);
  /* Same rule as `usableIds` in corpus.ts, and it has to be the same number: this panel and the
   * matcher cannot be allowed to disagree about whether a thing is still food. Items further past
   * their date than the grace are gone, and nagging about them is what made this panel wallpaper. */
  const soonUsable = soon.filter((i) => i.daysLeft == null || i.daysLeft >= -3);
  /* Everything with a genuinely known amount, most recently touched first. `qty !== null` is the
   * whole filter: unknown stays unknown and simply does not appear. */
  const counted = Object.values(stock.items)
    .filter((i) => i.qty !== null && i.qty > 0)
    .sort((a, b) => (b.since ?? '').localeCompare(a.since ?? ''));

  /* A receipt for the last stock read, and nothing more than that.
   *
   * This is NOT the "how much is left" list that was removed on 2026-08-13, and it must not grow
   * into one: DESIGN.md rules that out by name, and it was right. This is one line answering a
   * different question, which had no answer anywhere. He drops photos of a shop into Drive, an
   * agent reads them and writes events, and until now the app said nothing at all about it. On
   * 2026-08-14 he dropped seventeen photos, eighteen items moved, and every visible surface looked
   * exactly as it had before. An intake with no acknowledgement is one he cannot trust. */
  const touched = Object.values(stock.items).filter((i) => i.since && i.ageDays != null);
  /* ageDays, not a date subtraction done here: the fold already computes it against the kitchen's
   * own day boundary, and doing the arithmetic twice is how two surfaces end up disagreeing. */
  const readAgeDays = touched.length ? Math.min(...touched.map((i) => i.ageDays as number)) : null;
  const lastReadItems = touched.filter((i) => i.ageDays === readAgeDays);
  const lastRead = lastReadItems[0]?.since ?? null;

  /* HOW MANY ROWS ARE PAST THEIR CONFIRMATION WINDOW, which until 2026-08-28 nothing on this site
     asked. `deriveStock` has computed `conf` per row since the rebuild ('fresh', 'modeled', 'stale',
     'unknown') and a grep for readers of that field across src/app/kitchen and src/lib/kitchen found
     ZERO (02-kitchen P1-2).

     WHY THAT IS WORSE THAN A MISSING FEATURE. `Math.min(...ageDays)` above is the MOST RECENTLY
     touched item, so "Stock last read today: 1 item moved" rendered truthfully while every other row
     could be three weeks unconfirmed, and the qualifying sentence only printed on the two-days-plus
     branch. A "ready to cook" claim resting on a twenty-day-old row was being asserted as fact.
     KitchenOS/DESIGN.md: "Staleness is visible or it is a lie." HOODII/CLAUDE.md: "On a stale row,
     propose anyway and say the assumption out loud." The propose-anyway half was right and stays;
     the say-it-out-loud half did not exist anywhere in the rebuilt app.

     STALE ROWS THAT MATTER, not all of them. A stale row for something that is `out` changes no dish,
     and counting it would put a large number on the page that nothing above depends on. What
     qualifies a cookable claim is a stale row the app is currently treating as PRESENT. */
  const staleInUse = Object.values(stock.items).filter(
    (i) => i.conf === 'stale' && (i.level === 'have' || i.level === 'low'),
  );
  const stalestDays = staleInUse.length
    ? Math.max(...staleInUse.map((i) => i.ageDays as number))
    : null;

  return (
    <div className="wrap">
      <KitchenNav here="home" />
      {/* THE CARDS COME FIRST. Until 2026-08-18 this page opened with a heading, a two-line
          explanation, a stock receipt and THREE prose links that repeated three of the four nav tabs
          in different words, so on a 390px screen the answer he came for started below the fold. His
          verdict on the four sections: "are those 4 pages/section making sense i dont think so".

          What went, and why: the "Browse N dishes" and "say what you feel like" links are now the
          DISHES tab, and "what is worth buying" is the SHOPPING tab. A destination named twice, in two
          different sets of words, is harder to learn than one named once. The stock receipt moved to
          the bottom of the cookable list, where it belongs: it qualifies the list rather than
          introducing it. */}
      <h1>Cook</h1>

      {/* THE HEADLINE IS THE ENGINE'S NUMBER, not the card count. This is the one line the whole
          change exists for: the first thing he reads must be how many dishes his kitchen can make,
          not how many an agent has finished the paperwork on. It read "2 ready to cook" for ten days
          while the answer was in the hundreds. */}
      <p className="sec">
        <span className="live">{d.confidentNow.length}</span> you can cook from the fridge
      </p>
      <p className="lede">
        Out of {d.total}, scored against the fridge. Nothing missing and nothing frozen.{' '}
        {d.thaw.length > 0 && <>{d.thaw.length} more after a thaw. </>}
        {d.missingOne.length > 0 && <>{d.missingOne.length} one ingredient short. </>}
        <WalledLink href="/kitchen/find">See all, or filter by an ingredient</WalledLink>.
      </p>

      {/* A SEARCH BOX ON THE PAGE HE OPENS. Added 2026-08-22.
       *
       * It existed only on /kitchen/find, so naming a dish meant knowing that the tab called Dishes
       * contained a search. It did not, as far as he could tell: "Okay where is the fucking spaghetti
       * bolognese? I'm scrolling the whole page and I don't see it." Scrolling was the only gesture
       * the front page offered, and no ranking will ever put every nameable dish in the first ten
       * rows. Typing the name is the answer to knowing the name. */}
      <form action="/kitchen/find" method="get" className="searchrow">
        <input
          type="search"
          name="q"
          placeholder="name a dish: spaghetti bolognese"
          aria-label="Search the dishes for a name"
          enterKeyHint="search"
        />
        <button type="submit" className="primary">Find</button>
      </form>


      {/* The receipt, MOVED BELOW THE LIST on 2026-08-18. It qualifies the dishes above rather than
          introducing them, and at the top it was one more line between him and the answer. */}
      {lastRead && readAgeDays != null && (
        <p className="quiet" style={{ marginTop: 10 }}>
          {readAgeDays === 0
            ? `Stock last read today: ${lastReadItems.length} item${lastReadItems.length === 1 ? '' : 's'} moved.`
            : readAgeDays === 1
              ? `Stock last read yesterday: ${lastReadItems.length} item${lastReadItems.length === 1 ? '' : 's'} moved.`
              : `Stock last read ${readAgeDays} days ago, on ${lastRead}. Everything below assumes nothing has changed since.`}
        </p>
      )}

      {/* THE ASSUMPTION, SAID OUT LOUD. One line, naming the count and the worst age rather than
          tagging every row: the dish list above is the answer he came for, and a badge on each
          ingredient would be the "how much is left" list DESIGN.md rules out by name. Behind the tap
          are the actual items, because a bare count is the app knowing something and not saying it,
          which is the complaint that produced the named-not-counted rule on /kitchen/find. */}
      {staleInUse.length > 0 && stalestDays != null && (
        <details className="prov" style={{ marginTop: 6 }}>
          <summary>
            {staleInUse.length} item{staleInUse.length === 1 ? '' : 's'} above{' '}
            {staleInUse.length === 1 ? 'is' : 'are'} assumed, not confirmed
            {` (${stalestDays} days since the oldest was checked)`}
          </summary>
          <p className="quiet" style={{ marginTop: 8 }}>
            The dishes above count {staleInUse.length === 1 ? 'this' : 'these'} as present because it is
            the last thing the kitchen was told. Nothing is blocked on it: proposing a dish and naming
            the assumption beats refusing to answer.
          </p>
          <ul className="plainlist">
            {[...staleInUse]
              .sort((a, b) => (b.ageDays as number) - (a.ageDays as number))
              .map((i) => (
                <li key={i.id}>
                  {i.n} <span className="quiet">{i.ageDays} days</span>
                </li>
              ))}
          </ul>
        </details>
      )}

      {/* What today's cooking has actually put in, and nothing more than that.
        *
        * `logProtein` and `proteinToday` have existed in cook.ts since the migration with zero
        * callers and an empty table. This is the caller, and it is a byproduct of finishing a cook
        * rather than a food diary, because a diary is upkeep and upkeep is what killed the French
        * app twice.
        *
        * Which means the number is NOT his intake, and the line says so in the same breath. A shake
        * and a tub of cottage cheese do not pass through this app, so a total presented as "today's
        * protein" would be confidently short every single day. The target comes from HealthOS via
        * the mirror, never typed here, and it shows its own arithmetic.
        *
        * It renders only once something has been logged. An empty progress bar at the top of the
        * page every morning is a chore notification, which is exactly what this must not become. */}
      {proteinLogged > 0 && (
        <>
          <p className="sec">Protein from what you cooked today</p>
          <div className="stats">
            <div>
              <div className="stat-k">Logged here</div>
              <div className="stat-v live">
                {Math.round(proteinLogged)}<span className="stat-u">g</span>
              </div>
              {proteinTarget && (
                <div className="stat-d">
                  {Math.max(0, Math.round(proteinTarget.grams - proteinLogged))} g short of{' '}
                  {proteinTarget.grams}
                </div>
              )}
            </div>
            {proteinTarget && (
              <div>
                <div className="stat-k">Target</div>
                <div className="stat-v">
                  {proteinTarget.grams}<span className="stat-u">g</span>
                </div>
                <div className="stat-d">{proteinTarget.basis ?? 'from HealthOS'}</div>
              </div>
            )}
          </div>
          <p className="lede" style={{ marginTop: 2 }}>
            Only what you cooked here, so it is a floor and not the day&apos;s total.
          </p>
        </>
      )}

      {/* Nothing at all, said once, only when it is actually true. Until 2026-08-11 this page
          printed "nothing ready to start" as its first concrete statement WHENEVER `now` was empty,
          even with a startable dish sitting directly underneath it, and he went looking on the live
          site and could not find the dish he had asked for that afternoon. A false negative in the
          loudest position on the page is worse than no status at all. */}
      {/* THE ACTUAL MENU. Three groups, in the order that answers "what do I make", and each one is
          the same bucket /kitchen/find shows under the same heading, from the same function.
          Deliberately capped short: this is the front page, and the tab is one tap away for the rest.

          `rescue` leads because it is the only ranking that does two jobs at once. He has said twice
          that food going to waste is what he most wants this app to prevent, and he has already lost
          clearance peppers to exactly that. */}
      {d.rescue.length > 0 && (
        <>
          <p className="sec">
            Cook one of these and nothing goes to waste <span className="quiet">{d.rescue.length}</span>
          </p>
          <ul className="meallist">
            {d.rescue.slice(0, 6).map((c) => <MealRow key={c.meal.id} c={c} label={d.nameOf} />)}
          </ul>
        </>
      )}

      {d.ready.length > 0 && (
        <>
          <p className="sec">
            From the fridge, nothing to buy <span className="quiet">{d.ready.length}</span>
          </p>
          <ul className="meallist">
            {mealFirst(d.ready).slice(0, 10).map((c) => <MealRow key={c.meal.id} c={c} label={d.nameOf} />)}
          </ul>
          {d.ready.length > 10 && (
            <p className="lede" style={{ marginTop: 8 }}>
              and {d.ready.length - 10} more.{' '}
              <WalledLink href="/kitchen/find">All of them</WalledLink>.
            </p>
          )}
        </>
      )}

      {/* ONE INGREDIENT SHORT. Absent from this page until 2026-08-22, and its absence is why the dish
       * he has named as his own obvious example in three separate sessions was nowhere on it.
       *
       *   "Okay where is the fucking spaghetti bolognese? I'm scrolling the whole page and I don't see
       *   it. Why is it not there?"
       *
       * Because Budget Bytes' Bolognese is short of wine and TheMealDB's Spaghetti Bolognese is short
       * of worcestershire sauce, so both sat in a 641-dish bucket that only /kitchen/find rendered.
       * The home page showed what he could cook with nothing missing and then stopped, which hides
       * exactly the dishes a person would decide to skip an ingredient on. Naming the gap is the whole
       * value: he can look at "no wine" and make that call in a second. */}
      {d.missingOne.length > 0 && (
        <>
          <p className="sec">
            One ingredient short <span className="quiet">{d.missingOne.length}</span>
          </p>
          <ul className="meallist">
            {mealFirst(d.missingOne).slice(0, 14).map((c) => <MealRow key={c.meal.id} c={c} label={d.nameOf} />)}
          </ul>
          <p className="lede" style={{ marginTop: 8 }}>
            and {d.missingOne.length - 14} more.{' '}
            <WalledLink href="/kitchen/find">All of them</WalledLink>.
          </p>
        </>
      )}

      {/* FROZEN IS NOT A LESSER BUCKET, and it used to read like one. His words: "I don't care about
          the thawing and stuff like that... Why would I register what's in my freezer when it's not
          gonna be used until it's thawed?" All of his protein is in the freezer, so a surface that
          quietly demotes frozen food is a surface with no dinner in it. The line stays, because
          finding out at six that dinner needed thawing at six is its own specific failure, but it is
          a group with a count and not a footnote. */}
      {d.thaw.length > 0 && (
        <>
          <p className="sec">
            Once something thaws <span className="quiet">{d.thaw.length}</span>
          </p>
          <ul className="meallist">
            {mealFirst(d.thaw).slice(0, 8).map((c) => <MealRow key={c.meal.id} c={c} label={d.nameOf} />)}
          </ul>
          {d.thaw.length > 8 && (
            <p className="lede" style={{ marginTop: 8 }}>
              and {d.thaw.length - 8} more.{' '}
              <WalledLink href="/kitchen/find">All of them</WalledLink>.
            </p>
          )}
        </>
      )}

      {/* THE COOK CARDS, MOVED DOWN HERE 2026-08-22, and reframed as a shelf rather than as an answer.
       *
       * They were the first three sections on the page, above everything, in a rewrite whose entire
       * point was that the card library is not the answer to what is for dinner. So the top of the
       * page was still Scrambled Eggs, Mongolian Ground Beef and Arroz con Pollo, which is precisely
       * the five-dish loop he has been describing for weeks:
       *
       *   "Why are those two the first ones to show? Why is the fucking Mongolian ground beef thing
       *   here? I've been telling you that I don't even understand why it is there. Why is it Arroz
       *   con pollo here? The fact that I cook something doesn't mean that I want to eat it forever.
       *   Why are these four sections here even? They don't make sense."
       *
       * Both halves of that are right. A dish he has cooked is evidence the card works, which is why
       * `cookedResult` admits it, and it is also the LEAST interesting thing to be shown tonight. And
       * four separate headings for one shelf of four dishes is four times the heading it earns.
       *
       * So: one section, one heading, below the real list. `rank()` already sinks recently-cooked
       * dishes within it. Thaw and swap notes stay on the individual rows, where the dish itself says
       * what it needs, rather than becoming sections of their own. */}
      {(now.length > 0 || thawing.length > 0 || adapting.length > 0) && (
        <>
          <p className="sec">
            Written out step by step{' '}
            <span className="quiet">{now.length + thawing.length + adapting.length}</span>
          </p>
          <div>
            {[...now, ...thawing, ...adapting].map((c) => <DishRow key={c.recipe.id} c={c} />)}
          </div>
        </>
      )}

      {/* MAKE ONCE, USE ALL WEEK. His category, 2026-08-22: "these are not dishes".
       *
       * A pizza dough, a batch of caramelised onions for the freezer, a bag of grated cheese. None
       * of them is dinner and all of them make dinner faster later. They sit BELOW the dishes,
       * because "what do I cook" is still the page's question, and ABOVE the folds, because the
       * reason he asked for them is so he can walk in and start one without opening a chat.
       *
       * Rendered with the same DishRow as the dishes above rather than the stripped-down list used
       * in the folds: these carry real steps, timers and stock, and the row already knows how to say
       * so. A second row component would be the third instance of the copy that `MealRow` was
       * extracted to stop. */}
      {makeAhead.length > 0 && (
        <>
          <p className="sec">
            Make once, use all week <span className="quiet">{makeAhead.length}</span>
          </p>
          <div>
            {makeAhead.map((c) => <DishRow key={c.recipe.id} c={c} />)}
          </div>
        </>
      )}

      {/* ONE PURCHASE, MOST DISHES. Was only on the Shopping tab, which is the page you open when you
          have already decided to go out. Here it answers a different question: he is standing in the
          kitchen deciding what to make, and the cheapest way to widen that choice belongs next to the
          choice. */}
      {d.unlocks.length > 0 && (
        <>
          <p className="sec">One thing to buy, most dishes</p>
          {/* Not links. There is no filter for "dishes missing exactly this", so a link here would
              promise a screen that does not exist, and a link that lands somewhere unrelated is worse
              than plain text. Same treatment as /kitchen/find. */}
          <ul className="plainlist stack">
            {d.unlocks.slice(0, 5).map((u) => (
              <li key={u.item}>
                <b>{u.count}</b> dishes need only{' '}
                {/* The ingredient names the recipes actually use, not the matcher's bucket name.
                    "64 dishes need only green vegetables" was unactionable: nothing in a shop is
                    called that. His words: "What the fuck is that green vegetable?" */}
                {u.examples.length > 0 ? u.examples.join(', ') : d.nameOf(u.item)}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* GUARDED ON THE FILTERED LIST, not the raw one. Filtering the rows without moving the
          condition left a heading with nothing under it the moment every expiring item was past the
          rot grace, which is the state the kitchen was actually in on 2026-08-22. An empty section
          with a heading reads as a broken app. */}
      {soonUsable.length > 0 && (
        <>
          <p className="sec">Use these first</p>
          {/* Each one is a LINK now. It used to be plain text: he was told three things were dying
              today and given nothing to tap, while /kitchen/find had a group of dishes that eat exactly
              those items one tap away. DESIGN.md's rule is never to say what is wrong without saying
              what to do about it, and this panel was breaking it. */}
          {/* FILTERED 2026-08-22. This panel was listing arugula at 12 days past its best, spring mix
              at 9 and basil at 7, every one of them long gone, and it had been doing it for weeks:
              "Use this first. This has been here for like a month already." A reminder to use food
              that no longer exists is not a reminder, it is a reason to stop reading the panel, and
              those same rows were still being credited to dishes until `usableIds` was fixed today.

              Anything past the rot grace is dropped from BOTH places by the same rule, so the panel
              and the matcher cannot disagree about whether a thing is food. */}
          <ul className="plainlist">
            {soonUsable.map((i) => {
              const amt = amountText(i);
              return (
                <li key={i.id}>
                  <WalledLink href={`/kitchen/find?uses=${encodeURIComponent(i.id)}&max=1`}>
                    {short(i.n)}{amt ? `, ${amt}` : ''}
                  </WalledLink>
                  <span>{dueInText(i.daysLeft)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* "How much is left" was here and is gone, 2026-08-13. KitchenOS/DESIGN.md rules it out by
          name: "A list of everything in the kitchen is a second STOCK.md, it goes stale, it becomes
          wallpaper, and then nobody reads the one row that mattered." It also printed `ground beef, 1
          bag` directly above `ground beef, raw, 4536 g`, which reads as a broken app rather than as two
          different foods. Amounts belong on the ingredient row of a prep screen, where the number
          changes a decision. `counted` is still computed above for whoever wants it back. */}

      {/* EVERYTHING THAT IS NOT AN ANSWER TO "WHAT CAN I COOK", FOLDED AWAY. Rewritten 2026-08-16.
          This was three open sections and a closing paragraph: "Off the list", "Changed from the
          original, so not offered", "Not checked yet", listing 27 recipes he cannot cook, each with
          its own paragraph of explanation, plus 120 words about the app's own past failures. His
          words: "there's this first section, so I have to keep scrolling, then there's not the
          list. I don't care what's off the list."

          Every one of them stays reachable, because 2026-08-09 established that not offering a dish
          is a ranking decision and hiding it is a navigation bug. Reachable is not the same as
          unavoidable. One summary line, tap to open. */}
      {/* WHAT HE HAS SAID NO TO, with the undo beside it.
       *
       * Hidden, never deleted. 2026-08-09 settled that not offering a dish is a ranking decision and
       * hiding it is a navigation bug, after he lost a recipe off the page: "now that it's off, I
       * can't even check what the recipe was." A veto is the strongest ranking signal in the app and
       * it still does not get to make a dish unreachable.
       *
       * Renders nothing at zero, which is the normal state. */}
      {veto.list.length > 0 && (
        <>
          <hr className="divider" style={{ marginTop: 30 }} />
          <details className="fold">
            <summary>Dishes you told it to stop showing ({veto.list.length})</summary>
            <ul className="plainlist stack">
              {veto.list.map((v) => (
                <li key={v.dish}>
                  <span>{v.name ?? v.dish}</span>
                  <HideDish dish={v.dish} name={v.name ?? v.dish} hidden />
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {(noRecipe.length > 0 || blocked.length > 0 || adapted.length > 0 || unread.length > 0) && (
        <>
          <hr className="divider" style={{ marginTop: 30 }} />

          {noRecipe.length > 0 && (
            <details className="fold">
              <summary>No recipe really needed ({noRecipe.length})</summary>
              <ul className="plainlist az">
                {noRecipe.map((c) => (
                  <li key={c.recipe.id}>
                    <Link href={`/kitchen/${c.recipe.id}`}>{c.recipe.name}</Link>
                    {c.recipe.serves?.proteinPerUnit
                      ? <span>{c.recipe.serves.proteinPerUnit} g</span>
                      : null}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(blocked.length > 0 || adapted.length > 0 || unread.length > 0) && (
            <details className="fold">
              <summary>
                Everything else in here ({blocked.length + adapted.length + unread.length})
              </summary>

              {blocked.length > 0 && (
                <>
                  <p className="sec">Off the list</p>
                  <p className="lede" style={{ marginBottom: 8 }}>
                    Named after something you do not have.
                  </p>
                  <ul className="plainlist">
                    {blocked.map((c) => (
                      <li key={c.recipe.id}>
                        <Link href={`/kitchen/${c.recipe.id}`}>{c.recipe.name}</Link>
                        <span> no {c.offer.missing.filter((m) => m.defining).map((m) => head(m.display)).join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {adapted.length > 0 && (
                <>
                  <p className="sec">Changed from the original</p>
                  <p className="lede" style={{ marginBottom: 8 }}>
                    Changed from the original. Not recommended.
                  </p>
                  <ul className="plainlist az">
                    {[...adapted]
                      .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name))
                      .map((c) => (
                        <li key={c.recipe.id}>
                          <Link href={`/kitchen/${c.recipe.id}`}>{c.recipe.name}</Link>
                          {c.recipe.deviations?.length
                            ? <span>{c.recipe.deviations.length} changed</span>
                            : null}
                        </li>
                      ))}
                  </ul>
                </>
              )}

              {unread.length > 0 && (
                <>
                  <p className="sec">Never checked</p>
                  <p className="lede" style={{ marginBottom: 8 }}>
                    Nobody has read these the way you would read them. Expect mistakes.
                  </p>
                  <ul className="plainlist az">
                    {[...unread]
                      .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name))
                      .map((c) => (
                        <li key={c.recipe.id}>
                          <Link href={`/kitchen/${c.recipe.id}`}>{c.recipe.name}</Link>
                        </li>
                      ))}
                  </ul>
                </>
              )}

              <p className="quiet" style={{ marginTop: 16 }}>
                <b>{read.length} of {recipes.length}</b> cook cards are offered. A card has to follow
                one published recipe with nothing altered.
              </p>
            </details>
          )}
        </>
      )}

    </div>
  );
}
