import { cookies } from 'next/headers';
import { getActivity, getSummary } from '@/lib/french/db';
import FrenchClient from './FrenchClient';

export const dynamic = 'force-dynamic';

export default async function FrenchPage() {
  const [summary, activity, jar] = await Promise.all([getSummary(), getActivity(), cookies()]);

  /* Whether this device may actually change anything, decided here rather than in the client.
   *
   * The page is public and stays public. What a stranger was getting was an app with zero cards and
   * two controls that could only fail for them: "edit" beside the exam date and "Log a section I
   * finished", both of which 401 at the proxy. Showing someone a button that cannot work for them
   * is worse than showing them nothing, and on the emptiest page on the site it was most of what
   * there was to look at.
   *
   * This is presentation only. The gate that matters is still proxy.ts, and hiding a control has
   * never been security: an unlocked device gets the controls back, and a locked one that finds
   * them anyway still gets refused by the server and told why. */
  const canEdit = jar.get('kos')?.value === process.env.KITCHEN_SESSION_SECRET;

  return (
    <div className="wrap">
      <FrenchClient initialSummary={summary} initialActivity={activity} canEdit={canEdit} />
    </div>
  );
}
