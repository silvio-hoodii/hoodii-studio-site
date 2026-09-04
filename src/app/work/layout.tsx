import type { Metadata } from 'next';
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


export default function WorkLayout({ children }: { children: React.ReactNode }) {
  /* THE HEADER SITS OUTSIDE `.idx`, and it did not until 2026-09-04.
   *
   * `.idx` in hub.css is the only page wrapper on the site that carries BOTH a max-width and
   * padding (`clamp(32px, 8vw, 64px) 20px 64px`), so a header inside it started 85px down the page
   * at 1440 and its rule spanned only the 680 column. That made it the one inconsistent header on
   * the site, on the four pages a stranger is most likely to open.
   *
   * The other wrappers look the same and are not: curio's `.measure-data` and music's
   * `.measure-wide` only set the `--measure` variable and pad nothing, so a header inside them
   * still sits at the top of the viewport. `reading/layout.tsx` uses a fragment, as this now does.
   *
   * SiteHeader reads `--measure` for its own inner alignment and neither `.idx` nor `work.css`
   * redefines it, so moving the header out of the wrapper does not move its content off the
   * column. */
  return (
    <>
      <SiteHeader app="Work" />
      <div className="idx work">
        {children}
        <SiteFooter standalone />
      </div>
    </>
  );
}
