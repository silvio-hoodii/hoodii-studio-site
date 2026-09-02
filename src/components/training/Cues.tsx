import type { Cue } from '@/lib/gym/types';

/* THE CUES. Added 2026-08-16: "also cues and techinique remember that ive never run or bike".
 *
 * The plan told him how hard and how long and never how, which is a gap when the athlete has never
 * done the sport. Each cue is a TEST WITH A BINARY RESULT, per the same house rule the kitchen runs
 * on: a doneness cue must be something he performs, never a sense he has to have.
 *
 * `confidence` is rendered, not hidden. "convention" means good coaching practice with no study
 * behind it, and saying so is the point: a plan that labels its guesses can be trusted about the
 * rest. The citation sits behind a tap because he needs the cue at the gym and the source only when
 * he doubts it.
 *
 * Moved out of the conditioning page on 2026-08-26 when swim became its own route. Both surfaces
 * render cues from content files that share this shape, and the teaching handbook on /swim passes
 * its own `heading` and `intro` for the reason spelled out below. */
/** "coaching:kick-origin" to "the Coach me tab". The key is a data pointer; this is the sentence. */
export function sharedLabel(key: string): string {
  const file = key.split(':')[0];
  return file === 'coaching' ? 'the Coach me tab' : file === 'teaching' ? 'the Coach them tab' : file ?? key;
}

export default function Cues({
  cues,
  note,
  heading,
  intro,
}: {
  cues: Cue[];
  note?: string | null;
  heading?: string;
  intro?: string;
}) {
  if (!cues?.length) return null;
  return (
    <>
      <div className="exgroup-label" style={{ marginTop: 22 }}>
        {heading ?? 'How to actually do it'} <span className="tag">({cues.length})</span>
      </div>
      {/* The default copy says "a test YOU perform", which is right on the run, bike and swim tabs
          and wrong on the teaching tab, where the test is one he performs on somebody else while
          standing on the deck. Same component, because a teaching point and a training cue are the
          same shape; different sentence, because the person doing the looking is different. */}
      <p className="lede" style={{ marginBottom: 6 }}>
        {intro ?? 'Each one is a test you perform, not a feeling you have to have. Tap to open.'}
      </p>
      {/* COLLAPSED BY DEFAULT, and measured before and after rather than guessed. Rendering all
          seven open took the Run tab to 8,536 px, which is TALLER than the 6,287 px page he
          complained about in the first place. Fixing one wall of text by building a bigger one is
          not a fix. Collapsed, the seven names are a scannable checklist and each opens on its own,
          which is also how he would use them at the gym. */}
      <div className="cuelist">
        {cues.map((c) => (
          <details className="cue" key={c.name}>
            <summary>
              <span className="cue-name">{c.name}</span>
              <span className={`conf ${c.confidence}`}>{c.confidence}</span>
            </summary>
            <div className="cue-body">
              <div className="ex-cue">{c.cue}</div>
              <div className="ex-meta cue-test"><b>The test.</b> {c.test}</div>
              {c.why && <div className="ex-cue quiet">{c.why}</div>}
              {/* THE SENTENCE ITSELF, not a paraphrase of it and not behind a second tap. The whole
                  value of a citation here is that he can read what the source actually said and
                  disagree with how it was used. */}
              {c.quote && (
                <div className="stale cue-quote">
                  <span className="k">Their words</span>
                  <p className="ex-cue">&ldquo;{c.quote}&rdquo;</p>
                </div>
              )}
              {/* THE PAIRING, SHOWN. Six sentences are quoted on both coaching tabs of /swim, which
                  is what made him ask whether the two are "just the same thing twice". They are not:
                  one source sentence, two different actions, one you do and one you watch. That is a
                  design decision and it was invisible, so it read as a copy. Saying it costs a line
                  inside an already-collapsed body. */}
              {c.sharedWith?.length ? (
                <div className="ex-meta quiet">
                  Also on <b>{sharedLabel(c.sharedWith[0]!)}</b>, from this same sentence. Same
                  physics, different job: one is what you do, the other is what you watch for.
                </div>
              ) : null}
              {c.grounding && (
                <details className="src">
                  <summary>{c.confidence === 'convention' ? 'No study behind this' : 'Where this comes from'}</summary>
                  <div className="src-body">
                    {c.grounding}
                    {c.url && (
                      <>
                        {' '}
                        <a href={c.url} target="_blank" rel="noreferrer">open the source</a>
                      </>
                    )}
                  </div>
                </details>
              )}
            </div>
          </details>
        ))}
      </div>
      {note && (
        <details className="src">
          <summary>What was thrown out, and why</summary>
          <div className="src-body" style={{ whiteSpace: 'pre-line' }}>{note}</div>
        </details>
      )}
    </>
  );
}
