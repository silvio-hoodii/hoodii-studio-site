import type { Metadata, Viewport } from 'next';
import './french.css';

export const metadata: Metadata = {
  title: 'French',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function FrenchLayout({ children }: { children: React.ReactNode }) {
  return <div className="french">{children}</div>;
}
