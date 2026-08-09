import { NextResponse } from 'next/server';
import { finishCook } from '@/lib/kitchen/cook';

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
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
