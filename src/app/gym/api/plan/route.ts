import { NextResponse } from 'next/server';
import { getLastSession, getRecentSessions } from '@/lib/gym/db';
import { suggest, type ExerciseType } from '@/lib/gym/progression';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PlanExerciseIn {
  id: string;
  targetReps?: number;
  type?: ExerciseType;
  increment?: number;
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
