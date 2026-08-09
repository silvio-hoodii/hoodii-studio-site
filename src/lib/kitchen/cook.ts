import 'server-only';
import { sql, kitchenDay, daysBetween } from './db';
import { appendStockEvent } from './stock';
import { getRecipe } from './recipes';

export interface CookedRow { dish: string; at: string; rating: string | null }

/** When each dish was last cooked. Used to sink things he has just eaten. */
export async function lastCookedMap(): Promise<Record<string, { at: string; days: number }>> {
  // A debrief is any row with no step index. Filtering on a non-empty rating was wrong: he often
  // finishes a dish without tapping how it went, and those runs still happened. "Slice the Roast and
  // Bank the Beef" was logged unrated on 2026-08-06 and was still being offered as ready.
  const rows = await sql`
    select dish, max(at) as at from cook_log where step is null group by dish
  ` as { dish: string; at: Date }[];
  const today = kitchenDay();
  const out: Record<string, { at: string; days: number }> = {};
  for (const r of rows) {
    const day = kitchenDay(r.at);
    out[r.dish] = { at: day, days: daysBetween(day, today) };
  }
  return out;
}

export async function recentNotes(dish: string, limit = 3) {
  return await sql`
    select at, rating, note, step, kind from cook_log
    where dish = ${dish} and note is not null and note <> ''
    order by at desc limit ${limit}
  ` as { at: Date; rating: string | null; note: string; step: number | null; kind: string | null }[];
}

export async function logStepNote(e: {
  dish: string; note: string; step: number; stepOf: number; kind: string; stepText: string;
}) {
  await sql`
    insert into cook_log (dish, rating, note, step, step_of, kind, step_text)
    values (${e.dish}, '', ${e.note}, ${e.step}, ${e.stepOf}, ${e.kind}, ${e.stepText})
  `;
}

/** Finishing a dish. THIS is the join that never existed.
 *
 * The old app wrote a finished dish to cook-log.jsonl and nothing at all to stock, so a sirloin
 * roast consumed on 2026-08-06 was still leading the home screen on 2026-08-08 as "3 DAYS PAST ITS
 * BEST. Slice it TODAY". Every dish he ever cooked would have done the same thing.
 *
 * `ranOut` is the one question worth asking, because cooking cannot tell us how much is left: using
 * 500 g of a 1 kg roast finishes nothing, using the last bag of beef finishes it. It is a tap on a
 * short list of things this dish actually used, never a form. Skipping it costs accuracy and
 * nothing else, which is the whole design: it must never become inventory he has to maintain.
 */
export async function finishCook(e: {
  dish: string;         // the recipe id
  dishName: string;
  rating?: string;
  note?: string;
  ranOut?: string[];    // stock ids he tapped as finished
}) {
  await sql`
    insert into cook_log (dish, rating, note)
    values (${e.dishName}, ${e.rating ?? ''}, ${e.note ?? ''})
  `;

  const r = await getRecipe(e.dish);
  if (!r) return;

  const ranOut = new Set(e.ranOut ?? []);
  const seen = new Set<string>();

  for (const ing of r.ingredients) {
    if (!ing.stock || ing.staple) continue;
    if (seen.has(ing.stock)) continue;
    seen.add(ing.stock);

    if (ranOut.has(ing.stock)) {
      await appendStockEvent({
        id: ing.stock, ev: 'out', src: 'cook',
        note: `Finished cooking ${r.name} on ${kitchenDay()}, and he tapped this as gone.`,
      });
    } else {
      // Level unchanged, but the raw ingredient's use-by clock ends here.
      await appendStockEvent({
        id: ing.stock, ev: 'cooked', src: 'cook',
        note: `Used in ${r.name} on ${kitchenDay()}.`,
      });
    }
  }
}

export async function logProtein(e: { dish: string; units: number; proteinG: number; day?: string }) {
  await sql`
    insert into protein_log (day, dish, units, protein_g)
    values (${e.day ?? kitchenDay()}, ${e.dish}, ${e.units}, ${e.proteinG})
  `;
}

export async function proteinToday(day = kitchenDay()) {
  const rows = await sql`
    select coalesce(sum(protein_g),0)::float as total from protein_log where day = ${day}
  ` as { total: number }[];
  return rows[0]?.total ?? 0;
}
