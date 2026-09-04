import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { LIGHT, DARK } from '@/lib/tokens.generated'

/* Not Inter and not Geist, both of which are their own tell. Plex is a commissioned typeface with
 * actual engineering character, the mono has real personality in its italics and numerals, and the
 * two are designed as a family so they set together without fussing.
 *
 * The mono carries the structure of the index (labels, state, numbers). The sans carries prose. */

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

/* What Google actually serves for this domain, until Search Console catches up, is the RETIRED
 * site's description: "Personal site for Silvio Neyra. Business analyst, product owner, builder. 12
 * years bridging business and technology." That page has not existed since 2026-08-10.
 *
 * `metadataBase` is what lets every relative canonical and share image below resolve to an absolute
 * URL. Without it Next warns at build and emits nothing usable.
 *
 * The template fixes every tab title on the site in one line: a layout that says `title: 'Kitchen'`
 * now renders "Kitchen · Silvio Neyra" instead of a bare word that means nothing in a list of
 * twenty open tabs. The hub keeps the plain default, since it does not set a title of its own.
 *
 * No canonical here on purpose. Metadata is inherited, so a canonical on the root layout would tell
 * a crawler that every page on the site is a duplicate of the front page. It is declared per route,
 * on the three routes that are meant to be indexed.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://hoodii.studio'),
  title: { default: 'Silvio Neyra', template: '%s · Silvio Neyra' },
  /* Order matters more than wording here. Google shows roughly the first 155 characters, so the
   * twelve years go first: an audit draft led with the apps and pushed the only line a recruiter
   * can use past the cut. Approved 2026-08-14. */
  description:
    'Twelve years bridging business and technology, now building the software myself. A kitchen that knows my fridge, a lifting log, and French flashcards from book pages I worked.',
  /* The image is not named here on purpose: `src/app/opengraph-image.tsx` is picked up by file
   * convention and Next fills in the url, width, height and type, which is four fewer strings to
   * keep in sync with a file. */
  openGraph: {
    type: 'website',
    siteName: 'Silvio Neyra',
    url: 'https://hoodii.studio',
    title: 'Silvio Neyra',
    description:
      'Twelve years bridging business and technology, now building the software myself. A kitchen that knows my fridge, a lifting log, and French flashcards from book pages I worked.',
  },
  twitter: { card: 'summary_large_image' },
}

/* THE ONLY VIEWPORT EXPORT ON THE SITE, as of 2026-09-04. There were nine.
 *
 * Eight app layouts (kitchen, gym, health, swim, run, bike, french, work) each carried a
 * byte-identical copy of this object, `themeColor: '#ffffff'` included. Viewport metadata is merged
 * SHALLOWLY across the segments of a route and the deepest definition of a key wins, so a single
 * declaration here reaches every page and those eight were pure duplication: nine places to edit
 * one fact, which is how the eight of them came to be a month out of date together. Deleted.
 *
 * `themeColor` is the strip of browser chrome above the page on a phone, so it is the one colour
 * that has to move with the theme. It is a media PAIR rather than one value, which is what lets the
 * chrome go dark with the page instead of leaving a white bar over a dark document.
 *
 * The two values are DERIVED, not typed. `src/lib/tokens.generated.ts` is written by
 * `scripts/gen-tokens.mjs` from the oklch tokens in globals.css, and `pnpm build` runs its
 * `--check`. The previous hand-converted mirrors of this palette, in `opengraph-image.tsx`, were
 * all four wrong and had been for a month: a comment asking people to keep a copy in sync is not a
 * mechanism, and this is the mechanism.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: LIGHT['--background'] },
    { media: '(prefers-color-scheme: dark)', color: DARK['--background'] },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn('antialiased', plexSans.variable, plexMono.variable)}>
      <body>{children}</body>
    </html>
  )
}
