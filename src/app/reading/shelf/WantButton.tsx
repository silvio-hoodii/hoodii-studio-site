'use client';

import WalledLink from '@/components/WalledLink';
import { useState } from 'react';

/* The only client JS on this page, and it earns its place: a want is a WRITE, and the write is
 * cookie-gated. Everything else here still renders and works before hydration.
 *
 * On a device without the cookie the POST 401s, and rather than failing silently this offers the
 * way in, the same move /kitchen/api/unlock made after a write failed mid-cook. A button that
 * quietly does nothing is worse than one that says why. */
export default function WantButton({
  bookKey, title, author, initial,
}: { bookKey: string; title: string; author: string; initial: boolean }) {
  const [wanted, setWanted] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'locked' | 'error'>('idle');

  async function toggle() {
    setState('saving');
    const next = !wanted;
    try {
      const r = await fetch('/reading/api/want', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: bookKey, title, author, remove: !next }),
      });
      if (r.status === 401) { setState('locked'); return; }
      if (!r.ok) { setState('error'); return; }
      setWanted(next);
      setState('idle');
    } catch { setState('error'); }
  }

  if (state === 'locked') {
    return <WalledLink className="wantbtn locked" href="/login?to=/reading/shelf">sign in to save</WalledLink>;
  }
  return (
    <button
      type="button"
      className={`wantbtn ${wanted ? 'on' : ''}`}
      onClick={toggle}
      disabled={state === 'saving'}
      aria-pressed={wanted}
      aria-label={wanted ? `Remove ${title} from your want list` : `Save ${title} to your want list`}
    >
      {state === 'saving' ? '...' : state === 'error' ? 'failed' : wanted ? 'wanted' : 'want'}
    </button>
  );
}
