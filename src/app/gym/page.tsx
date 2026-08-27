import { loadProgram, loadWarmups, loadCooldowns, loadRirGuide } from '@/lib/gym/program';
import { computeNextUp } from '@/lib/gym/cycle';
import { getTrainingStreak } from '@/lib/gym/week';
import { today } from '@/lib/day';
import GymClient from './GymClient';

export const dynamic = 'force-dynamic';

export default async function GymHome() {
  /* `streak` comes from week.ts rather than from computeNextUp, as of 2026-08-26. It used to be a
     field on nextUp counted off this app's own log, while a second, watch-based count of the same
     name sat one click away on the conditioning page. There is one now, and it sees both. */
  const [program, warmups, cooldowns, rirGuide, nextUp, streak] = await Promise.all([
    loadProgram(),
    loadWarmups(),
    loadCooldowns(),
    loadRirGuide(),
    computeNextUp(today()),
    getTrainingStreak(),
  ]);

  return (
    <div className="wrap">
      <h1>Gym</h1>
      <p className="lede">
        Upper/lower split, logged between sets. Every main pattern twice a week since 2026-08-16,
        heavy on one day and light on the other. Swim, run and bike have their own pages now, in
        the row above.
      </p>
      <GymClient program={program} warmups={warmups} cooldowns={cooldowns} rirGuide={rirGuide} nextUp={nextUp} streak={streak} />
    </div>
  );
}
