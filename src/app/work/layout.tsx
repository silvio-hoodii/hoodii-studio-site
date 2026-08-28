import type { Metadata, Viewport } from 'next';
import '../hub.css';
import './work.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

/* Published 2026-08-16. These four were P1-1 and P1-2 of
 * docs/plans/2026-08-14-audit-execution-plan.md, held noindex and unlinked until Silvio had read
 * them. He read them, asked for the Brixel rewrite and the kitchen trim, and said to push.
 *
 * The hard constraint from section 10 of the plan still holds and outlives the draft state: no
 * availability claim of any kind. No "available for hire", no "open to work", no rates, no
 * invitation to get in touch about work. The signed employment agreement's clause 7(c) bars outside
 * employment or consulting without written consent, and the site's job is to show what exists, not
 * to offer anything. Anyone editing these pages checks that before pushing.
 *
 * Every number in here is either computed from a live store or dated. See the comment on the hub's
 * WORK rows for why a typed count must never wear the signal colour.
 */
export const metadata: Metadata = {
  title: { default: 'Work', template: '%s · Silvio Neyra' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',   // lint-tokens-allow: a viewport export is read by the browser chrome, not by CSS
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
