import { NextResponse } from 'next/server';
import { setExamDate } from '@/lib/french/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const state = await setExamDate(b?.date ? String(b.date) : null);
    return NextResponse.json({ ok: true, examDate: state.exam_date });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
