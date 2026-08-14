import type { Metadata, Viewport } from 'next';
import './health.css';
import SiteHeader from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Health',
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
    <div className="health">
      <SiteHeader app="Health" />
      {children}
    </div>
  );
}
