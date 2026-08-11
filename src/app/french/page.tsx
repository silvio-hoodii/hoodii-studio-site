import Link from 'next/link';
import { getActivity, getSummary } from '@/lib/french/db';
import FrenchClient from './FrenchClient';

export const dynamic = 'force-dynamic';

export default async function FrenchPage() {
  const [summary, activity] = await Promise.all([getSummary(), getActivity()]);

  return (
    <div className="wrap">
      <Link href="/" className="eyebrow">← Silvio Neyra</Link>
      <FrenchClient initialSummary={summary} initialActivity={activity} />
    </div>
  );
}
