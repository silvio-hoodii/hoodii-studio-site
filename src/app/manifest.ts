import type { MetadataRoute } from 'next';
import { LIGHT } from '@/lib/tokens.generated';

/* THE WEB MANIFEST. There was none, which is B3 of the 2026-09-04 audit.
 *
 * What it changes on a phone: the site can be added to a home screen and opens in `standalone`,
 * without Safari's address bar. That bar is the exact strip of screen the kitchen's timer rail
 * fights for room against, so this is not a badge, it is 60 vertical pixels back on the surface he
 * uses at the stove.
 *
 * AND NOT A SERVICE WORKER, deliberately. Every page here is a live mirror of a store that changes
 * during the day: the stock, the cook log, the training week. A cached `/kitchen` served from a
 * worker is Law 2 in a new shape ("never deploy over someone who is following the instructions
 * right now"), except worse, because a stale cook screen has no version to pin and no way to tell
 * him it is stale. The manifest gets the icon and the standalone window, which is what was missing.
 * Offline was not.
 *
 * `start_url` is '/' rather than '/kitchen'. The hub is the front door and the shortcuts below are
 * how the four daily apps get reached in one tap, which keeps a single installed icon rather than
 * asking him to install four.
 *
 * THE SHORTCUTS ARE THE ONE HAND-MAINTAINED LIST IN THIS FILE, and that is a decision rather than
 * an oversight. Everything else on this site derives its lists (the route table, the source counts,
 * the `*` markers in the gym catalogue) because a hand-kept list of what exists always loses to the
 * thing that exists. A long-press menu can hold about four items before iOS and Android start
 * truncating it, so this list is not "every app", it is "the four worth a long press". A derived
 * list would put nine here and show a truncated arbitrary four. Reviewed when an app is added.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Silvio Neyra',
    /* What appears under the icon on a home screen. Kept to one word: iOS truncates at roughly
       twelve characters and "Silvio Neyra" already clips on a narrow phone. */
    short_name: 'Silvio',
    description:
      'Small software for an audience of one: a kitchen that knows my fridge, a lifting log, and French flashcards from book pages I worked.',
    start_url: '/',
    display: 'standalone',
    /* Derived from the tokens like the root layout's themeColor, but LIGHT unconditionally, and
       that is a limitation rather than a choice. A manifest holds one value and has no media query,
       so unlike `themeColor` these cannot follow the OS. `background_color` is what fills the
       screen while a standalone launch paints, so on a phone set to dark this is a brief light
       flash before a dark page. Swapping both to DARK moves the flash to the light users instead.
       One line either way if he tells me which his phone is on. */
    background_color: LIGHT['--background'],
    theme_color: LIGHT['--background'],
    orientation: 'portrait',
    icons: [
      { src: '/icon/32', sizes: '32x32', type: 'image/png' },
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
    ],
    shortcuts: [
      { name: 'Kitchen', short_name: 'Kitchen', url: '/kitchen' },
      { name: 'Gym', short_name: 'Gym', url: '/gym' },
      { name: 'Swim', short_name: 'Swim', url: '/swim' },
      { name: 'Health', short_name: 'Health', url: '/health' },
    ],
  };
}
