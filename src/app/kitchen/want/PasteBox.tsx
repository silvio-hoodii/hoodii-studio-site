'use client';

import { useActionState } from 'react';
import { checkPaste, type PasteResult } from './actions';

/* The box the app had been telling him to use for days without ever rendering one.
 *
 * `wantByUrl` answers a 403 or a 404 with "copy the ingredient list here instead and I will read it".
 * There was nowhere to copy it into. The Kitchn returns 403 to anything that is not a browser, Budget
 * Bytes 404s some of its own recipe URLs, and every site that blocks `ClaudeBot` by name blocks the
 * fetch path too. So the one route that reaches ANY recipe on the internet is the one he named
 * himself: "I'll personally go and open a website and copy paste all the information."
 *
 * Collapsed by default. The URL field above works for most pages and this is the fallback, so it
 * should not be the first thing on the screen competing with it.
 */
export default function PasteBox() {
  const [state, action, pending] = useActionState<PasteResult | null, FormData>(checkPaste, null);

  return (
    <details className="devs" style={{ marginTop: 10 }}>
      <summary>Or paste the recipe itself, for a page that will not open</summary>

      <p className="lede" style={{ marginTop: 8 }}>
        Copy the ingredient list off the page and put it here. Headings and step numbers get stripped.
      </p>

      <form action={action}>
        {/* Keyed on the last submission so React remounts it with the text still in place. An
            uncontrolled textarea would otherwise come back empty after the action returns, and
            editing one wrong line would mean copying the whole recipe again. */}
        <textarea
          key={state?.text ? 'filled' : 'empty'}
          defaultValue={state?.text ?? ''}
          name="text"
          rows={8}
          placeholder={'Ingredients\n2 tbsp olive oil\n1 onion, diced\n400g chopped tomatoes'}
          aria-label="Paste a recipe ingredient list"
          style={{ width: '100%', marginTop: 8 }}
        />
        <button type="submit" className="primary" disabled={pending} style={{ marginTop: 8 }}>
          {pending ? 'Reading' : 'Read it'}
        </button>
      </form>

      {state && !state.ok && (
        <div className="box warn" style={{ marginTop: 14 }}>
          <span className="k">Could not read that</span>
          <div>{state.error}</div>
        </div>
      )}

      {state?.ok && (
        <>
          <p className="quiet" style={{ marginTop: 14 }}>
            {state.missing!.length === 0
              ? <span className="live">You can make this now</span>
              : <span><b>{state.missing!.length}</b> thing{state.missing!.length === 1 ? '' : 's'} to buy</span>}
          </p>

          {state.missing!.length > 0 && (
            <div className="box warn" style={{ marginTop: 14 }}>
              <span className="k">You would need to buy {state.missing!.length}</span>
              {state.missing!.map((m, k) => (
                <div key={k} style={{ marginBottom: 6 }}>
                  <b>{m.what}</b>
                  <span className="quiet"> for &ldquo;{m.line}&rdquo;</span>
                  {m.note && <div className="quiet">{m.note}</div>}
                </div>
              ))}
            </div>
          )}

          {state.via!.length > 0 && (
            <div className="box look" style={{ marginTop: 14 }}>
              <span className="k">Covered by something you own</span>
              {state.via!.map((v, k) => <div key={k}><b>{v.what}</b> via your {v.via}</div>)}
            </div>
          )}

          {state.have!.length > 0 && (
            <div className="box done" style={{ marginTop: 14 }}>
              <span className="k">Already here, {state.have!.length}</span>
              <div>{state.have!.join(', ')}</div>
            </div>
          )}

          {/* Named, not counted. He asked for this directly on the find page: "there's no way for me
              to know what it's missing when you say unsure". A bare count is the app knowing
              something and not saying it. */}
          {state.unknown!.length > 0 && (
            <div className="box look" style={{ marginTop: 14 }}>
              <span className="k">Our list does not recognise these, {state.unknown!.length}</span>
              <div>{state.unknown!.join(', ')}</div>
              <div className="lede" style={{ marginTop: 4 }}>
                Not missing, just unrecognised. Check these yourself.
              </div>
            </div>
          )}

          <p className="lede" style={{ marginTop: 12 }}>
            This answers what it needs. It does not make a cook card: that follows the published method
            word for word and is built from a capture, so tell me the dish and it gets written properly.
          </p>
        </>
      )}
    </details>
  );
}
