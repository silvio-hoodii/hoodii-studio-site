import type { Metadata } from 'next';
import '../training.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import TrainingNav from '@/components/training/TrainingNav';

/* THE RUN SURFACE. Promoted out of /gym/conditioning?p=run on 2026-08-27.
 *
 * Nothing here is new writing. The plan, the belt settings, the week table and every cue are the
 * same content/gym/conditioning.json this rendered from when it was a query parameter, drawn by the
 * same components. What changed is that it is a route, so it has a name, a bookmark and a place in
 * the nav rather than being a string somebody had to know.
 *
 * Same styling as /gym and /swim, from the same file. training.css was gym.css until 2026-08-26,
 * renamed when a second route needed it; this is the third. */

export const metadata: Metadata = {
  /* THE OBJECT FORM, NOT A PLAIN STRING, and the difference is only visible on the CHILD routes.
   * A bare `title: 'Run'` here satisfies the root template for this page and TERMINATES it for
   * everything under this segment, so /run/log rendered with no site name on it while every
   * other page on the site reads "X . Silvio Neyra". Same fix, and same reason, as the comment in
   * src/app/kitchen/layout.tsx. */
  title: { default: 'Run', template: '%s · Silvio Neyra' },
  description: 'My running: the ten-week walk-to-run build, what the belt should read, and how to run it.',
  /* NOINDEX, matching /gym and /health, which carry the same kind of thing: his own training and
   * his own numbers. /swim is currently indexable and this route did NOT copy that, deliberately.
   * Two sibling routes disagreeing about whether a training log belongs in a search index is worth
   * settling on purpose rather than propagating in the direction of more exposure by default. */
  robots: { index: false, follow: false },
};


export default function RunLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="training">
      <SiteHeader app="Run" />
      <TrainingNav />
      {children}
      <SiteFooter standalone />
    </div>
  );
}
