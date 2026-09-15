import type { Cue } from '@/lib/gym/types';

/* THE CUES. Added 2026-08-16: "also cues and techinique remember that ive never run or bike".
 *
 * Each cue is a TEST WITH A BINARY RESULT, per the same house rule the kitchen runs on: a doneness
 * cue must be something he performs, never a sense he has to have.
 *
 * ONLY THE CUE AND ITS TEST RENDER, since 2026-09-15. Each card also printed a confidence badge,
 * a paragraph of reasoning, the source's own sentence, a note that the same sentence sits on the
 * other swim tab, a citation block, and under the list an essay on what was thrown out. His words:
 * "in general i feel there so much text that adds no value, everywhere". The rule that decided what
 * stays is in AGENTS.md under "Page text": the cue is something to do and the test is how he checks
 * he did it; everything else explained or defended the cue.
 *
 * Nothing was deleted from the content files. `why`, `quote`, `grounding`, `url`, `confidence`,
 * `sharedWith` and `cuesNote` are still there and still checked by the validators, because they
 * are the research record a later session reads before changing a cue. They are just not the page. */
/** "coaching:kick-origin" to "the Coach me tab". The key is a data pointer; this is the sentence. */
export function sharedLabel(key: string): string {
  const file = key.split(':')[0];
  return file === 'coaching' ? 'the Coach me tab' : file === 'teaching' ? 'the Coach them tab' : file ?? key;
}

export default function Cues({
  cues,
  heading,
}: {
  cues: Cue[];
  /** Accepted and ignored: the "what was thrown out" essay no longer renders. See the header. */
  note?: string | null;
  heading?: string;
  intro?: string;
}) {
  if (!cues?.length) return null;
  return (
    <>
      <div className="exgroup-label" style={{ marginTop: 22 }}>
        {heading ?? 'How to do it'} <span className="tag">({cues.length})</span>
      </div>
      {/* COLLAPSED BY DEFAULT, and measured before and after rather than guessed. Rendering all
          seven open took the Run tab to 8,536 px. Collapsed, the names are a scannable checklist
          and each opens on its own, which is how he would use them at the gym. */}
      <div className="cuelist">
        {cues.map((c) => (
          <details className="cue" key={c.name}>
            <summary>
              <span className="cue-name">{c.name}</span>
            </summary>
            <div className="cue-body">
              <div className="ex-cue">{c.cue}</div>
              <div className="ex-meta cue-test"><b>Check:</b> {c.test}</div>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
