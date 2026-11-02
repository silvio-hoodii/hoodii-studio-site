import type { MetadataRoute } from 'next';
import { LIGHT } from '@/lib/tokens.generated';

/* THE WEB MANIFEST. Adds the icon and the standalone window on a phone's home screen; no service worker,\n * nothing cached. Stripped on 2026-11-02: the only shortcut left is the gym. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Silvio Neyra',
    /* What appears under the icon on a home screen. Kept to one word: iOS truncates at roughly
       twelve characters and "Silvio Neyra" already clips on a narrow phone. */
    short_name: 'Silvio',
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
      { name: 'Gym', short_name: 'Gym', url: '/gym' },
    ],
  };
}
