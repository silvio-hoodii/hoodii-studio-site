import './swim.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

/* Carries the header, the footer and the stylesheet, the way /curio and /music do. In the layout
 * rather than the page so a second route under /swim gets both without anyone remembering. */
export default function SwimLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader app="Swim" />
      {children}
      <SiteFooter standalone />
    </>
  );
}
