import { NextResponse } from 'next/server';
import { getToday } from '@/lib/curio/today';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Today's quiz cards and saved links. A GET that src/proxy.ts still gates: the saves are his private
 * reading pile, so under /curio/api a read needs the cookie too. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getToday()) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
