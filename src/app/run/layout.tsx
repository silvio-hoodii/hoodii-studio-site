import type { Metadata, Viewport } from 'next';
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
  title: 'Run',
  description: 'My running: the ten-week walk-to-run build, what the belt should read, and how to run it.',
  /* NOINDEX, matching /gym and /health, which carry the same kind of thing: his own training and
   * his own numbers. /swim is currently indexable and this route did NOT copy that, deliberately.
   * Two sibling routes disagreeing about whether a training log belongs in a search index is worth
   * settling on purpose rather than propagating in the direction of more exposure by default. */
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',   // lint-tokens-allow: a viewport export is read by the browser chrome, not by CSS
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
