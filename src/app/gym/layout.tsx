import type { Metadata, Viewport } from 'next';
import '../training.css';
import SiteHeader from '@/components/SiteHeader';
import TrainingNav from '@/components/training/TrainingNav';

export const metadata: Metadata = {
  title: 'Gym',
  description: 'My lifting log. An upper/lower split on a rolling cycle, filled in between sets.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function GymLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="training">
      <SiteHeader app="Gym" />
      {/* In the LAYOUT, not the pages, for the same reason SiteHeader is: a route added later gets
        * an entrance whether or not anyone remembers to add one.
        *
        * WAS GymNav, two chips reading Workout and The week. That component existed to make a
        * second gym page discoverable and there is no second gym page: /gym/conditioning was
        * redistributed and deleted on 2026-08-27. The row is five routes now and it is the same row
        * on all five. */}
      <TrainingNav />
      {children}
    </div>
  );
}
