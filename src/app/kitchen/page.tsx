import Link from 'next/link';
import { deriveStock, expiringSoon } from '@/lib/kitchen/stock';
import { allRecipes, offer, rank, type Cookable } from '@/lib/kitchen/recipes';
import { lastCookedMap } from '@/lib/kitchen/cook';

export const dynamic = 'force-dynamic';

const mins = (n?: number | null) => (n == null ? null : n >= 90 ? `${Math.round(n / 60)} h` : `${n} min`);

function Card({ c }: { c: Cookable }) {
  const r = c.recipe;
  const o = c.offer;
  const t = mins(r.time.totalMin);
  return (
    <Link className="card" href={`/kitchen/${r.id}`}>
      <h2>{r.name}</h2>
      <div className="meta">
        {o.status === 'ready' && <span className="tag go">Ready</span>}
        {o.status === 'thaw' && <span className="tag warm">Needs a thaw</span>}
        {o.status === 'adapt' && <span className="tag warm">One swap</span>}
        {t && <span><b>{t}</b></span>}
        {r.serves.proteinPerUnit ? (
          <span><b>{r.serves.proteinPerUnit} g</b> protein{r.serves.unit ? ` per ${r.serves.unit}` : ''}</span>
        ) : null}
        <span>{r.steps.length} steps</span>
      </div>

      {o.status === 'adapt' && (
        <p className="changes">
          No {o.missing.map((m) => m.display.toLowerCase()).join(', ')}.{' '}
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
      <div className="eyebrow">Kitchen</div>
      <h1>What you can cook right now</h1>
      <p className="lede">
        From what is actually in this kitchen. Nothing here needs a shop first, and nothing asks you
        to cook two things at once.
      </p>

      <div className="answer">
        <p className="count">
          {now.length > 0
            ? `${now.length} ${now.length === 1 ? 'dish is' : 'dishes are'} ready to start.`
            : 'Nothing is ready to start without a thaw or a swap.'}
        </p>
        {now.map((c) => <Card key={c.recipe.id} c={c} />)}
      </div>

      {later.length > 0 && (
        <>
          <hr className="divider" />
          <p className="count">With one small change.</p>
          {later.slice(0, 6).map((c) => <Card key={c.recipe.id} c={c} />)}
        </>
      )}

      {soon.length > 0 && (
        <>
          <hr className="divider" />
          <p className="count">Use these first</p>
          <p className="quiet">
            {soon.map((i) => `${i.n} (${i.daysLeft! <= 0 ? 'today' : `${i.daysLeft} d`})`).join(' · ')}
          </p>
        </>
      )}

      {blocked.length > 0 && (
        <>
          <hr className="divider" />
          <p className="quiet">
            {blocked.length} {blocked.length === 1 ? 'dish is' : 'dishes are'} off the list because
            something they are actually named after is missing:{' '}
            {blocked
              .map((c) => `${c.recipe.name} (${c.offer.missing.filter((m) => m.defining).map((m) => m.display.toLowerCase()).join(', ')})`)
              .join('; ')}
            . They come back when you buy it.
          </p>
        </>
      )}
    </div>
  );
}
