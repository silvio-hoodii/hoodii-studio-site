import type { Metadata, Viewport } from 'next';
import '../hub.css';
import './work.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

/* ---- DRAFT, AWAITING SILVIO'S READ ----
 *
 * These four pages are P1-1 and P1-2 of docs/plans/2026-08-14-audit-execution-plan.md, both marked
 * "Silvio approves copy before deploy". They are deployed and reachable so he can read the real
 * thing rather than a markdown file, and they are `noindex` and linked from nowhere so that until
 * he has read them a stranger cannot land on copy that speaks for him.
 *
 * Shipping them, once he says yes, is three edits and no new code:
 *   1. remove `robots` below,
 *   2. add /work/themoment, /work/versatile, /work/brixel and /work/kitchen to src/app/sitemap.ts,
 *   3. point the three "In production" rows on the hub at them.
 *
 * The hard constraint from section 10 of the plan, checked line by line: no availability claim of
 * any kind. No "available for hire", no "open to work", no rates, no invitation to get in touch
 * about work. The signed employment agreement's clause 7(c) bars outside employment or consulting
 * without written consent, and the site's job is to show what exists, not to offer anything.
 *
 * Every number in here is either computed from a live store or dated. See the comment on the hub's
 * WORK rows for why a typed count must never wear the signal colour.
 */
export const metadata: Metadata = {
  title: { default: 'Work', template: '%s · Silvio Neyra' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="idx work">
      <SiteHeader app="Work" />
      {children}
      <SiteFooter standalone />
    </div>
  );
}
