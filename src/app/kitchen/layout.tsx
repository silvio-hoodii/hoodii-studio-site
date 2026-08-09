import type { Metadata, Viewport } from 'next';
import './kitchen.css';

export const metadata: Metadata = {
  title: 'Kitchen',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#faf6f0',
};

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return <div className="kos">{children}</div>;
}
