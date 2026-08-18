import Link from 'next/link';
import KitchenNav from './KitchenNav';
import { deriveStock, expiringSoon, amountText } from '@/lib/kitchen/stock';
import { allRecipes, offer, isOfferable, rank, type Cookable } from '@/lib/kitchen/recipes';
import { lastCookedMap, proteinToday } from '@/lib/kitchen/cook';
import { dueInText } from '@/lib/format';
import { getProteinTarget } from '@/lib/kitchen/protein';

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

export default async function KitchenHome() {
  const stock = await deriveStock();
  const recipes = await allRecipes();
  const cooked = await lastCookedMap();
  const [proteinLogged, proteinTarget] = await Promise.all([proteinToday(), getProteinTarget()]);

  const all: Cookable[] = recipes.map((r) => {
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
  const now = readyAll.filter((c) => !NO_RECIPE_FORMS.has(c.recipe.form));
  const noRecipe = readyAll.filter((c) => NO_RECIPE_FORMS.has(c.recipe.form));
  /* Split on 2026-08-11. These used to share one heading, "With one small change", which reads as a
   * caveat and is wrong for a thaw: a bag of thin slices needing 20 minutes on the counter is not a
   * dish you have to change anything about. Two headings, each saying which thing it means. */
  const thawing = offered.filter((c) => c.offer.status === 'thaw');
  const adapting = offered.filter((c) => c.offer.status === 'adapt');
  const soon = expiringSoon(stock, 7, 3);
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
            Only dishes finished in this app. A shake or a tub of cottage cheese never passes
            through here, so treat this as a floor and not as the day&apos;s total.
            {proteinTarget?.measuredOn && ` Target computed by HealthOS from the ${proteinTarget.measuredOn} measurement.`}
          </p>
        </>
      )}

      {/* Nothing at all, said once, only when it is actually true. Until 2026-08-11 this page
          printed "nothing ready to start" as its first concrete statement WHENEVER `now` was empty,
          even with a startable dish sitting directly underneath it, and he went looking on the live
          site and could not find the dish he had asked for that afternoon. A false negative in the
          loudest position on the page is worse than no status at all. */}
      {now.length === 0 && thawing.length === 0 && adapting.length === 0 && (
        <>
          <p className="sec">no cook card ready tonight</p>
          <p className="lede">
            A cook card is a recipe written out step by step and checked against this kitchen. There
            are only a handful, on purpose. The menu below has thousands scored against the fridge:
            pick one and it gets turned into a card.
          </p>
        </>
      )}

      {now.length > 0 && (
        <>
          <p className="sec">
            <span className="live">{now.length}</span> ready to cook
          </p>
          <div>{now.map((c) => <Dish key={c.recipe.id} c={c} />)}</div>
        </>
      )}

      {/* A 20-minute counter thaw is not "not ready". Splitting thaw from swap so the heading can
          say which, because "With one small change" read as a caveat and buried the only dish. */}
      {thawing.length > 0 && (
        <>
          <p className="sec">Start tonight, once one thing thaws</p>
          <div>{thawing.slice(0, 8).map((c) => <Dish key={c.recipe.id} c={c} />)}</div>
        </>
      )}

      {adapting.length > 0 && (
        <>
          <p className="sec">With one swap</p>
          <div>{adapting.slice(0, 8).map((c) => <Dish key={c.recipe.id} c={c} />)}</div>
        </>
      )}

      {soon.length > 0 && (
        <>
          <p className="sec">Use these first</p>
          {/* Each one is a LINK now. It used to be plain text: he was told three things were dying
              today and given nothing to tap, while /kitchen/find had a group of dishes that eat exactly
              those items one tap away. DESIGN.md's rule is never to say what is wrong without saying
              what to do about it, and this panel was breaking it. */}
          <ul className="plainlist">
            {soon.map((i) => {
              const amt = amountText(i);
              return (
                <li key={i.id}>
                  <Link href={`/kitchen/find?uses=${encodeURIComponent(i.id)}&max=1`}>
                    {short(i.n)}{amt ? `, ${amt}` : ''}
                  </Link>
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
      {(noRecipe.length > 0 || blocked.length > 0 || adapted.length > 0 || unread.length > 0) && (
        <>
          <hr className="divider" style={{ marginTop: 30 }} />

          {noRecipe.length > 0 && (
            <details className="fold">
              <summary>No recipe really needed ({noRecipe.length})</summary>
              <p className="lede" style={{ marginBottom: 8 }}>
                Oats, a smoothie, a shake, a yogurt bowl. Nothing is heated and nothing can go wrong,
                so they are here for the protein arithmetic rather than for the instructions.
              </p>
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
                    Scaled, or an ingredient swapped, or a different pan than the recipe says. That
                    layer is where every failure has come from, so these are readable but not
                    recommended.
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
                <b>{read.length} of {recipes.length}</b> recipes are offered. A recipe is offered only
                if it follows one published recipe with nothing altered: its scale, its pan, its
                ingredients, its heat. Changing any of that is where every failure has come from, so
                the checking was replaced with having less to check.
              </p>
            </details>
          )}
        </>
      )}

    </div>
  );
}
