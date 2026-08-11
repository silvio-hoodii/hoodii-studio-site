import { NextResponse } from 'next/server';
import { getSummary } from '@/lib/french/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getSummary());
}
