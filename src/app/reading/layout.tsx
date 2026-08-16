import './reading.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

/* Header, footer and stylesheet, mounted here so /reading/[slug] gets all three without anyone
 * remembering. The four dead-end login pages are what a per-page rule is worth. */
export default function ReadingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader app="Reading" />
      {children}
      <SiteFooter standalone />
    </>
  );
}
