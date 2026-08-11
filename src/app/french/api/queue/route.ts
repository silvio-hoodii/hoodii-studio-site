import { NextResponse } from 'next/server';
import { getQueue } from '@/lib/french/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getQueue());
}
