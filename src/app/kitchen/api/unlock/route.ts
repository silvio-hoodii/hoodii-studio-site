import { signInWithPassword } from '@/lib/login-server';

/* The inline unlock: answers JSON to a fetch from src/components/SaveBlocked.tsx, so a locked device
 * types the password where the write failed instead of being sent to /login. Shared by every
 * surface's SaveBlocked. Since 2026-09-27 the check, the delay and the cookie are
 * signInWithPassword's, the same function /login uses, so there is one copy of the credential check
 * rather than two that happened to agree. */
export async function POST(req: Request) {
  let pw = '';
  try {
    pw = String(((await req.json()) as { pw?: unknown }).pw ?? '');
  } catch {
    return Response.json({ ok: false, error: 'bad-body' }, { status: 400 });
  }

  const outcome = await signInWithPassword(pw);
  if (outcome === 'not-configured') {
    return Response.json({ ok: false, error: 'not-configured' }, { status: 500 });
  }
  if (outcome === 'wrong') {
    return Response.json({ ok: false, error: 'wrong' }, { status: 401 });
  }
  return Response.json({ ok: true });
}
