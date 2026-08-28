import type { Metadata, Viewport } from 'next';
import './french.css';
import SiteHeader from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'French',
  description: 'A review queue for the TCF, built only from pages of three physical books I have actually sat down and worked.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',   // lint-tokens-allow: a viewport export is read by the browser chrome, not by CSS
};

export default function FrenchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="french">
      <SiteHeader app="French" />
      {children}
    </div>
  );
}
