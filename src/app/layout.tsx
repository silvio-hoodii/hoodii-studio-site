import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'

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
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn('antialiased', plexSans.variable, plexMono.variable)}>
      <body>{children}</body>
    </html>
  )
}
