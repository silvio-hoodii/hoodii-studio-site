import { notFound } from 'next/navigation';
import { getRecipe, equipmentVocab, offer, asUse } from '@/lib/kitchen/recipes';
import { deriveStock } from '@/lib/kitchen/stock';
import { recentNotes } from '@/lib/kitchen/cook';
import CookClient from './CookClient';

export const dynamic = 'force-dynamic';

export default async function CookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  const [stock, vocab, notes] = await Promise.all([
    deriveStock(),
    equipmentVocab(),
    recentNotes(recipe.name, 3),
  ]);

  const o = offer(recipe, stock);

  // The prep list is GENERATED from what the steps actually use, in both directions. That is the
  // whole reason the schema exists: "What baking sheet this wasn't on the list wtf" cannot happen
  // when the list is derived from the steps rather than typed alongside them.
  const usedRefs = new Set(recipe.steps.flatMap((s) => (s.uses ?? []).map((u) => asUse(u).ref)));
  const usedEquip = new Set(recipe.steps.flatMap((s) => s.equipment ?? []));

  const prep = recipe.ingredients
    .filter((i) => usedRefs.has(i.ref))
    .map((i) => ({
      ref: i.ref,
      display: i.display,
      qty: i.qty ?? null,
      unit: i.unit ?? null,
      prep: i.prep ?? null,
      missing: o.missing.some((m) => m.ref === i.ref),
      altText: i.altText ?? null,
    }));

  const gear = [...usedEquip]
    .map((e) => ({ id: e, name: vocab[e]?.name ?? e }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // What this dish could plausibly finish off, for the one question worth asking at the end.
  const consumable = recipe.ingredients
    .filter((i) => i.stock && !i.staple)
    .map((i) => ({ stock: i.stock!, display: i.display }))
    .filter((v, idx, arr) => arr.findIndex((x) => x.stock === v.stock) === idx);

  return (
    <CookClient
      recipe={recipe}
      prep={prep}
      gear={gear}
      consumable={consumable}
      notes={notes.map((n) => ({
        at: new Date(n.at).toISOString().slice(0, 10),
        note: n.note,
        rating: n.rating,
        step: n.step,
        kind: n.kind,
      }))}
    />
  );
}
