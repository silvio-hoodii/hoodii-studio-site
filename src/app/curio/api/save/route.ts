import { NextResponse } from 'next/server';
import { judgeSave } from '@/lib/curio/today';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Keep or drop one saved link, or null to undo. Gated by src/proxy.ts. The verdict reaches the note
 * in the vault on the next content/curio/sync-saves.mjs run. */
const VERDICTS = new Set(['keep', 'drop', null]);

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { id?: unknown; verdict?: unknown };
    const id = String(b?.id ?? '');
    const verdict = (b?.verdict ?? null) as 'keep' | 'drop' | null;
    if (!id || !VERDICTS.has(verdict)) {
      return NextResponse.json({ ok: false, error: 'id and verdict (keep, drop or null) required' }, { status: 400 });
    }
    if (!(await judgeSave(id, verdict))) return NextResponse.json({ ok: false, error: 'no such save' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
