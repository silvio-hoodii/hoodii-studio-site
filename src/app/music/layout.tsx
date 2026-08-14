import './music.css';
import SiteHeader from '@/components/SiteHeader';

/* This layout exists only to carry the site header and the stylesheet. /music is a single route
 * with no children, so there is nothing else for it to do.
 *
 * 780 because the column here is wider than the 680 everywhere else, and a header that does not
 * line up with the content under it reads as a mistake rather than as a decision. */
export default function MusicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader app="Music" measure={780} />
      {children}
    </>
  );
}
