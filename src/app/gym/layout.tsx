import type { Metadata, Viewport } from 'next';
import './gym.css';
import SiteHeader from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Gym',
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
      {children}
    </div>
  );
}
