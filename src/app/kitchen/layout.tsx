import type { Metadata } from 'next';
import './kitchen.css';
import TimerRail from './TimerRail';
import SiteHeader from '@/components/SiteHeader';

export const metadata: Metadata = {
  /* A template as well as a name, because the root layout's template only reaches the segments
   * directly under it. With a bare `title: 'Kitchen'` here, /kitchen resolved to
   * "Kitchen · Silvio Neyra" and every dish page under it resolved to a naked "Overnight Oats"
   * with no owner on it. Caught by testing the dish title rather than assuming the template
   * cascaded, which it does not. */
  title: { default: 'Kitchen', template: '%s · Silvio Neyra' },
  /* Noindex, but a description still fills in the card when a link gets pasted into a message. */
  description:
    'What I can cook tonight from what is actually in my fridge, written out for someone still learning to cook.',
  robots: { index: false, follow: false },
};


export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kos">
      {/* In the layout, so /kitchen/find, /kitchen/want, /kitchen/shop, every dish page and
          /kitchen/login all get a way home without anyone having to remember. */}
      <SiteHeader app="Kitchen" />
      {/* Above the page rather than inside it, because a timer belongs to the kitchen and not to
          whichever recipe happened to start it. This is what makes a pasta timer visible while he
          is three steps into the chicken. */}
      <TimerRail />
      {children}
    </div>
  );
}
