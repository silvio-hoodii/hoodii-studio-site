import { getActivity, getSummary } from '@/lib/french/db';
import { isAuthed } from '@/lib/auth-server';
import { today } from '@/lib/day';
import FrenchClient from './FrenchClient';

export const dynamic = 'force-dynamic';

export default async function FrenchPage() {
  /* `canEdit` is whether this device may actually change anything, decided here rather than in the
   * client.
   *
   * The page is public and stays public. What a stranger was getting was an app with zero cards and
   * two controls that could only fail for them: "edit" beside the exam date and "Log a section I
   * finished", both of which 401 at the proxy. Showing someone a button that cannot work for them
   * is worse than showing them nothing, and on the emptiest page on the site it was most of what
   * there was to look at.
   *
   * This is presentation only. The gate that matters is still proxy.ts, and hiding a control has
   * never been security: an unlocked device gets the controls back, and a locked one that finds
   * them anyway still gets refused by the server and told why.
   *
   * It read `jar.get('kos')?.value === process.env.KITCHEN_SESSION_SECRET` until 2026-08-28: a THIRD
   * copy of the fail-open comparison, which the 2026-08-26 security audit did not find and which
   * `scripts/lint-auth.mjs` found on its first run. With the secret unset, every anonymous visitor
   * saw the edit controls, which is this block's own failure mode reached from the other side. */
  const [summary, activity, canEdit] = await Promise.all([getSummary(), getActivity(), isAuthed()]);

  return (
    <div className="wrap">
      <FrenchClient
        initialSummary={summary}
        initialActivity={activity}
        canEdit={canEdit}
        serverToday={today()}
      />
    </div>
  );
}
