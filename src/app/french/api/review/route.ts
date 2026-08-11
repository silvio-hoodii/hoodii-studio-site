import { NextResponse } from 'next/server';
import { reviewCard } from '@/lib/french/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.id || ![1, 2, 3, 4].includes(Number(b.rating))) {
      return NextResponse.json({ ok: false, error: 'id and rating (1-4) required' }, { status: 400 });
    }
    const result = await reviewCard(String(b.id), Number(b.rating));
    if (!result) return NextResponse.json({ ok: false, error: 'card not found' }, { status: 404 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
