import './callback.css';
import SiteHeader from '@/components/SiteHeader';

/* Carries the site header and the stylesheet; /callback has no child routes. */
export default function CallbackLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader app="Callback" />
      {children}
    </>
  );
}
