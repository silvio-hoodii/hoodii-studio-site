import { NextResponse } from 'next/server';
import { addSwimBaseline } from '@/lib/gym/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The calibration swim's distance. Gated by src/proxy.ts with every other POST under /gym/api, and
 *  registered in WRITE_ROUTES in scripts/probe-gym.js, which the build enforces.
 *
 *  This route exists because the swim plan had a hole in the middle of it for a month. Every rung of
 *  the ladder in conditioning.json reads "your number plus 100 m", and there was nowhere to put the
 *  number. He said so: "If there's a number that I need here, why is there not a slot for me to
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
