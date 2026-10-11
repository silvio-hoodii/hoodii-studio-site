/* A DRAWING ON THE CARD, for the lifts where the words leave the geometry unclear. Added 2026-10-10
 * for the Pallof press, his words: "it's never clear where my hands should be ... in respect to the
 * cable ... horizontally ... cues as text are good, but then it's kind of hard to understand
 * visually", and not a video link: "I know I won't do it".
 *
 * SEEN FROM ABOVE, on purpose. Every photo of this exercise is taken from the front or the side, and
 * from there the one thing he asked (where the hands sit relative to the band, left to right) is
 * invisible. Drawn here rather than taken from a library: inline SVG in the site's own tokens, no
 * image file to licence or go stale, and the same lines the cue uses.
 *
 * Keyed by exercise id. A lift with no entry draws nothing, so adding one is one line in DIAGRAMS. */

function PallofFromAbove() {
  return (
    <svg className="exdiag" viewBox="0 48 300 172" role="img"
         aria-label="Seen from above: the band runs from the post to your hands; your hands press straight out from the middle of your chest, not toward the post.">
      {/* the post */}
      <rect x="10" y="92" width="16" height="16" className="exdiag-solid" />
      <text x="18" y="124" textAnchor="middle">post</text>
      {/* the band, to the hands at the chest (faint) and pressed out (solid) */}
      <line x1="26" y1="100" x2="146" y2="128" className="exdiag-faint" />
      <line x1="26" y1="100" x2="146" y2="66" className="exdiag-line" />
      <text x="78" y="76" textAnchor="middle">band</text>
      {/* you, from above, facing up the screen */}
      <ellipse cx="150" cy="150" rx="40" ry="12" className="exdiag-line" />
      <circle cx="150" cy="150" r="9" className="exdiag-line" />
      <line x1="150" y1="141" x2="150" y2="136" className="exdiag-line" />
      <text x="198" y="154">you</text>
      {/* hands: at the chest, then pressed straight out along your midline */}
      <circle cx="150" cy="128" r="4" className="exdiag-solid" />
      <circle cx="150" cy="66" r="5" className="exdiag-solid" />
      <line x1="150" y1="122" x2="150" y2="76" className="exdiag-arrow" markerEnd="url(#exdiag-head)" />
      <text x="162" y="62">hands in front of</text>
      <text x="162" y="75">your breastbone</text>
      <text x="162" y="102">press straight out</text>
      <text x="162" y="131">start at your chest</text>
      {/* how far from the post */}
      <line x1="18" y1="190" x2="150" y2="190" className="exdiag-faint" />
      <line x1="18" y1="184" x2="18" y2="196" className="exdiag-faint" />
      <line x1="150" y1="184" x2="150" y2="196" className="exdiag-faint" />
      <text x="84" y="210" textAnchor="middle">step out until it pulls</text>
      <defs>
        <marker id="exdiag-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="exdiag-solid" />
        </marker>
      </defs>
    </svg>
  );
}

const DIAGRAMS: Record<string, () => React.JSX.Element> = {
  'band-pallof': PallofFromAbove,
  'cable-pallof': PallofFromAbove,
  'half-kneeling-pallof': PallofFromAbove,
};

export default function ExerciseDiagram({ id }: { id: string }) {
  const D = DIAGRAMS[id];
  if (!D) return null;
  return (
    <figure className="exdiag-fig">
      <figcaption>Seen from above</figcaption>
      <D />
    </figure>
  );
}
