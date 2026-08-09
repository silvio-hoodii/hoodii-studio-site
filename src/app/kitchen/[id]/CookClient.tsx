'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Recipe, StepUse } from '@/lib/kitchen/types';

interface PrepRow {
  ref: string; display: string; qty: number | null; unit: string | null;
  prep: string | null; missing: boolean; altText: string | null;
  optional?: boolean;
  betterWith?: { display: string; stock?: string; why: string } | null;
}

const FRAC: [number, string][] = [
  [0.5, '1/2'], [0.25, '1/4'], [0.75, '3/4'], [1 / 3, '1/3'], [2 / 3, '2/3'], [0.125, '1/8'],
];

function niceNum(n: number): string {
  const whole = Math.floor(n);
  const rest = n - whole;
  if (rest < 0.02) return String(whole);
  for (const [v, s] of FRAC) {
    if (Math.abs(rest - v) < 0.02) return whole ? `${whole} ${s}` : s;
  }
  return String(Math.round(n * 100) / 100);
}

function amount(qty: number | null | undefined, unit: string | null | undefined): string {
  if (qty == null) return '';
  if (unit === 'g' || unit === 'ml') return `${Math.round(qty)} ${unit}`;
  if (!unit || unit === 'each') return niceNum(qty);
  return `${niceNum(qty)} ${unit}`;
}

const asUse = (u: string | StepUse): StepUse => (typeof u === 'string' ? { ref: u } : u);

export default function CookClient({
  recipe, prep, gear, consumable, notes,
}: {
  recipe: Recipe;
  prep: PrepRow[];
  gear: { id: string; name: string }[];
  consumable: { stock: string; display: string }[];
  notes: { at: string; note: string; rating: string | null; step: number | null; kind: string | null }[];
}) {
  // -1 is the prep screen. Steps are 0-indexed from there.
  const [i, setI] = useState(-1);
  const [done, setDone] = useState(false);
  const total = recipe.steps.length;
  const byRef = useMemo(() => Object.fromEntries(prep.map((p) => [p.ref, p])), [prep]);

  if (done) {
    return <Debrief recipe={recipe} consumable={consumable} />;
  }

  /* ---------------- prep screen ---------------- */
  if (i < 0) {
    return (
      <div className="wrap">
        <Link href="/kitchen" className="eyebrow" style={{ textDecoration: 'none' }}>← Kitchen</Link>
        <h1>{recipe.name}</h1>
        {recipe.why && <p className="lede">{recipe.why}</p>}

        <div className="meta" style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 14, color: 'var(--ink-faint)' }}>
          {recipe.time.note && <span>{recipe.time.note}</span>}
          {recipe.serves.proteinPerUnit ? (
            <span>{recipe.serves.proteinPerUnit} g protein per {recipe.serves.unit}</span>
          ) : null}
          <span>{total} steps</span>
        </div>

        {/* Trust, stated before he turns anything on. Not a footnote. */}
        {recipe.provenance && (
          <div className={`box ${recipe.provenance.tier === 'authored' ? 'warn' : 'look'}`} style={{ marginTop: 18 }}>
            <span className="k">
              {recipe.provenance.tier === 'authored'
                ? 'No source · treat as a draft'
                : recipe.provenance.tier === 'adapted' ? 'Adapted from a real recipe' : 'Sourced'}
            </span>
            {recipe.provenance.statement}
            {recipe.provenance.sources.map((s, k) => (
              <div key={k} style={{ marginTop: 6 }}>
                {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.name ?? s.url}</a> : <b>{s.name}</b>}
                {s.note ? <> · {s.note}</> : null}
              </div>
            ))}
            {!recipe.provenance.cooked && (
              <div style={{ marginTop: 6 }}>
                Nobody has cooked these exact quantities yet. If something is off, that is worth
                writing in the debrief.
              </div>
            )}
          </div>
        )}

        {notes.length > 0 && (
          <div className="box look" style={{ marginTop: 18 }}>
            <span className="k">Last time</span>
            {notes.map((n, k) => (
              <div key={k} style={{ marginBottom: k < notes.length - 1 ? 8 : 0 }}>
                {n.step ? <b>Step {n.step}: </b> : null}{n.note}
              </div>
            ))}
          </div>
        )}

        <hr className="divider" />
        <p className="count">Get this out first</p>
        <div className="amounts">
          {prep.map((p) => (
            <div className="row" key={p.ref}>
              <span className="qty">{amount(p.qty, p.unit) || '—'}</span>
              <span className="nm">
                {p.display}
                {p.prep ? <span style={{ color: 'var(--ink-faint)' }}>, {p.prep}</span> : null}
                {p.missing ? <b style={{ color: 'var(--accent)' }}> · you do not have this</b> : null}
              </span>
            </div>
          ))}
        </div>

        {prep.some((p) => p.missing && p.altText) && (
          <div className="box warn">
            <span className="k">What changes</span>
            {prep.filter((p) => p.missing && p.altText).map((p) => <div key={p.ref}>{p.altText}</div>)}
          </div>
        )}

        {/* Cookable as-is, but the dish wants something better. Deliberately not a blocker and
            deliberately not hidden: three shopping trips went by without this ever being said. */}
        {prep.some((p) => p.betterWith) && (
          <div className="box look">
            <span className="k">Better with</span>
            {prep.filter((p) => p.betterWith).map((p) => (
              <div key={p.ref} style={{ marginBottom: 6 }}>
                <b>{p.betterWith!.display}</b> instead of {p.display.split(',')[0]}. {p.betterWith!.why}
              </div>
            ))}
          </div>
        )}

        <p className="count" style={{ marginTop: 22 }}>And this gear</p>
        <p className="quiet">{gear.map((g) => g.name).join(' · ')}</p>
        <p className="quiet" style={{ marginTop: 8, fontStyle: 'italic' }}>
          Both lists above are built from what the steps actually use, so nothing can be missing from them.
        </p>

        <div className="nav">
          <button className="primary" onClick={() => setI(0)}>Start cooking →</button>
        </div>
      </div>
    );
  }

  /* ---------------- one step, one screen ---------------- */
  const s = recipe.steps[i];
  if (!s) return null;
  const uses = (s.uses ?? [])
    .map(asUse)
    .flatMap((u) => {
      const p = byRef[u.ref];
      return p ? [{ use: u, p }] : [];
    });

  return (
    <div className="wrap">
      <div className="dots">
        {recipe.steps.map((_, k) => <i key={k} className={k <= i ? 'on' : ''} />)}
      </div>
      <div className="eyebrow">Step {i + 1} of {total}{s.minutes ? ` · about ${s.minutes} min` : ''}</div>

      <p className="step">{s.text}</p>

      {/* The amounts for THIS step, on THIS screen. The 2026-08-02 debrief: "by the time I needed
          to use the cottage cheese, the instruction was put the cottage cheese in and I didn't
          know how much". */}
      {uses.length > 0 && (
        <div className="amounts">
          {uses.map(({ use, p }) => {
            // amount 0 means the step handles the thing without consuming a share of it: tipping
            // cooked peppers onto a plate, stirring eggs already in the pan. Showing the full
            // quantity there would read as "add another cup".
            const q =
              use.amount === 0 ? ''
              : use.amount != null ? amount(use.amount, use.unit ?? p.unit)
              : amount(p.qty, p.unit);
            return (
              <div className="row" key={use.ref}>
                <span className="qty">{q || 'the'}</span>
                <span className="nm">{p.display}</span>
              </div>
            );
          })}
        </div>
      )}

      {s.heat?.target && (
        <div className="box heat">
          <span className="k">Heat</span>
          {s.heat.target}
          {s.heat.recheck ? <div style={{ marginTop: 6, opacity: 0.8 }}>Check again: {s.heat.recheck}</div> : null}
        </div>
      )}
      {s.heat?.tempF && (
        <div className="box heat"><span className="k">Heat</span>{s.heat.tempF}&deg;F</div>
      )}

      {s.doneness?.test && (
        <div className="box done"><span className="k">How you know it is ready</span>{s.doneness.test}</div>
      )}

      {s.warn && <div className="box warn"><span className="k">Careful</span>{s.warn}</div>}
      {s.look && <div className="box look"><span className="k">Why</span>{s.look}</div>}

      <div className="nav">
        <button onClick={() => setI(i - 1)}>←</button>
        {i < total - 1 ? (
          <button className="primary" onClick={() => setI(i + 1)}>Next</button>
        ) : (
          <button className="primary" onClick={() => setDone(true)}>Done cooking</button>
        )}
      </div>
    </div>
  );
}

/* ---------------- debrief ---------------- */

function Debrief({
  recipe, consumable,
}: {
  recipe: Recipe;
  consumable: { stock: string; display: string }[];
}) {
  const [rating, setRating] = useState('');
  const [note, setNote] = useState('');
  const [ranOut, setRanOut] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await fetch('/kitchen/api/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish: recipe.id, dishName: recipe.name, rating, note, ranOut }),
      });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="wrap">
        <div className="eyebrow">Logged</div>
        <h1>Done.</h1>
        <p className="lede">
          The kitchen knows you cooked this, so it will stop suggesting it and the ingredients you
          used have come off their clocks.
        </p>
        <div className="nav"><Link className="btn primary" href="/kitchen">Back to the kitchen</Link></div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="eyebrow">Just cooked</div>
      <h1>{recipe.name}</h1>
      <p className="lede">Thirty seconds now makes this better next time. Skip it if you cannot be bothered.</p>

      <p className="count" style={{ marginTop: 22 }}>How did it go?</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {([['nailed', 'Nailed it'], ['fine', 'Fine'], ['wrong', 'Went wrong']] as const).map(([v, label]) => (
          <button
            key={v}
            className={rating === v ? 'primary' : ''}
            style={{ flex: 1 }}
            onClick={() => setRating(v)}
          >{label}</button>
        ))}
      </div>

      {consumable.length > 0 && (
        <>
          <p className="count" style={{ marginTop: 24 }}>Did anything run out?</p>
          <p className="quiet" style={{ marginBottom: 10 }}>
            Only tap what is actually finished. Skipping this is fine, it just means the kitchen keeps
            assuming you still have some.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {consumable.map((c) => (
              <button
                key={c.stock}
                className={ranOut.includes(c.stock) ? 'primary' : ''}
                style={{ flex: '0 1 auto', fontSize: 15, padding: '10px 14px' }}
                onClick={() =>
                  setRanOut((r) => (r.includes(c.stock) ? r.filter((x) => x !== c.stock) : [...r, c.stock]))
                }
              >{c.display}</button>
            ))}
          </div>
        </>
      )}

      <p className="count" style={{ marginTop: 24 }}>Anything to change next time?</p>
      <textarea
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Crust stuck. 22 min was too long. Needed more salt."
      />

      <div className="nav">
        <button className="primary" disabled={busy} onClick={send}>
          {busy ? 'Saving…' : 'Save and finish'}
        </button>
      </div>
    </div>
  );
}
