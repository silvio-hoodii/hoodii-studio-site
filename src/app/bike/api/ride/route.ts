import { NextResponse } from 'next/server';
import { addBikeRide } from '@/lib/bike/db';
import { today } from '@/lib/day';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One bike ride. THE FIRST ROUTE ON THIS SITE THAT EXISTS BEFORE ITS PAGE DOES.
 *
 *  /bike is Phase C of docs/TRAINING-REDESIGN-PLAN-2026-08-26.md and does not exist yet. This ships
 *  first on purpose: the two gates around a write route are built while somebody is looking at
 *  them, rather than remembered later. "Later" is how /gym/api/note reached production outside the
 *  probe harness on 2026-08-16, and the first automated test of the note box posted into his real
 *  training log. It was refused, but only because that browser happened to have no unlock cookie.
 *
 *  THREE THINGS HAD TO MOVE WITH THIS FILE, and each is a gate that reads like one only if the
 *  other half is there too:
 *    - src/proxy.ts, BOTH the write-gate prefix list and `config.matcher`. The proxy does not run
 *      at all on a path the matcher does not name, so the prefix on its own would have been a gate
 *      in appearance and nothing in fact. That is the half a plan forgets to name.
 *    - scripts/lint-probe-routes.mjs, which walks a list of API roots and fails the build on any
 *      POST route the probe harness does not stub. /bike/api is on that list now.
 *    - scripts/probe-gym.js WRITE_ROUTES, so a future test of a bike form cannot write a fake ride
 *      into the real store.
 *
 *  WHY THE APP OWNS THIS AT ALL. The watch gives a bike session a heart rate and nothing else:
 *  "no rpm, no power, no resistance" (src/lib/gym/session.ts:135). The resistance level is the one
 *  number the session is steered by, and content/gym/conditioning.json tells him to write down the
 *  level he finished each interval on "so next week starts from real numbers". Until this route
 *  there was nowhere for those numbers to go, which is the same hole the swim ladder had for a
 *  month before /swim/api/baseline.
 *
 *  Every refusal below says what is wrong in words he can act on. A generic 400 on a form he is
 *  filling in at the end of a ride is a dead end. */
export async function POST(req: Request) {
  try {
    const b = await req.json();

    /* The date, in Calgary. src/lib/day.ts exists because Vercel runs in UTC and a server that
       computes "today" from UTC disagrees with every stored date for the last six hours of every
       evening. */
    const date = String(b?.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    if (date > today()) {
      return NextResponse.json(
        { ok: false, error: 'that date is in the future. A ride you have not done yet is not a ride.' },
        { status: 400 },
      );
    }
    /* Nothing in this system predates the 2018 swim data, and a year typed as 2016 or 0226 is a
       typo rather than a backfill. The floor catches the shape of the mistake, not the intent. */
    if (date < '2018-01-01') {
      return NextResponse.json(
        { ok: false, error: 'that date is older than anything in this system. Check the year.' },
        { status: 400 },
      );
    }

    const minutes = Number(b?.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 300) {
      return NextResponse.json(
        { ok: false, error: 'minutes must be a whole number from 1 to 300. The full 4x4 session is 43.' },
        { status: 400 },
      );
    }

    /* THE LEVEL HE FINISHED EACH INTERVAL ON, in order, one per interval that actually happened.
       Four for the full session, three for the short version. Not padded, because a padded slot and
       a slot he left blank would be the same value meaning two different things. */
    const resistance = b?.resistance;
    if (!Array.isArray(resistance) || resistance.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'resistance must be a list: the level you finished each interval on, in order. The 4x4 has four.',
        },
        { status: 400 },
      );
    }
    if (resistance.length > 8) {
      return NextResponse.json(
        { ok: false, error: `${resistance.length} intervals is more than any session on the plan. Check the list.` },
        { status: 400 },
      );
    }
    for (let i = 0; i < resistance.length; i++) {
      const level = Number(resistance[i]);
      /* 1 to 20 is his bike's dial, answered 2026-08-27 and recorded in content/gym/equipment.json,
         which until that day said "No resistance scale recorded yet". A different machine means a
         different ceiling, and this line is where it changes. */
      if (!Number.isInteger(level) || level < 1 || level > 20) {
        return NextResponse.json(
          {
            ok: false,
            error: `interval ${i + 1} says ${JSON.stringify(resistance[i])}. Resistance is a whole number from 1 to 20, the levels on the dial.`,
          },
          { status: 400 },
        );
      }
    }

    /* Optional, and absent stays absent. Coercing a missing effort to a middle value would put a
       number he never gave next to three he did, and nothing downstream could tell them apart. */
    let effort: number | null = null;
    if (b?.effort !== undefined && b?.effort !== null && b?.effort !== '') {
      effort = Number(b.effort);
      if (!Number.isInteger(effort) || effort < 1 || effort > 10) {
        return NextResponse.json(
          { ok: false, error: 'effort is a whole number from 1 to 10, or leave it out entirely.' },
          { status: 400 },
        );
      }
    }

    await addBikeRide({
      date,
      minutes,
      resistance: resistance.map((n: unknown) => Number(n)),
      effort,
      note: b?.note ? String(b.note).slice(0, 500) : null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
