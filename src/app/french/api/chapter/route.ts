import { NextResponse } from 'next/server';
import { logChapter } from '@/lib/french/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.book || !b?.chapter) {
      return NextResponse.json({ ok: false, error: 'book and chapter required' }, { status: 400 });
    }
    await logChapter({
      book: String(b.book),
      chapter: String(b.chapter),
      title: b.title ?? null,
      pages: b.pages ?? null,
      cards_made: Number(b.cards_made ?? 0),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
