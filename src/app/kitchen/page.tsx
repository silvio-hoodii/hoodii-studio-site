import Link from 'next/link';
import { deriveStock, expiringSoon, amountText } from '@/lib/kitchen/stock';
import { allRecipes, offer, rank, type Cookable } from '@/lib/kitchen/recipes';
import { lastCookedMap } from '@/lib/kitchen/cook';

export const dynamic = 'force-dynamic';

const mins = (n?: number | null) => (n == null ? null : n >= 90 ? `${Math.round(n / 60)} h` : `${n} min`);

/** Strip the shop's branding: "spring mix salad (Your Fresh Market)". */
const short = (s: string) => s.replace(/\s*\([^)]*\)/g, '').trim();
/** Ingredient display names carry their prep: "capers, drained", "red onion, sliced 3 mm thick".
 *  Right at the stove, wrong in a sentence explaining why a dish is unavailable. */
const head = (s: string) => short(s).split(',')[0]!.trim().toLowerCase();

function Dish({ c }: { c: Cookable }) {
  const r = c.recipe;
  const o = c.offer;
  const t = mins(r.time.totalMin);
  return (
    <Link className="dish" href={`/kitchen/${r.id}`}>
      <h2>{r.name}</h2>
      <span className="arrow">→</span>
      <div className="meta">
        {t && <span><b>{t}</b></span>}
        {r.serves.proteinPerUnit ? (
          <span><b>{r.serves.proteinPerUnit} g</b> protein{r.serves.unit ? ` / ${r.serves.unit}` : ''}</span>
        ) : null}
        <span>{r.steps.length} steps</span>
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
  const isRead = (c: Cookable) =>
    !!c.recipe.provenance?.readAt
    && c.recipe.provenance.readAt === c.recipe.build
    && c.recipe.provenance.cookedResult !== 'failed';

  const read = all.filter(isRead);
  const unread = all.filter((c) => !isRead(c));
  const offered = rank(read);
  const blocked = read.filter((c) => c.offer.status === 'blocked');
  const now = offered.filter((c) => c.offer.status === 'ready');
  const later = offered.filter((c) => c.offer.status !== 'ready');
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

      <hr className="divider" />

      {/* The honest headline number. Asked 2026-08-09: "Where is this recipe coming from? ... is
          this something that the agent came up with so I shouldn't trust it?" */}
      <p className="quiet" style={{ marginTop: 18 }}>
        <b>{read.length} of {recipes.length}</b> of these are being offered. A recipe is offered
        once every step has been read the way this app renders it, and once it has been cooked
        without going wrong. Piccata passed a six-source check on its numbers and a full read of its
        screens on 2026-08-09, then burnt its second batch at the stove because no step said what
        the heat should be once the pan was already hot. Passing a check is not the same as working.
        Recipes are being rewritten to follow one published recipe word for word instead of being
        written here, which is where every failure so far has come from.
      </p>

      <p className="count" style={{ marginTop: 22 }}>
        {now.length > 0 ? <><span className="live">{now.length}</span> ready to start</> : 'nothing ready to start'}
      </p>
      <div>{now.map((c) => <Dish key={c.recipe.id} c={c} />)}</div>

      {later.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>With one small change</p>
          <div>{later.slice(0, 8).map((c) => <Dish key={c.recipe.id} c={c} />)}</div>
        </>
      )}

      {soon.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>Use these first</p>
          <p className="quiet">
            {/* The amount comes from `amountText`, which reads the qty column, never the `label`
                string. Where nothing has been weighed it is simply omitted rather than filled in
                with the last thing anyone typed. */}
            {soon.map((i) => {
              const amt = amountText(i);
              return `${short(i.n)}${amt ? `, ${amt}` : ''}, ${i.daysLeft! <= 0 ? 'today' : `${i.daysLeft} d left`}`;
            }).join(' · ')}
          </p>
        </>
      )}

      {/* How much is left, which nothing in this app could answer until 2026-08-11.
        *
        * Only items with a REAL measured amount appear. That is the point: the list is short because
        * few things have been weighed, and a short honest list beats a long list padded with the
        * last number someone typed into a label. Anything unweighed is simply absent rather than
        * guessed at. */}
      {counted.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>How much is left</p>
          <p className="quiet" style={{ marginBottom: 8 }}>
            Only what has actually been counted or weighed. Everything else in the kitchen is here
            without a number, because nobody measured it and a guess in this list is what made the
            old one wrong.
          </p>
          <ul className="plainlist">
            {counted.map((i) => (
              <li key={i.id}>
                {short(i.n)} <span className="quiet">{amountText(i)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

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
    </div>
  );
}
