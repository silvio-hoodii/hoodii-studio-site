import { NextResponse } from 'next/server';
import { finishCook, logProtein } from '@/lib/kitchen/cook';
import { allRecipes } from '@/lib/kitchen/recipes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.dish || !body?.dishName) {
      return NextResponse.json({ ok: false, error: 'dish and dishName required' }, { status: 400 });
    }
    await finishCook({
      dish: String(body.dish),
      dishName: String(body.dishName),
      rating: body.rating ? String(body.rating) : '',
      note: body.note ? String(body.note) : '',
      ranOut: Array.isArray(body.ranOut) ? body.ranOut.map(String) : [],
    });

    /* Protein is logged HERE, from the recipe, and the client sends only how many portions he ate.
     * It could have sent the grams; then the number in the log would be whatever the page believed
     * at the time, and a stale tab would write a figure the recipe no longer says. The id is the
     * only thing the client is trusted with. */
    const units = Number(body.units);
    if (Number.isFinite(units) && units > 0) {
      const recipe = (await allRecipes()).find((r) => r.id === String(body.dish));
      const per = recipe?.serves?.proteinPerUnit ?? null;
      if (per != null) {
        await logProtein({
          dish: String(body.dish),
          units,
          proteinG: Math.round(per * units),
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
