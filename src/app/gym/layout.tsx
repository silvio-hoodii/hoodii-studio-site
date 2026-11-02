import type { Metadata } from 'next';
import '../training.css';
import SiteHeader from '@/components/SiteHeader';

export const metadata: Metadata = {
  /* THE OBJECT FORM, NOT A PLAIN STRING, and the difference is only visible on the CHILD routes.
   * A bare `title: 'Gym'` here satisfies the root template for this page and TERMINATES it for
   * everything under this segment, so /gym/log rendered with no site name on it while every
   * other page on the site reads "X . Silvio Neyra". Same fix, and same reason, as the comment in
   * src/app/kitchen/layout.tsx. */
  title: { default: 'Gym', template: '%s · Silvio Neyra' },
  description: 'My lifting log, filled in between sets.',
  robots: { index: false, follow: false },
};


export default function GymLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="training">
      <SiteHeader />
      {children}
    </div>
  );
}
