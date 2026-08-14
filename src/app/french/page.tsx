import { getActivity, getSummary } from '@/lib/french/db';
import FrenchClient from './FrenchClient';

export const dynamic = 'force-dynamic';

export default async function FrenchPage() {
  const [summary, activity] = await Promise.all([getSummary(), getActivity()]);

  return (
    <div className="wrap">
      <FrenchClient initialSummary={summary} initialActivity={activity} />
    </div>
  );
}
