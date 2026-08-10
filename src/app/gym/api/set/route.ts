import { NextResponse } from 'next/server';
import { upsertSet } from '@/lib/gym/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Autosave for one set. Fired on every field change from the client, same as gym.html's postSet —
 *  the client queues on failure and retries, this route just has to be idempotent (it is, via the
 *  ON CONFLICT upsert in db.ts). */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b?.date || !b?.exerciseId || b?.setIdx == null) {
      return NextResponse.json({ ok: false, error: 'date, exerciseId, setIdx required' }, { status: 400 });
    }
    await upsertSet({
      date: String(b.date),
      day: b.day ?? null,
      dayTitle: b.dayTitle ?? null,
      exerciseId: String(b.exerciseId),
      exerciseName: b.exerciseName ?? null,
      setIdx: Number(b.setIdx),
      weight: b.weight,
      reps: b.reps,
      rir: b.rir,
      done: !!b.done,
      swappedFrom: b.swappedFrom ?? null,
      suggW: b.suggW,
      suggR: b.suggR,
      estimated: b.estimated ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
