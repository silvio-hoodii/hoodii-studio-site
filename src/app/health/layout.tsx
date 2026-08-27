import type { Metadata, Viewport } from 'next';
/* THREE STYLESHEETS, IN THIS ORDER, AND THE ORDER IS THE POINT.
 *
 * This surface hosts the training week as of 2026-08-27, so it needs training.css: `.standing`,
 * `.planweek`, `.actual`, `.exgroup`, `.subtabs` and everything else the Overview tab drew all live
 * there, scoped under `.training`.
 *
 * Both `.training` and `.health` define `.wrap`, `h2`, `.divider` and `.stale`, at equal
 * specificity, so whichever file loads LAST wins those four. health.css loads last on purpose: this
 * page keeps its own look, and training.css supplies only what health.css has no opinion about. */
import '../training.css';
import '../charts.css';
import './health.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import TrainingNav from '@/components/training/TrainingNav';

export const metadata: Metadata = {
  title: 'Health',
  description: 'The index for training: how many days in a row, what the week looks like, and what my body did about it.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return (
    /* BOTH class names. `.training` is what the week blocks answer to and `.health` is what the
     * charts and the attendance strip answer to, and this page draws both. Adding the class is a
     * far smaller change than re-scoping 219 lines of health.css, and it leaves each block styled
     * by the file that already knows about it.
     *
     * `measure-data`: this surface is charts and a 30-cell strip, not prose. See globals.css. */
    <div className="training health measure-data">
      <SiteHeader app="Health" />
      <TrainingNav />
      {children}
      <SiteFooter standalone />
    </div>
  );
}
