import type { Metadata } from 'next';
import '../training.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import TrainingNav from '@/components/training/TrainingNav';

/* THE BIKE SURFACE. Promoted out of /gym/conditioning?p=bike on 2026-08-27.
 *
 * This route already existed as an API before it had a page: POST /bike/api/ride shipped earlier the
 * same day so the write gate around it could be built and broken on purpose while somebody was
 * looking. Route handlers are not wrapped by a layout, so nothing here touches it.
 *
 * Nothing on the page is new writing. The Norwegian 4x4 protocol, the how-hard bands and all seven
 * cues are the same content/gym/conditioning.json this rendered from as a query parameter. */

export const metadata: Metadata = {
  /* THE OBJECT FORM, NOT A PLAIN STRING, and the difference is only visible on the CHILD routes.
   * A bare `title: 'Bike'` here satisfies the root template for this page and TERMINATES it for
   * everything under this segment, so /bike/log rendered with no site name on it while every
   * other page on the site reads "X . Silvio Neyra". Same fix, and same reason, as the comment in
   * src/app/kitchen/layout.tsx. */
  title: { default: 'Bike', template: '%s · Silvio Neyra' },
  description: 'My cycling: the Norwegian 4x4 on a gym upright, what heart rate to hold, and how to ride it.',
  /* NOINDEX, matching /gym and /health, which carry the same kind of thing: his own training and
   * his own numbers. /swim is currently indexable and this route did NOT copy that, deliberately.
   * Two sibling routes disagreeing about whether a training log belongs in a search index is worth
   * settling on purpose rather than propagating in the direction of more exposure by default. */
  robots: { index: false, follow: false },
};


export default function BikeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="training">
      <SiteHeader app="Bike" />
      <TrainingNav />
      {children}
      <SiteFooter standalone />
    </div>
  );
}
