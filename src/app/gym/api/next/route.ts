import { NextResponse } from 'next/server';
import { computeNextUp } from '@/lib/gym/cycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const today = b?.date || new Date().toISOString().slice(0, 10);
    const result = await computeNextUp(today);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
