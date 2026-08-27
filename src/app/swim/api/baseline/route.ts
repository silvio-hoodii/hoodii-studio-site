import { NextResponse } from 'next/server';
import { addSwimBaseline } from '@/lib/swim/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The calibration swim's distance. Was /gym/api/swim-baseline until 2026-08-26.
 *
 *  MOVING THIS ROUTE MOVED IT OUT OF TWO GATES, and both were extended in the same commit rather
 *  than afterwards, because "afterwards" is how /gym/api/note shipped unstubbed on 2026-08-16 and
 *  the first probe posted into the real training log:
 *
 *    - scripts/lint-probe-routes.mjs hardcoded src/app/gym/api. It now walks a LIST of API roots,
 *      src/app/swim/api included, so a POST route here still fails the build unless the probe
 *      harness stubs it.
 *    - src/proxy.ts gated writes by path prefix AND never matched /swim at all. Both the prefix
 *      list and `config.matcher` now carry /swim/api. The prefix alone would have done nothing:
 *      the proxy does not run on a path the matcher does not name, which is the failure mode this
 *      note exists to stop somebody rediscovering.
 *
 *  This route exists because the swim plan had a hole in the middle of it for a month. Every rung of
 *  the ladder in content/swim/plan.json reads "your number plus 100 m", and there was nowhere to put
 *  the number. He said so: "If there's a number that I need here, why is there not a slot for me to
 *  actually input a number?"
 *
 *  `noBuoy` is not a nicety. The entire reason the number was unknown is that the lap data shows
 *  600 m unbroken and he remembered 200 m, and the difference is almost certainly a pull buoy that
 *  nothing in the watch export records. A baseline swum with one is a different number, and letting
 *  it overwrite the other silently would rebuild the exact ambiguity this swim exists to settle. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const metres = Number(b?.metres);
    if (!Number.isFinite(metres) || metres <= 0) {
      return NextResponse.json({ ok: false, error: 'metres must be a positive number' }, { status: 400 });
    }
    /* A 25 m pool cannot produce a distance that is not a multiple of 25, and the plan says to round
       DOWN to the nearest 25 at the wall. A typo of 3000 instead of 300 would move every rung of the
       ladder, so the ceiling is the longest thing he has ever swum plus room. */
    if (metres % 25 !== 0) {
      return NextResponse.json({ ok: false, error: 'round down to the nearest 25 m: that is what a length is' }, { status: 400 });
    }
    if (metres > 6000) {
      return NextResponse.json({ ok: false, error: 'that is further than you have ever swum. Check the number.' }, { status: 400 });
    }
    const measuredOn = String(b?.measuredOn ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredOn)) {
      return NextResponse.json({ ok: false, error: 'measuredOn must be YYYY-MM-DD' }, { status: 400 });
    }
    await addSwimBaseline({
      measuredOn,
      metres,
      noBuoy: b?.noBuoy !== false,
      note: b?.note ? String(b.note).slice(0, 500) : null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
