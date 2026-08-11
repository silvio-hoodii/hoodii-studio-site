import { NextResponse } from 'next/server';
import { getActivity } from '@/lib/french/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getActivity());
}
