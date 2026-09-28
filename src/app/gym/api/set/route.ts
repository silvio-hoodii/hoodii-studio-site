import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { appendOffPlanSet, upsertSet, SetConflict } from '@/lib/gym/db';

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
     * the counter at 1 and the upsert below REPLACED the set he had already logged. The index is now
     * the max for that (date, exercise_id) plus one, so an append never lands on a row that exists.
     *
     * THE OTHER DIRECTION WAS STILL OPEN until 2026-09-27, and this comment said it was closed. The
     * off-plan id is slugged from the typed name, so "Dead Bug" is the prescribed dead-bug id, and
     * on a day whose card had nothing logged the append took set 1. The card's own set 1 then went
     * through the upsert below and overwrote it, because the store compared only `fill_for` and both
     * rows had none. `upsertSet` now compares `off_plan` as well and refuses (409) a card write onto
     * an off-plan row with numbers in it. See the WHERE clause in db.ts.
     *
     * Handled before the `setIdx` check on purpose: an off-plan request carries no index, and the
     * server's is the only one used. */
    if (b?.offPlan) {
      if (!b?.date || !b?.exerciseId) {
        return NextResponse.json({ ok: false, error: 'date and exerciseId required' }, { status: 400 });
      }
      await appendOffPlanSet({
        date: String(b.date),
        day: b.day ?? null,
        dayTitle: b.dayTitle ?? null,
        exerciseId: String(b.exerciseId),
        exerciseName: b.exerciseName ?? null,
        weight: b.weight ?? null,
        reps: b.reps ?? null,
      });
      /* NO `setIdx` IN THE ANSWER, 2026-09-27. It was returned so the client could render the index it
       * wrote, and the client never read it: the off-plan list shows names and numbers, not indices. */
      revalidatePath('/');
      return NextResponse.json({ ok: true });
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
      /* A SET DONE IN ANOTHER LIFT'S REST, on a partner he chose at the rack.
       *
       * It goes through this UPSERT and not through `appendOffPlanSet` above, and the difference is
       * what the two record. That function APPENDS because an off-plan set is a thing he did and has
       * no edit affordance: the only correct operation is adding one more. A fill partner is a
       * different shape. It renders as three numbered set rows exactly like a prescribed exercise,
       * he types into them between sets of the lead lift, and he has to be able to fix a typo. So
       * the index is STRUCTURAL rather than counted, and the write has to be idempotent.
       *
       * The hazard that made appendOffPlanSet necessary (a client deriving an index from state that
       * is never rehydrated, then overwriting a row it had already written) is removed at the source
       * rather than guarded: `computeFillOptions` in src/lib/gym/fill.ts excludes every id the day
       * already prescribes, so a fill set and a prescribed set can never share a key space. */
      fillFor: typeof b.fillFor === 'string' && b.fillFor ? b.fillFor : null,
    });
    /* The index shows this session's state (next up, the streak, the day strip); it regenerates on
       the write that changed it rather than on the hour. */
    revalidatePath('/');
    return NextResponse.json({ ok: true });
  } catch (e) {
    /* A refused overwrite is the client's to stop retrying, so it gets its own status. See
       SetConflict in db.ts and the 409 branch of write() in GymClient. */
    if (e instanceof SetConflict) return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
