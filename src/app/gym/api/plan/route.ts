import { NextResponse } from 'next/server';
import { getLastSession, getRecentSessions } from '@/lib/gym/db';
import { suggest, type ExerciseType } from '@/lib/gym/progression';
import { ladderFor, hasFixedReps } from '@/lib/gym/ladder';

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
  /** Same hazard as `rangeWidth` above, so it is listed here in the same commit that introduces it.
   *  Counterweight rather than load: the assisted pull-up gets HARDER as this number falls, and the
   *  engine added an increment until 2026-08-28 while the card's own cue told him to take assistance
   *  off. A field the client sends, `PlanInput` declares and this interface omits is dropped in the
   *  middle with nothing to notice, which is exactly how the ladder fix sat dead for five days. */
  assistance?: boolean;
}

/** Last-session + a suggested target for each of today's prescribed lifts. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const date = b?.date || new Date().toISOString().slice(0, 10);
    const exercises: PlanExerciseIn[] = Array.isArray(b?.exercises) ? b.exercises : [];

    const out = await Promise.all(
      exercises.map(async (ex) => {
        const last = await getLastSession(ex.id, date);
        /* Eight, not three. Three is all the stall detector needs and it is what this asked for
           until now, but the client draws a trend from the same rows and three points is not a
           trend. `suggest` still looks at the window it always did, so nothing about the
           progression logic changes with the number here. */
        const recent = await getRecentSessions(ex.id, date, 8);
        const suggestion = suggest(last, {
          type: ex.type || 'weighted',
          targetReps: ex.targetReps,
          increment: ex.increment,
          rangeWidth: ex.rangeWidth,
          assistance: ex.assistance,
          /* DERIVED HERE, NOT SENT. Twice now a field the client sent, `PlanInput` declared and
             this interface omitted was dropped in the middle with nothing to notice: `rangeWidth`
             sat dead for five days and `assistance` was added in the same commit that documented
             the hazard. The rack is a fact about the building, identical for every caller, and
             `movements.json` already knows which lifts are dumbbells. So the seam that keeps
             failing is removed rather than widened: nothing about the ladder crosses the wire. */
          ladder: ladderFor(ex.id),
          fixedReps: hasFixedReps(ex.id),
          repSuffix: ex.repSuffix,
          today: date,
          recent: recent.slice(0, 3),
        });
        return { id: ex.id, last, suggestion, recent };
      }),
    );

    return NextResponse.json({ ok: true, date, exercises: out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
