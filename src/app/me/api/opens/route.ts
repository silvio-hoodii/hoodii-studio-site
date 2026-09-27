import { NextResponse } from 'next/server';
import { getOpens } from '@/lib/usage/opens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* His own app opens, last 30 days. Gated by src/proxy.ts like every /me/api route. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, rows: await getOpens(30) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
