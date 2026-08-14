import './curio.css';
import SiteHeader from '@/components/SiteHeader';

/* Carries the site header and the stylesheet; /curio has no child routes. */
export default function CurioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader app="Curio" />
      {children}
    </>
  );
}
