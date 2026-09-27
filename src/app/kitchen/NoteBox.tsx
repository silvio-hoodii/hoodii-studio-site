'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SaveBlocked from '@/components/SaveBlocked';
import { postJson, type WriteResult } from './write';

const RATINGS = [
  { key: 'nailed', label: 'It worked' },
  { key: 'fine', label: 'Fine' },
  { key: 'wrong', label: 'Went wrong' },
] as const;

function readDraft(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(key: string, text: string) {
  try {
    if (text) window.sessionStorage.setItem(key, text);
    else window.sessionStorage.removeItem(key);
  } catch {
    /* Private mode or blocked storage: the box still works, it just does not survive a reload. */
  }
}

/* How it went. One row in cook_log, the only record of what happened at the stove. A rating alone
 * is allowed, a note alone is allowed; nothing is required except that something was said.
 *
 * TEXT IS NEVER LOST TO A SAVE OR A RELOAD, since 2026-09-27. The box used to clear itself on
 * success, which also wiped anything typed while the request was in flight, and a reload lost an
 * unsent note. Now only the text that was sent is removed, and the draft sits in sessionStorage
 * under the dish id until it is saved. */
export default function NoteBox({ id, dish }: { id: string; dish: string }) {
  const router = useRouter();
  const draftKey = `kitchen:draft:${id}`;
  const [rating, setRating] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<WriteResult | null>(null);
  const [saved, setSaved] = useState(false);
  const loaded = useRef(false);

  /* The draft comes back after hydration, not in the initial state, so the server HTML and the
     first client render agree. */
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const draft = readDraft(draftKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of sessionStorage after hydration
    if (draft) setNote((cur) => cur || draft);
  }, [draftKey]);

  const canSend = !!rating || note.trim().length > 0;

  async function send(): Promise<boolean> {
    if (!canSend) return false;
    const sentNote = note;
    const sentRating = rating;
    setBusy(true);
    setErr(null);
    try {
      const r = await postJson('/kitchen/api/note', { dish, rating: sentRating ?? '', note: sentNote.trim() });
      if (r !== 'ok') {
        setErr(r);
        return false;
      }
      /* Remove what was sent and keep anything typed after it. */
      setNote((cur) => {
        const rest = cur.startsWith(sentNote) ? cur.slice(sentNote.length).trimStart() : cur;
        writeDraft(draftKey, rest);
        return rest;
      });
      setRating((cur) => (cur === sentRating ? null : cur));
      setSaved(true);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notebox">
      <div className="ratings" role="group" aria-label="How it went">
        {RATINGS.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={rating === r.key}
            onClick={() => {
              setRating(rating === r.key ? null : r.key);
              setSaved(false);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        rows={4}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          writeDraft(draftKey, e.target.value);
          setSaved(false);
        }}
        placeholder="What happened, what you changed, what you would do differently"
        aria-label="Note on this cook"
      />
      <div style={{ marginTop: 10 }}>
        <button type="button" className="send" disabled={busy || !canSend} onClick={() => void send()}>
          {busy ? 'Saving' : 'Save note'}
        </button>
      </div>
      {saved && !err && <p className="saved">Saved.</p>}
      {err && <SaveBlocked err={err} noun="note" onRetry={send} loginHref={`/login?to=/kitchen/${encodeURIComponent(id)}`} />}
    </div>
  );
}
