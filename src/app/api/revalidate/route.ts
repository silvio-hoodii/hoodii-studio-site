import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

/* ON-DEMAND REGENERATION FOR THE PAGES THE LAPTOP WRITES TO, since 2026-09-27.
 *
 * The index and /music are cached and regenerate on a timer, and the timer was the Neon bill: the
 * database is billed awake in five-minute windows, so an hourly regeneration is 8% of every hour
 * whether or not anything changed. The writes that happen INSIDE this repo (a gym set, a kitchen
 * note, the music cron) call revalidatePath themselves now. Two pipelines write to Neon from the
 * laptop and cannot: the health mirror (HealthOS/sync/run-health-sync.ps1) and the Curio sync
 * (ReadLaterOS/run-readlater.ps1). They call this instead, through scripts/revalidate.mjs, and the
 * index regenerates inside the wake their own writes already paid for.
 *
 * Bearer CRON_SECRET, the same token the crons use. Anything without it is refused; a refused call
 * costs one function invocation and no database time. */
const ALLOWED = new Set(['/', '/music', '/curio', '/curio/archive', '/reading']);

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { paths?: unknown };
  const asked = Array.isArray(body.paths) ? body.paths.map(String) : ['/'];
  const paths = asked.filter((p) => ALLOWED.has(p));
  for (const p of paths) revalidatePath(p);
  return NextResponse.json({ ok: true, revalidated: paths });
}
