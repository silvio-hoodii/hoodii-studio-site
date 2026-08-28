import { ImageResponse } from 'next/og';

/* The card that renders when this URL is pasted into LinkedIn, Slack, iMessage or a DM.
 *
 * Until now there was none, so a link to this site previewed as a bare URL with a grey box. That is
 * the one place where the site is seen by someone who has not chosen to visit it yet.
 *
 * COLOURS ARE HARDCODED HERE, which is against the rule everywhere else in this repo, and it is not
 * laziness: this runs in a satori renderer with no stylesheet, no CSS custom properties and no
 * cascade, so `var(--background)` resolves to nothing at all. The four values below are the token
 * values converted once, and they are commented with the token they came from so a palette change
 * has a findable second place to go.
 *
 * The default font is deliberate too. IBM Plex would have to be fetched over the network at render
 * time, which turns a broken font CDN into a broken share card. A monochrome card with one large
 * name does not need the typeface to carry it.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Silvio Neyra';

const BACKGROUND = '#fdfcfa'; // lint-tokens-allow: --background, oklch(0.993 0.0015 100)
const FOREGROUND = '#262420'; // lint-tokens-allow: --foreground, oklch(0.19 0.004 100)
const MUTED = '#807d78'; // lint-tokens-allow: --muted-foreground, oklch(0.55 0.004 100)
const SIGNAL = '#00784a'; // lint-tokens-allow: --signal, oklch(0.48 0.12 158)

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BACKGROUND,
          color: FOREGROUND,
          padding: '72px 80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 22, letterSpacing: 6, color: MUTED }}>
          <div style={{ width: 10, height: 10, background: SIGNAL }} />
          <div>HOODII.STUDIO</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 86, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>Silvio Neyra</div>
          <div style={{ fontSize: 33, color: MUTED, marginTop: 22, lineHeight: 1.4, maxWidth: 900 }}>
            Twelve years bridging business and technology, now building the software myself.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 1, background: FOREGROUND, opacity: 0.85, marginBottom: 18 }} />
          {/* Kept under about 88 characters so it holds one line at this size. It wrapped to a
            * two-word orphan at 100, which is the sort of thing only rendering it shows. */}
          <div style={{ display: 'flex', fontSize: 24, color: MUTED, letterSpacing: 1 }}>
            A kitchen that knows my fridge, a lifting log, French flashcards from real pages
          </div>
        </div>
      </div>
    ),
    size,
  );
}
