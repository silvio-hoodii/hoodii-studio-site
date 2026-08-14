import './curio.css';
import SiteHeader from '@/components/SiteHeader';

/* Carries the site header and the stylesheet; /curio has no child routes.
 *
 * The wrapper is here rather than on the page for the same reason it is on /music: the header is
 * mounted above the content, so a class on the page could not move both. See `.measure-data` in
 * globals.css for what the wider column is for and why it stops at 1024. */
export default function CurioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="measure-data">
      <SiteHeader app="Curio" />
      {children}
    </div>
  );
}
