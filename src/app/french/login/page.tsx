import { redirect } from 'next/navigation';
import { signInWithPassword } from '@/lib/login-server';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

// Reuses the same cookie/secret as /kitchen, /gym and /health ('kos', KITCHEN_SESSION_SECRET) on
// purpose: one login for the whole hub, not a second password to remember. See lib/login-server.ts.
async function signIn(formData: FormData) {
  'use server';
  const to = String(formData.get('to') ?? '/french');
  const outcome = await signInWithPassword(String(formData.get('pw') ?? ''));
  if (outcome === 'ok') redirect(to.startsWith('/french') ? to : '/french');
  redirect(`/french/login?${outcome === 'not-configured' ? 'unconfigured' : 'bad'}=1&to=${encodeURIComponent(to)}`);
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; bad?: string; unconfigured?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="wrap">
      <div className="eyebrow">French</div>
      <h1>Locked</h1>
      <p className="lede">This one is just for you. Same password as the kitchen.</p>
      <form action={signIn} style={{ marginTop: 24 }}>
        <input type="password" name="pw" placeholder="Password" autoFocus autoComplete="current-password" />
        <input type="hidden" name="to" value={sp.to ?? '/french'} />
        {sp.bad && <p className="changes" style={{ marginTop: 12 }}>Not that one.</p>}
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
