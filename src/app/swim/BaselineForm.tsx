'use client';

import { useState } from 'react';
import { today } from '@/lib/day';

/* THE SLOT FOR THE NUMBER. Built 2026-08-22.
 *
 * His words: "If there's a number that I need here, why is there not a slot for me to actually
 * input a number? Where am I supposed to put that number and then how to actually do it?"
 *
 * He was right and it was a hole in the middle of the plan. Every rung of the swim ladder reads
 * "your number plus 100 m", the number comes from a calibration swim, and for a month there was
 * nowhere to record it. The plan could not be followed as written.
 *
 * Moved to /swim on 2026-08-26 with the rest of the swim surface, and repointed at
 * /swim/api/baseline. See that route for the two build gates the move had to be extended into.
 *
 * The BUOY toggle is the load-bearing control here, not the distance. The reason the number was
 * unknown is that the lap data says 600 m unbroken while he remembered 200 m, and nothing in the
 * watch export records a pull buoy. A baseline swum with one between the legs is a different
 * number, so it is captured rather than assumed, and it defaults to the honest answer. */
export default function BaselineForm({
  current,
}: {
  current: { measuredOn: string; metres: number; noBuoy: boolean } | null;
}) {
  const [metres, setMetres] = useState('');
  const [noBuoy, setNoBuoy] = useState(true);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setState('saving');
    setErr(null);
    try {
      const r = await fetch('/swim/api/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metres: Number(metres), noBuoy, measuredOn: today() }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        /* The server's own words, not a generic failure. Its refusals are useful: "round down to
           the nearest 25 m" is the instruction, not an error message. */
        setErr(j?.error ? String(j.error) : `HTTP ${r.status}`);
        setState('error');
        return;
      }
      setState('saved');
    } catch (e) {
      setErr(String(e));
      setState('error');
    }
  }

  return (
    <div className="baseline">
      {current && (
        <p className="ex-cue">
          <b>Your number is {current.metres} m</b>, set {current.measuredOn}
          {current.noBuoy ? ', no buoy' : ', WITH the buoy, so the ladder below is measured from an assisted swim'}.
          Swim it again whenever it stops being true.
        </p>
      )}
      <div className="baseline-row">
        <label className="baseline-field">
          <span className="baseline-k">Distance, rounded down</span>
          <input
            type="number"
            inputMode="numeric"
            step={25}
            min={25}
            placeholder="e.g. 400"
            value={metres}
            onChange={(e) => setMetres(e.target.value)}
          />
        </label>
        <label className="baseline-check">
          <input type="checkbox" checked={noBuoy} onChange={(e) => setNoBuoy(e.target.checked)} />
          <span>Buoy stayed on the deck</span>
        </label>
      </div>
      <button
        type="button"
        className="baseline-save"
        disabled={!metres || state === 'saving'}
        onClick={save}
      >
        {state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved. Reload to see the ladder' : 'Save my number'}
      </button>
      {err && <p className="ex-cue baseline-err">{err}</p>}
    </div>
  );
}
