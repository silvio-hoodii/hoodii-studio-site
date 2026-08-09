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

export const metadata: Metadata = {
  title: 'Silvio Neyra',
  description: 'Small software for an audience of one.',
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
