import { LIGHT } from '@/lib/tokens.generated';

/* THE MARK, drawn once and rendered at every size the site needs.
 *
 * WHAT WAS THERE BEFORE: `src/app/favicon.ico`, dated 21 May, a white triangle in a black circle.
 * That is the create-next-app default, it predates both the 2026-08-09 redesign and the removal of
 * the WebGL room, and it meant the browser tab for a personal site showed a framework's logo.
 *
 * WHAT THIS DRAWS. Three bars of decreasing width, paper on ink. The site is an index: a heading, a
 * rule, and rows that name things. That is the whole front door and it is what this reduces to.
 *
 * TWO DRAFTS WERE RENDERED AND THROWN AWAY, which is the only reason this one is any good. This
 * repo's rule is that a mark gets looked at rather than trusted from its path data, and it earned
 * that rule when two drafts of a kettlebell both read as a handbag.
 *
 * Draft 1 was an "instrument panel": a thin rule with a green indicator square sitting on it. At
 * 512 it read as a random green rectangle on a bar; at 32 it was a green smudge next to a white
 * dash. Two faults, and the second is the instructive one:
 *
 *   - Every element was too small. A 5.5%-of-face rule is invisible in a 16px browser tab. What
 *     survives at that size is large forms and high contrast, and nothing else.
 *   - IT PUT `--signal` IN A LOGO. globals.css reserves that colour for "a value that is true right
 *     now", and an icon is never true right now: it is the same pixels on every page forever. The
 *     draft's own comment called this "the joke and also the point", which was the tell. A mark
 *     that breaks the palette rule it quotes is not defensible, so the mark is monochrome.
 *
 * Draft 2 was a letter "S". Legible, and rejected because satori has no local font: it would have
 * set in the fallback sans and not in IBM Plex, so the one typographic mark on the site would be
 * the one place not using the site's typeface.
 *
 * WHY THREE BARS ARE NOT A HAMBURGER MENU, since that was the objection to this shape. A hamburger
 * is three bars of EQUAL width, centred, and it means "open the navigation". These are strongly
 * descending and left-aligned, which reads as a list of items rather than a control, the same way
 * a document icon does.
 *
 * EVERY DIMENSION IS A FRACTION OF THE CANVAS, so one drawing serves 32px and 512px, and the 32
 * and the 512 cannot drift apart into two drawings.
 *
 * COLOURS ARE DERIVED, from src/lib/tokens.generated.ts. See scripts/gen-tokens.mjs for why nothing
 * here is a typed hex: the four hand-converted mirrors in opengraph-image.tsx were all four stale.
 *
 * `inset` is the fraction of the canvas left empty around the drawing. iOS masks an
 * apple-touch-icon with its own rounded rectangle and clips roughly a tenth off each edge, so the
 * home-screen version passes a larger inset; the browser tab keeps almost none, because at 16px
 * padding costs more than the rounding does.
 */
export function IconMark({ size, inset }: { size: number; inset: number }) {
  const pad = size * inset;
  const face = size - pad * 2;

  /* Three bars and two gaps fill the face exactly. The bars are deliberately thicker than the gaps:
     at 16px a gap thinner than a bar still separates them, and a bar thinner than a gap disappears. */
  const bar = face * 0.2;
  const gap = (face - bar * 3) / 2;

  /* Strongly descending, so the silhouette is a staircase and not a stack of equals. */
  const widths = [1, 0.66, 0.36];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        background: LIGHT['--foreground'],
      }}
    >
      {widths.map((w, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: pad,
            top: pad + i * (bar + gap),
            width: face * w,
            height: bar,
            background: LIGHT['--background'],
          }}
        />
      ))}
    </div>
  );
}
