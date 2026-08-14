import './music.css';
import SiteHeader from '@/components/SiteHeader';

/* This layout exists only to carry the site header and the stylesheet. /music is a single route
 * with no children, so there is nothing else for it to do.
 *
 * The wrapper is what buys the wider column. /music is the only surface with a three-column grid,
 * so it overrides `--measure` for everything inside it, header included. Setting it here rather
 * than hardcoding 780 in two places is what keeps the header aligned with the content by
 * construction instead of by two numbers agreeing.
 *
 * `measure-data` on top of it takes the column wider again above 1024, where three charts sharing
 * 780px gave each one 245px to fit a track and an artist into. Below 1024 it does nothing and the
 * 780 stands. */
export default function MusicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="measure-wide measure-data">
      <SiteHeader app="Music" />
      {children}
    </div>
  );
}
