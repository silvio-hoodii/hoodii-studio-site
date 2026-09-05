import type { Metadata } from 'next';
import './kitchen.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

export const metadata: Metadata = {
  /* A template as well as a name: the root layout's template only reaches the segments directly
   * under it, so without this every dish page resolved to a bare dish name with no owner on it. */
  title: { default: 'Kitchen', template: '%s · Silvio Neyra' },
  description: 'The dishes I have decided to cook, each with its recipe, its shopping list and my notes.',
  robots: { index: false, follow: false },
};

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kos">
      <SiteHeader app="Kitchen" />
      {children}
      <SiteFooter standalone />
    </div>
  );
}
