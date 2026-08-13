import Link from 'next/link';
import { deriveStock, expiringSoon, amountText } from '@/lib/kitchen/stock';
import { allRecipes, offer, isOfferable, rank, type Cookable } from '@/lib/kitchen/recipes';
import { lastCookedMap } from '@/lib/kitchen/cook';
import { corpusCount } from '@/lib/kitchen/corpus';

export const dynamic = 'force-dynamic';

const mins = (n?: number | null) => (n == null ? null : n >= 90 ? `${Math.round(n / 60)} h` : `${n} min`);

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
  const browsable = await corpusCount();

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
  const now = offered.filter((c) => c.offer.status === 'ready');
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

  return (
    <div className="wrap">
      <Link href="/" className="eyebrow">← Silvio Neyra</Link>
      <h1>What you can cook right now</h1>
      <p className="lede">
        From what is actually in this kitchen. Nothing here needs a shop first, and nothing asks you
        to cook two things at once.
      </p>

      {/* The door to the menu. It used to sit in `.quiet`, the smallest type on the page, and it
          hardcoded "625" when the real figure was already 2,586. A page offering one dish was burying
          the way to thousands in its smallest font and misreporting the count on the way. Counted now,
          never typed. */}
      <p className="lede" style={{ marginTop: 14 }}>
        <Link href="/kitchen/find"><b>Browse {browsable.toLocaleString()} dishes you could make →</b></Link>
      </p>
      <p className="quiet" style={{ marginTop: 4 }}>
        Scored against the fridge, with photos. A menu to pick from, not recipes: nothing there has
        been read or cooked.
      </p>
      <p className="lede" style={{ marginTop: 10 }}>
        <Link href="/kitchen/want"><b>Or say what you feel like and see what it needs →</b></Link>
      </p>
      <p className="quiet" style={{ marginTop: 8 }}>
        <Link href="/kitchen/shop">What is worth buying, and what is sitting here unused →</Link>
      </p>

      <hr className="divider" />

      {/* Nothing at all, said once, only when it is actually true. Until 2026-08-11 this page
          printed "nothing ready to start" as its first concrete statement WHENEVER `now` was empty,
          even with a startable dish sitting directly underneath it, and he went looking on the live
          site and could not find the dish he had asked for that afternoon. A false negative in the
          loudest position on the page is worse than no status at all. */}
      {now.length === 0 && thawing.length === 0 && adapting.length === 0 && (
        <p className="count" style={{ marginTop: 22 }}>nothing ready to start</p>
      )}

      {now.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 22 }}>
            <span className="live">{now.length}</span> ready to start
          </p>
          <div>{now.map((c) => <Dish key={c.recipe.id} c={c} />)}</div>
        </>
      )}

      {/* A 20-minute counter thaw is not "not ready". Splitting thaw from swap so the heading can
          say which, because "With one small change" read as a caveat and buried the only dish. */}
      {thawing.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>Start tonight, once one thing thaws</p>
          <div>{thawing.slice(0, 8).map((c) => <Dish key={c.recipe.id} c={c} />)}</div>
        </>
      )}

      {adapting.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>With one swap</p>
          <div>{adapting.slice(0, 8).map((c) => <Dish key={c.recipe.id} c={c} />)}</div>
        </>
      )}

      {soon.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>Use these first</p>
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
                  <span>{i.daysLeft! <= 0 ? 'today' : `${i.daysLeft} d left`}</span>
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

      {blocked.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>Off the list</p>
          <p className="quiet" style={{ marginBottom: 8 }}>
            Named after something you do not have. Still openable, they are just not being offered.
          </p>
          {/* Off the list must never mean unreachable. Raised 2026-08-09: "now that it's off, I
              can't even check what the recipe was." Not offering a dish is a ranking decision;
              hiding it is a navigation bug. */}
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

      {/* Changed from a published recipe, therefore not offered. This section exists so the reason is
          on the screen rather than in a git commit. */}
      {adapted.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>Changed from the original, so not offered</p>
          <p className="quiet" style={{ marginBottom: 8 }}>
            These were scaled, or had an ingredient swapped, or got a different pan than the recipe
            says. That layer is where every problem has come from: one of these produced five wrong
            instructions in a single evening, and not one of them was a number the original gave. They
            are still here to read and still cookable. They are just not being recommended.
          </p>
          <ul className="plainlist az">
            {[...adapted]
              .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name))
              .map((c) => (
                <li key={c.recipe.id}>
                  <Link href={`/kitchen/${c.recipe.id}`}>{c.recipe.name}</Link>
                  {c.recipe.deviations?.length
                    ? <span> {c.recipe.deviations.length} changes</span>
                    : null}
                </li>
              ))}
          </ul>
        </>
      )}

      {/* Not offered, still reachable. Raised 2026-08-09: "now that it's off, I can't even check
          what the recipe was." */}
      {unread.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>Not checked yet</p>
          <p className="quiet" style={{ marginBottom: 8 }}>
            Nobody has read these the way you would read them. Open them if you like, but expect
            them to be wrong somewhere, because the one recipe that has been checked was wrong in
            eleven places.
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

      {/* Moved here from the top of the page on 2026-08-11. It answers a real question he asked on
          08-09 ("is this something that the agent came up with so I shouldn't trust it?") and it
          earns its place, but at the top it was about 90 words of the app's own failures standing
          between him and any food. Counting the other explanatory paragraphs, this page carried
          roughly 200 words about its own trustworthiness and one dish. A footnote is a footnote. */}
      <hr className="divider" style={{ marginTop: 34 }} />
      <p className="quiet">
        <b>{read.length} of {recipes.length}</b> recipes are being offered, and the bar changed on
        2026-08-11. A recipe is now offered only if it follows one published recipe with nothing
        altered: its scale, its pan, its ingredients, its heat. Changing any of that is where every
        failure has come from. Piccata burnt after passing a six-source check on its numbers. A Korean
        beef bowl produced five wrong instructions in one evening, and not one of them was a figure a
        source gave: they were a pan swapped for a pot, a browning target the dish cannot reach, a
        note about fond in a dish that has none, a unit the rice cooker does not use, and a sauce
        asked to be three times thicker than the original wants. Passing a check was never the same as
        working, so the checking was replaced with having less to check.
      </p>
    </div>
  );
}
