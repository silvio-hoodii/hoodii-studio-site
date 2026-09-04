/* THE FRAME, WHILE THE DATA IS STILL COMING. B1 of the 2026-09-04 audit.
 *
 * WHAT IT FIXES. Every app surface on this site is `force-dynamic` and every one was rendered whole
 * on the server before a single byte was sent, with no `loading.tsx` anywhere under `src/app`.
 * Measured live from Calgary on 2026-09-04, time to first byte: `/kitchen` 3.56s, `/music` 1.66s,
 * `/gym` 1.31s, `/swim` 1.19s, `/health` 1.09s. So tapping Kitchen on the front door meant looking
 * at a WHITE SCREEN for three and a half seconds. On the shop's cellular signal, longer.
 * Lighthouse's speed index for /kitchen was 7.6s against a paint time of 1.4s, which is the exact
 * shape of "everything arrives at once, late".
 *
 * A `loading.tsx` in a segment is a Suspense boundary, so the layout's shell (the site header, the
 * training nav, the surface class that carries the stylesheet) flushes IMMEDIATELY and only the
 * data waits. That is the whole mechanism. It does not make the query faster; it makes the app
 * appear.
 *
 * WHY IT SHOWS NO HEADING TEXT, which was the design decision here.
 *
 * A `loading.tsx` covers its whole segment INCLUDING children, and the children do not share a
 * heading: `/swim` is "Swim" but `/swim/deep` is "Swim, the whole record" and `/swim/records` is
 * "Swim records". Typing one of them here would flash a heading that is wrong for two routes out of
 * three. The site already names the app truthfully during the wait, in the header the layout has
 * flushed, so the skeleton takes the h1's SHAPE and makes no claim about its words.
 *
 * That is the honest-states rule applied to a loading screen: a placeholder may occupy space, it
 * may not assert content.
 *
 * NO SHIMMER SWEEP. The pulse is opacity only, and `training.css`-style gradients are not used
 * anywhere on this site: the palette argument is no shadows and no gradients. It is also guarded by
 * `prefers-reduced-motion`, which until now was honoured only in hub.css because the hub's
 * equaliser was the site's only animation. This is the second one.
 */
export default function SurfaceLoading({
  /* Which wrapper class this surface's content sits in. There are three across the site and they
     are NOT interchangeable: `.wrap` is defined per surface under `.kos`, `.training`, `.health`
     and `.french`, while /music and /reading pad their own root class instead. Passing the wrong
     one loses the column and the padding, so each loading.tsx names the one its page uses. */
  wrap,
  /* Roughly how many blocks the real page opens with, so the skeleton is the height of the thing
     arriving rather than a fixed guess. Not exact and does not need to be: it stops the frame
     collapsing to a 40px sliver and then jumping. */
  rows = 5,
}: {
  wrap: string;
  rows?: number;
}) {
  return (
    <div className={wrap}>
      {/* `role="status"` with a polite live region is what tells a screen reader that something is
          coming, since the visual cue is pure decoration to it. The bars are hidden from the
          accessibility tree outright: a row of empty divs announced one by one is noise. */}
      <div role="status" aria-live="polite">
        <span className="vh">Loading</span>
        <div className="skel skel-title" aria-hidden="true" />
        <div className="skel-rows" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <div className="skel-row" key={i}>
              <div className="skel skel-label" />
              <div className="skel skel-line" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
