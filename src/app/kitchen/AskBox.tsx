'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, type WriteResult } from './write';
import Unlock from './Unlock';

/* "I want to make X." Typed on the phone, anywhere, and picked up by the next session on the
 * laptop, which is where the agent that can read a recipe and shop Walmart in his own Chrome lives.
 * This box writes one row and nothing else happens until then. The row is shown below the box so he
 * can see it landed and is waiting, rather than wondering whether the send worked. */
export default function AskBox() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<WriteResult | null>(null);
  const [saved, setSaved] = useState(false);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await postJson('/kitchen/api/inbox', { text: t });
      if (r === 'ok') {
        setText('');
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
    <section className="ask" aria-labelledby="ask-h">
      <h2 id="ask-h" className="eyebrow">I want to make</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder="A dish, or a link to a recipe"
          aria-label="A dish name or a recipe link"
          autoComplete="off"
          enterKeyHint="send"
        />
        <button type="submit" className="send" disabled={busy || !text.trim()}>
          {busy ? 'Sending' : 'Send'}
        </button>
      </form>
      <p className="hint">
        The next session picks it up: finds the recipe, asks what you already have, and builds the
        list with links. Anything you are not sure you have goes on the list.
      </p>
      {saved && !err && <p className="saved">Saved. It is in the list below, waiting.</p>}
      {err && <Unlock err={err} onRetry={send} />}
    </section>
  );
}
