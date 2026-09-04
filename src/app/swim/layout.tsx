import type { Metadata } from 'next';
import '../training.css';
import '../charts.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import TrainingNav from '@/components/training/TrainingNav';

/* THE SWIM SURFACE. Rebuilt 2026-08-26.
 *
 * This route was the Calgary lane-swim timetable until today: six scrapers on the laptop, a nightly
 * push into Neon, and a page answering "which pool has lane swim open right now". That is gone, by
 * his decision and knowing that nothing else anywhere produces that answer. What lives here now is
 * his own swimming, promoted out of /gym/conditioning?p=swim where it sat three taps deep.
 *
 * TWO THINGS ABOUT THE STYLING, both deliberate.
 *
 * `training.css` was `gym/gym.css` until today. The tracker needs almost all 34 KB of it, and a file
 * named for one route styling two is the drift this migration exists to remove, so it was renamed
 * and its root class went `.gym` -> `.training`. /gym imports the same file.
 *
 * `swim.css` is DELETED, not emptied. It held nothing but schedule styling (the pool rows, the
 * coverage list, the pace clock) and every one of those rules died with the timetable. An empty
 * stylesheet kept "for deltas" is a file the next reader has to open to discover says nothing. When
 * swim genuinely needs a rule /gym does not have, that is when the file comes back. */

export const metadata: Metadata = {
  /* THE OBJECT FORM, NOT A PLAIN STRING, and the difference is only visible on the CHILD routes.
   * A bare `title: 'Swim'` here satisfies the root template for this page and TERMINATES it for
   * everything under this segment, so /swim/deep and /swim/records rendered with no site name on it while every
   * other page on the site reads "X . Silvio Neyra". Same fix, and same reason, as the comment in
   * src/app/kitchen/layout.tsx. */
  title: { default: 'Swim', template: '%s · Silvio Neyra' },
  description:
    'My swimming: where I am against the tier ladder, the continuity plan, and how to swim it.',
  alternates: { canonical: '/swim' },
};


export default function SwimLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="training">
      <SiteHeader app="Swim" />
      <TrainingNav />
      {children}
      <SiteFooter standalone />
    </div>
  );
}
