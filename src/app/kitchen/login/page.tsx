import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function signIn(formData: FormData) {
  'use server';
  const pw = String(formData.get('pw') ?? '');
  const to = String(formData.get('to') ?? '/kitchen');
  if (pw && pw === process.env.KITCHEN_PASSWORD) {
    (await cookies()).set('kos', process.env.KITCHEN_SESSION_SECRET!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    redirect(to.startsWith('/kitchen') ? to : '/kitchen');
  }
  redirect(`/kitchen/login?bad=1&to=${encodeURIComponent(to)}`);
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; bad?: string }>;
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
        <button className="primary" style={{ width: '100%', marginTop: 12 }} type="submit">
          Open
        </button>
      </form>
    </div>
  );
}
