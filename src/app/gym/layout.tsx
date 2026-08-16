import type { Metadata, Viewport } from 'next';
import './gym.css';
import SiteHeader from '@/components/SiteHeader';
import GymNav from './GymNav';

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
    <div className="gym">
      <SiteHeader app="Gym" />
      {/* In the LAYOUT, not the pages, for the same reason SiteHeader is: a third gym page gets an
        * entrance whether or not anyone remembers to add one. The login page is deliberately the
        * one exception and it has its own layout. */}
      <GymNav />
      {children}
    </div>
  );
}
