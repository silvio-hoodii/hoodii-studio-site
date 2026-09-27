import { NextResponse } from 'next/server';
import { gradeCard, itemExists } from '@/lib/curio/today';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* One quiz card graded: knew it, or did not. Gated by src/proxy.ts. */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { id?: unknown; knew?: unknown };
    const id = String(b?.id ?? '');
    if (!id || typeof b?.knew !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'id and knew required' }, { status: 400 });
    }
    /* A review row for an id the ledger does not carry would never be dealt, so refuse it rather
       than store it. */
    if (!(await itemExists(id))) return NextResponse.json({ ok: false, error: 'no such card' }, { status: 404 });
    await gradeCard(id, b.knew);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
