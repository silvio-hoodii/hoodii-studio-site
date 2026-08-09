import Link from 'next/link';
import { deriveStock, expiringSoon } from '@/lib/kitchen/stock';
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
          {o.frozen.join(', ')} {o.frozen.length > 1 ? 'are' : 'is'} still frozen. Move to the fridge
          tonight and this is tomorrow.
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

  const offered = rank(all);
  const blocked = all.filter((c) => c.offer.status === 'blocked');
  const now = offered.filter((c) => c.offer.status === 'ready');
  const later = offered.filter((c) => c.offer.status !== 'ready');
  const soon = expiringSoon(stock, 7, 3);

  return (
    <div className="wrap">
      <Link href="/" className="eyebrow">← Silvio Neyra</Link>
      <h1>What you can cook right now</h1>
      <p className="lede">
        From what is actually in this kitchen. Nothing here needs a shop first, and nothing asks you
        to cook two things at once.
      </p>

      <hr className="divider" />

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
            {soon.map((i) => `${short(i.n)}, ${i.daysLeft! <= 0 ? 'today' : `${i.daysLeft} d left`}`).join(' · ')}
          </p>
        </>
      )}

      {blocked.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 30 }}>Off the list</p>
          <p className="quiet">
            {blocked
              .map((c) => `${c.recipe.name} (no ${c.offer.missing.filter((m) => m.defining).map((m) => head(m.display)).join(', ')})`)
              .join(' · ')}
            . Named after something you do not have. They come back when you buy it.
          </p>
        </>
      )}
    </div>
  );
}
