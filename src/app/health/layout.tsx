import type { Metadata, Viewport } from 'next';
import '../charts.css';
import './health.css';
import SiteHeader from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Health',
  description: 'Weight and lifting attendance, read from the watch export. Nothing here is typed by hand.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return (
    /* `measure-data`: this surface is charts and a 30-cell strip, not prose. See globals.css. */
    <div className="health measure-data">
      <SiteHeader app="Health" />
      {children}
    </div>
  );
}
