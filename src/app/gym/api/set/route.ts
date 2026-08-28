import { NextResponse } from 'next/server';
import { appendOffPlanSet, upsertSet } from '@/lib/gym/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Autosave for one set. Fired on every field change from the client, same as gym.html's postSet:
 *  the client queues on failure and retries, this route just has to be idempotent (it is, via the
 *  ON CONFLICT upsert in db.ts). */
export async function POST(req: Request) {
  try {
    const b = await req.json();

    /* OFF-PLAN SETS ARE APPENDED AND THE SERVER PICKS THE INDEX. Added 2026-08-28 for 10-gym P0-1.
     *
     * The client used to count them in React state that is never rehydrated, so a reload restarted
     * the counter at 1 and the upsert below REPLACED the set he had already logged. It could also
     * overwrite a PRESCRIBED set, because the off-plan datalist offers every catalogue name including
     * exercises prescribed that same day.
     *
     * Handled before the `setIdx` check on purpose: an off-plan request must not carry one, and a
     * client that sends one is a client that has gone back to counting. See appendOffPlanSet. */
    if (b?.offPlan) {
      if (!b?.date || !b?.exerciseId) {
        return NextResponse.json({ ok: false, error: 'date and exerciseId required' }, { status: 400 });
      }
      const setIdx = await appendOffPlanSet({
        date: String(b.date),
        day: b.day ?? null,
        dayTitle: b.dayTitle ?? null,
        exerciseId: String(b.exerciseId),
        exerciseName: b.exerciseName ?? null,
        weight: b.weight ?? null,
        reps: b.reps ?? null,
      });
      /* The index comes back so the client can render what it actually wrote rather than what it
       * guessed, which is the whole point of moving the decision here. */
      return NextResponse.json({ ok: true, setIdx });
    }

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
