import { NextResponse, type NextRequest } from 'next/server';
import { syncMusic } from '@/lib/music/sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* The cron target. vercel.json points three daily schedules at this path.
 *
 * Note this route is NOT covered by src/proxy.ts, whose matcher only spans /kitchen, /gym, /health
 * and /french. So it carries its own authorisation and cannot lean on the `kos` cookie.
 *
 * Vercel attaches `Authorization: Bearer $CRON_SECRET` to cron invocations whenever that env var is
 * set. We REQUIRE it rather than treating it as optional hardening: without it this is a public URL
 * that makes four Spotify calls per hit, which is a free rate-limit exhaustion for anyone who finds
 * it. Refusing loudly when the secret is missing is better than a quietly open endpoint — an
 * unauthenticated 500 in the Vercel log is visible, an open door is not.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not set, refusing to run an unauthenticated sync' },
      { status: 500 },
    );
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const result = await syncMusic();

  /* A failed sync returns 500 on purpose. Vercel surfaces failing crons, and the entire point of
   * this build is that a dead Spotify token must not look like silence. */
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
