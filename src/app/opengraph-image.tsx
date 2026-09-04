import { ImageResponse } from 'next/og';
import { LIGHT } from '@/lib/tokens.generated';

/* The card that renders when this URL is pasted into LinkedIn, Slack, iMessage or a DM.
 *
 * Until now there was none, so a link to this site previewed as a bare URL with a grey box. That is
 * the one place where the site is seen by someone who has not chosen to visit it yet.
 *
 * COLOURS CANNOT BE TOKENS HERE: this runs in a satori renderer with no stylesheet, no CSS custom
 * properties and no cascade, so `var(--background)` resolves to nothing at all. They are DERIVED
 * instead of copied, and that changed on 2026-09-04 for cause.
 *
 * THE FOUR HAND-CONVERTED LITERALS THAT USED TO BE HERE WERE ALL FOUR WRONG:
 *
 *     --background        was #fdfcfa    the token converts to #fdfdfc
 *     --foreground        was #262420    the token converts to #141412
 *     --muted-foreground  was #807d78    the token converts to #72726f
 *     --signal            was #00784a    the token converts to #007142
 *
 * Every one wrong in the WARM direction, because every one was a leftover of the cream palette
 * deleted on 2026-08-09. So this card, the single surface seen by people who have not chosen to
 * visit, had been rendering in the retired palette for a month, while the comment directly above it
 * asserted the values were "the token values converted once". They were converted once, from the
 * wrong palette, and nothing re-checked them. `lint-tokens.mjs` allowed all four by marker and was
 * right to: a marker says a literal is ALLOWED to be here. It cannot say the literal is CORRECT.
 *
 * `src/lib/tokens.generated.ts` is written from the oklch tokens in globals.css by
 * `scripts/gen-tokens.mjs`, and `pnpm build` runs its `--check`. A palette change that is not
 * regenerated now fails the build.
 *
 * The default font is deliberate too. IBM Plex would have to be fetched over the network at render
 * time, which turns a broken font CDN into a broken share card. A monochrome card with one large
 * name does not need the typeface to carry it.
 *
 * LIGHT and not DARK: a share card is composited onto whatever the messaging client's own surface
 * is, and it has no media query to read. One fixed rendering, and the light palette is the one the
 * site is designed in.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Silvio Neyra';

const BACKGROUND = LIGHT['--background'];
const FOREGROUND = LIGHT['--foreground'];
const MUTED = LIGHT['--muted-foreground'];
const SIGNAL = LIGHT['--signal'];

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
