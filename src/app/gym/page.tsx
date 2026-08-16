import Link from 'next/link';
import { loadProgram, loadWarmups, loadCooldowns, loadRirGuide } from '@/lib/gym/program';
import { computeNextUp } from '@/lib/gym/cycle';
import { today } from '@/lib/day';
import GymClient from './GymClient';

export const dynamic = 'force-dynamic';

export default async function GymHome() {
  const [program, warmups, cooldowns, rirGuide, nextUp] = await Promise.all([
    loadProgram(),
    loadWarmups(),
    loadCooldowns(),
    loadRirGuide(),
    computeNextUp(today()),
  ]);

  return (
    <div className="wrap">
      <h1>Gym</h1>
      <p className="lede">
        Upper/lower split, logged between sets. Every main pattern twice a week since 2026-08-16,
        heavy on one day and light on the other.
      </p>
      <p className="lede">
        Run, bike and swim live at <Link href="/gym/conditioning">conditioning</Link>.
      </p>
      <GymClient program={program} warmups={warmups} cooldowns={cooldowns} rirGuide={rirGuide} nextUp={nextUp} />
    </div>
  );
}
