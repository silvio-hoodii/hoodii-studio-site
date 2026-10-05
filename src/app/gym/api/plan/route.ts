import { today } from '@/lib/day';
import { NextResponse } from 'next/server';
import { getExerciseHistories } from '@/lib/gym/db';
import { suggest, type ExerciseType } from '@/lib/gym/progression';
import { ladderFor, hasFixedReps, isAssisted, incrementFor, firstWeightFor } from '@/lib/gym/ladder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PlanExerciseIn {
  id: string;
  targetReps?: number;
  /** The unit `targetReps` threw away. LISTED HERE DELIBERATELY, which is the whole point of the two
   *  notes below: a field the client sends and this interface omits is dropped in the middle with
   *  nothing to notice, and that has now happened twice. */
  repSuffix?: string;
  type?: ExerciseType;
  increment?: number;
  /** `rangeWidth` WAS MISSING HERE AND THE WHOLE 2026-08-22 LADDER FIX WAS DEAD BECAUSE OF IT.
   *
   *  On 2026-08-22 eight of fifteen lifts were found to have a rep range whose top could not earn
   *  the next weight, which is why the overhead press was flat all year: at 65 lb, three sets of ten
   *  banks an estimated max of 86.7 and the jump to 70 demands 88.7. The fix was a per-exercise
   *  `rangeWidth` in program.json. GymClient sends it, `PlanInput` in progression.ts declares it,
   *  `suggest` reads it, and THIS interface did not list it, so it was dropped in the middle and
   *  every suggestion has used the default of 2 ever since.
   *
   *  Found 2026-08-27 as P1-1 in docs/audits/2026-08-26/03-gym.md and confirmed by reading the live
   *  API. It is the reason `scripts/check-ladder.mjs` still reports nine findings against a fix that
   *  shipped five days ago: nothing was wrong with the fix, it never arrived. A field silently
   *  dropped by a type is not a check anyone can run, which is why check-ladder exists. */
  rangeWidth?: number;
  /* NO `assistance` ANY MORE, 2026-09-27. It crossed the wire from the client, which read it off the
   * slot, and no slot or alt in the week carries it: the assisted pull-up arrived here as a normal
   * lift and progressed UPWARD, more help every session. It is derived below from the catalogue, the
   * way the ladder is, so there is no field left to drop. */
}

/** Last-session + a suggested target for each of today's prescribed lifts. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    /* `today()` is Calgary. The old UTC slice made an evening request with no date fall through
       to TOMORROW, and the whole point of this route is to look up the last session before a
       given day. */
    const date = b?.date || today();
    const exercises: PlanExerciseIn[] = Array.isArray(b?.exercises) ? b.exercises : [];

    /* ONE QUERY FOR THE WHOLE DAY, since 2026-09-27. This used to read each exercise's last session
       and then its recent sessions separately, about 110 queries per load, and the first was always
       the head of the second. One definition of the history now serves both, so the stall window,
       the trend line and the suggestion all see the same measured sets and none of the recalled
       ones (see HISTORY in src/lib/gym/db.ts).

       Eight sessions, not three. Three is all the stall detector needs, but the client draws a trend
       from the same rows and three points is not a trend. `suggest` still looks at the window it
       always did, so nothing about the progression logic changes with the number here. */
    const histories = await getExerciseHistories(exercises.map((ex) => ex.id), date, 8);

    const out = exercises.map((ex) => {
      const recent = histories.get(ex.id) ?? [];
      const last = recent[0] ?? null;
      const suggestion = suggest(last, {
        type: ex.type || 'weighted',
        targetReps: ex.targetReps,
        /* The slot's own `increment` when program.json sets one; otherwise the implement's step
           (2.5 on a cable stack, the measured step on a counterweight machine), derived here for the
           same reason as the ladder below. Undefined falls through to the engine default of 5. */
        increment: ex.increment ?? incrementFor(ex.id),
        rangeWidth: ex.rangeWidth,
        assistance: isAssisted(ex.id),
        /* DERIVED HERE, NOT SENT. Twice now a field the client sent, `PlanInput` declared and
           this interface omitted was dropped in the middle with nothing to notice: `rangeWidth`
           sat dead for five days and `assistance` was added in the same commit that documented
           the hazard. The rack is a fact about the building, identical for every caller, and
           `movements.json` already knows which lifts are dumbbells. So the seam that keeps
           failing is removed rather than widened: nothing about the ladder crosses the wire. */
        ladder: ladderFor(ex.id),
        fixedReps: hasFixedReps(ex.id),
        firstWeight: firstWeightFor(ex.id),
        repSuffix: ex.repSuffix,
        today: date,
        recent: recent.slice(0, 3),
      });
      return { id: ex.id, last, suggestion, recent };
    });

    return NextResponse.json({ ok: true, date, exercises: out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
