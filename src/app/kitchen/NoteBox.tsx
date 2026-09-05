'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, type WriteResult } from './write';
import Unlock from './Unlock';

const RATINGS = [
  { key: 'nailed', label: 'It worked' },
  { key: 'fine', label: 'Fine' },
  { key: 'wrong', label: 'Went wrong' },
] as const;

/* How it went. One row in cook_log, the only record of what happened at the stove. A rating alone
 * is allowed, a note alone is allowed; nothing is required except that something was said. */
export default function NoteBox({ dish }: { dish: string }) {
  const router = useRouter();
  const [rating, setRating] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<WriteResult | null>(null);
  const [saved, setSaved] = useState(false);

  const canSend = !!rating || note.trim().length > 0;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await postJson('/kitchen/api/note', { dish, rating: rating ?? '', note: note.trim() });
      if (r === 'ok') {
        setNote('');
        setRating(null);
        setSaved(true);
        router.refresh();
      } else {
        setErr(r);
      }
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
      {err && <Unlock err={err} onRetry={send} />}
    </div>
  );
}
