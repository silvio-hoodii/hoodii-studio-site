import { redirect } from 'next/navigation';
import { signInWithPassword } from '@/lib/login-server';

export const dynamic = 'force-dynamic';

/* The gate has nothing to index. Added 2026-08-28 per 06-security P3-2: all four login pages
 * exported no robots metadata, and `robots.ts` deliberately does not Disallow them, so a crawler
 * needs the page itself to say it. */
export const metadata = { robots: { index: false, follow: false } };

/* The cookie-setting half of this lives in `src/lib/login-server.ts`, shared by all four login
 * pages, because four copies of a credential check is four places for the next one to drift. */
async function signIn(formData: FormData) {
  'use server';
  const to = String(formData.get('to') ?? '/kitchen');
  const outcome = await signInWithPassword(String(formData.get('pw') ?? ''));
  if (outcome === 'ok') redirect(to.startsWith('/kitchen') ? to : '/kitchen');
  redirect(`/kitchen/login?${outcome === 'not-configured' ? 'unconfigured' : 'bad'}=1&to=${encodeURIComponent(to)}`);
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; bad?: string; unconfigured?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="wrap">
      <div className="eyebrow">Kitchen</div>
      <h1>Locked</h1>
      <p className="lede">This one is just for you.</p>
      <form action={signIn} style={{ marginTop: 24 }}>
        <input type="password" name="pw" placeholder="Password" autoFocus autoComplete="current-password" />
        <input type="hidden" name="to" value={sp.to ?? '/kitchen'} />
        {sp.bad && <p className="changes" style={{ marginTop: 12 }}>Not that one.</p>}
        {/* An unset password or secret is not a wrong password, and saying "not that one" to a
            correct one is how an afternoon goes. */}
        {sp.unconfigured && (
          <p className="changes" style={{ marginTop: 12 }}>
            No password is set on this deployment, so nothing can be unlocked here.
          </p>
        )}
        <button className="primary" style={{ width: '100%', marginTop: 12 }} type="submit">
          Open
        </button>
      </form>
    </div>
  );
}
