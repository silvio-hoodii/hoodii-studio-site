'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Recipe, StepUse } from '@/lib/kitchen/types';
import {
  subscribe, readTimers, serverTimers, startTimer, clearTimer, remaining,
} from '@/lib/kitchen/timers';
import { TimerButton } from '../TimerRail';

interface PrepRow {
  ref: string; display: string; qty: number | null; unit: string | null;
  prep: string | null; missing: boolean; altText: string | null;
  insteadOf?: string | null;
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

/* Law 2 of .agents/ENGINEERING.md: pin the version at the point of use.
 *
 * The incident, 2026-08-11. He cooked from build 11f while 11g, 11h and 11i were deployed over the
 * top of it, twice after I had promised not to touch it. His words: "We should have a law where
 * everything that we discuss is the same versions."
 *
 * True pinning would mean serving the build he started on, which needs every historical build kept
 * and is not worth the storage for one cook. This does the achievable and more useful half: it
 * remembers which build he started this dish on and SAYS SO when the words change underneath him.
 * A silent change is the dangerous one, because he then follows instructions neither of us can name.
 *
 * `sessionStorage` on purpose. It survives a reload and a timer-chip navigation, and it clears when
 * the tab closes, which is the right lifetime for "am I still cooking this".
 *
 * Named useBuildWatch rather than checkBuild because lint enforces rules-of-hooks on use* names and
 * this genuinely is one. */
const noopSubscribe = () => () => {};

function useBuildWatch(id: string, build: string): string | null {
  const key = `kos.cook.${id}`;

  /* Read through useSyncExternalStore rather than setState-in-an-effect, which lint correctly
   * rejects: that pattern renders once with the wrong answer and then again with the right one. This
   * is the same API the timer rail in this file already uses, and it is React's designed answer for
   * reading external mutable state during render. sessionStorage fires no events, so subscribe is a
   * no-op; the snapshot is a primitive so it compares by value and cannot loop. */
  const startedOn = useSyncExternalStore(
    noopSubscribe,
    () => {
      try { return sessionStorage.getItem(key); } catch { return null; }
    },
    () => null,
  );

  // Writing is a side effect and sets no state, so it belongs here and lint is happy.
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, build);
    } catch {
      // Private mode or storage disabled. A missing warning beats a crash mid-cook.
    }
  }, [key, build]);

  return startedOn && startedOn !== build ? startedOn : null;
}

function BuildChanged({ from, to }: { from: string; to: string }) {
  return (
    <div className="box warn" style={{ marginTop: 10 }}>
      <span className="k">These instructions changed while you were cooking</span>
      <div>
        You started this on <b>{from}</b> and you are now reading <b>{to}</b>. Something was edited
        underneath you, so a step may not say what it said when you read it. If a number looks
        different from the one you were working to, the one on screen is the current one.
      </div>
    </div>
  );
}

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
  const params = useSearchParams();
  const router = useRouter();
  const deep = Number(params.get('step'));
  const [i, setI] = useState(Number.isFinite(deep) && deep > 0 ? deep - 1 : -1);

  /* THE STEP LIVES IN THE URL.
   *
   * KitchenOS/DESIGN.md states it as a rule: refresh must not lose your place. The rebuild lost it, so
   * a reload mid-cook, or the tab being evicted while he prepped something, dropped him back on the
   * prep screen with a pan already on. Browser Back also left the recipe entirely from step 14, because
   * no history entry had ever been pushed.
   *
   * `replace` rather than `push`, so fourteen steps do not become fourteen entries to escape through,
   * and `scroll: false` because the page already scrolls itself on a step change. useState stays as the
   * render source; this only mirrors it somewhere durable. */
  const goStep = (next: number) => {
    setI(next);
    const q = next < 0 ? '' : `?step=${next + 1}`;
    router.replace(`/kitchen/${recipe.id}${q}`, { scroll: false });
  };
  const [done, setDone] = useState(false);
  const total = recipe.steps.length;
  const byRef = useMemo(() => Object.fromEntries(prep.map((p) => [p.ref, p])), [prep]);

  // Arriving from a timer chip: same route, new ?step=, so this component is reused rather than
  // remounted and the initial state above never runs again. Adjusted during render rather than in
  // an effect, which is React's own answer for state derived from a prop and avoids the extra
  // committed render that setting it from useEffect would cost.
  const [seenDeep, setSeenDeep] = useState(deep);
  if (deep !== seenDeep) {
    setSeenDeep(deep);
    if (Number.isFinite(deep) && deep > 0) setI(deep - 1);
  }

  const timers = useSyncExternalStore(subscribe, readTimers, serverTimers);
  const buildDrift = useBuildWatch(recipe.id, recipe.build);

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

        {/* Where this recipe departs from the sources it cites, and why. Without it "adapted" is
            just a nicer-sounding word for "an agent wrote it": the tier says a real recipe exists
            and this is the part that shows what was actually done with it. */}
        {recipe.deviations?.length ? (
          <details className="devs">
            <summary>What was changed from the sources, and why ({recipe.deviations.length})</summary>
            {recipe.deviations.map((d, k) => (
              <div className="dev" key={k}>
                <b>{d.what}</b>
                <span>{d.why}</span>
              </div>
            ))}
          </details>
        ) : null}

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
              <span className="qty">{amount(p.qty, p.unit)}</span>
              <span className="nm">
                {p.display}
                {p.prep ? <span style={{ color: 'var(--ink-faint)' }}>, {p.prep}</span> : null}
                {/* Why an unfamiliar thing is on the list, said here rather than only inside the
                    collapsed deviations block. See Ingredient.insteadOf. */}
                {p.insteadOf ? (
                  <span style={{ color: 'var(--ink-faint)' }}> · stands in for {p.insteadOf}</span>
                ) : null}
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
        {/* The version, on screen, so a conversation about a step can name which text it means. Law 2:
            "We should have a law where everything that we discuss is the same versions." */}
        <p className="quiet" style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          build {recipe.build}
        </p>

        <div className="nav">
          <button className="primary" onClick={() => goStep(0)}>Start cooking →</button>
        </div>
      </div>
    );
  }

  /* ---------------- one step, one screen ---------------- */
  const s = recipe.steps[i];
  if (!s) return null;
  /* The amounts table for THIS step. It is a table of NUMBERS, so a reference with no number does
   * not belong in it.
   *
   * `amount: 0` means the step handles something without consuming a share of it: stirring eggs
   * already in the pan, tipping back peppers set aside earlier, or measuring things out before any
   * heat goes on. Those rows used to render the word "the" in the quantity column, which on
   * 2026-08-09 produced a step 2 reading "the butter / the garlic / the chicken stock / the lemon
   * juice / the capers" and he asked, correctly, what the point of saying "the" five times was.
   *
   * They are dropped instead. Closure still holds, because closure is the validator's job and it
   * reads the data. The step text always names the thing anyway. */
  const rows = (s.uses ?? [])
    .map(asUse)
    .flatMap((u) => {
      const p = byRef[u.ref];
      if (!p || u.amount === 0) return [];
      const qty =
        u.amount != null ? amount(u.amount, u.unit ?? p.unit) : amount(p.qty, p.unit);
      if (!qty) return [];
      return [{ ref: u.ref, qty, display: p.display }];
    });

  const timerId = `${recipe.id}:${i + 1}`;
  const mine = timers.find((t) => t.id === timerId);

  return (
    <div className="wrap">
      {/* Tappable. "I have to click until I get back" was a real complaint on 2026-08-09, and the
          progress bar was already sitting there being decorative. */}
      <div className="dots">
        {recipe.steps.map((_, k) => (
          <button
            key={k}
            className={k <= i ? 'on' : ''}
            aria-label={`Go to step ${k + 1}`}
            onClick={() => goStep(k)}
          />
        ))}
      </div>
      <div className="steptop">
        <Link href="/kitchen" className="eyebrow" style={{ textDecoration: 'none' }}>← Kitchen</Link>
        <span className="eyebrow">Step {i + 1} of {total}{s.minutes ? ` · about ${s.minutes} min` : ''}</span>
      </div>
      {buildDrift && <BuildChanged from={buildDrift} to={recipe.build} />}

      <p className="step">{s.text}</p>

      {/* Any step with a duration can be put on the clock. The countdown then lives in the rail at
          the top of every kitchen screen and carries this step's own text and doneness test with
          it, so finding out whether it is ready never means walking back through the recipe. */}
      {s.minutes ? (
        <TimerButton
          minutes={s.minutes}
          running={!!mine}
          left={mine ? remaining(mine) : 0}
          onClear={() => clearTimer(timerId)}
          onStart={() =>
            startTimer({
              recipeId: recipe.id,
              recipeName: recipe.name,
              step: i + 1,
              stepOf: total,
              label: s.timerLabel ?? `${recipe.name.split(':').pop()!.trim()}, step ${i + 1}`,
              seconds: s.minutes! * 60,
              text: s.text,
              doneness: s.doneness?.test,
              heat: s.heat?.target,
            })
          }
        />
      ) : null}

      {/* The amounts for THIS step, on THIS screen. The 2026-08-02 debrief: "by the time I needed
          to use the cottage cheese, the instruction was put the cottage cheese in and I didn't
          know how much". */}
      {rows.length > 0 && (
        <div className="amounts">
          {rows.map((r) => (
            <div className="row" key={r.ref}>
              <span className="qty">{r.qty}</span>
              <span className="nm">{r.display}</span>
            </div>
          ))}
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

      {/* Keyed on the step so moving on gives a clean control. A note half-typed about step 6 must
          never arrive attached to step 7. */}
      <StepNote key={i} dish={recipe.name} step={i + 1} stepOf={total} stepText={s.text} />

      <div className="nav">
        <button aria-label="Previous step" onClick={() => goStep(i - 1)}>←</button>
        {i < total - 1 ? (
          <button className="primary" onClick={() => goStep(i + 1)}>Next</button>
        ) : (
          <button className="primary" onClick={() => setDone(true)}>Done cooking</button>
        )}
      </div>
    </div>
  );
}

/* Why a save can fail at all, and why it must never fail quietly.
 *
 * Found 2026-08-11, mid-cook. He typed three notes on the live site, pressed Send, was told they
 * were saved, and none of them existed. Both write buttons did `await fetch(...)` and then
 * `setSent(true)` unconditionally. `fetch` only rejects on a network error, never on an HTTP status,
 * so the 401 from `proxy.ts` resolved happily and the UI reported success.
 *
 * The 401 itself is the other half. Every page went public on 2026-08-11, so nothing ever prompts a
 * login, so on any device that has not manually visited /kitchen/login every write fails. He had no
 * way to know a login existed: "There's no login so what do you mean there's no login here?"
 *
 * His text is deliberately NOT cleared on failure, and the reason to keep the gate rather than open
 * the POST is in proxy.ts: these are append-only logs everything else derives from. */
function SaveFailed({ err, onRetry }: { err: string; onRetry: () => void | Promise<void> }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  async function unlock() {
    setBusy(true);
    setWrong(false);
    try {
      const res = await fetch('/kitchen/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pw }),
      });
      if (!res.ok) { setWrong(true); return; }
      // Cookie is set. Send the thing he already typed, so unlocking and saving are one action.
      await onRetry();
    } catch {
      setWrong(true);
    } finally {
      setBusy(false);
    }
  }

  if (err !== 'locked') {
    return (
      <div className="box warn" style={{ marginTop: 10 }}>
        <span className="k">This did not save</span>
        {err === 'offline'
          ? <div>The request never reached the server. Your text is still here. Try Send again.</div>
          : <div>The server refused it ({err}). Your text is still here. Try Send again.</div>}
      </div>
    );
  }

  return (
    <div className="box warn" style={{ marginTop: 10 }}>
      <span className="k">This device cannot save yet</span>
      <div>
        Reading is open to anyone. Changing your logs is not, because everything else is worked out
        from them. Unlock this device once and it stays unlocked for a year. Your text is still here.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          type="password"
          value={pw}
          autoComplete="current-password"
          placeholder="Password"
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && pw && !busy) void unlock(); }}
          style={{ flex: '1 1 160px' }}
        />
        <button className="primary" disabled={busy || !pw} onClick={() => void unlock()} style={{ fontSize: 15 }}>
          {busy ? 'Unlocking…' : 'Unlock and save'}
        </button>
      </div>
      {wrong && <p className="changes" style={{ marginTop: 10 }}>Not that one. Nothing was lost, try again.</p>}
      <p className="quiet" style={{ marginTop: 10 }}>
        Or do it on <Link href="/kitchen/login" target="_blank">the login page</Link> and come back.
      </p>
    </div>
  );
}

/* ---------------- a note written at the stove ----------------
 *
 * The API route for this has existed since the rebuild and nothing has ever called it, so the
 * rebuild silently dropped a control the old kitchen.html had. Every useful correction this project
 * has ever made came through it: "wasn't mentioned that i would need the whites of the green
 * onions", "what baking sheet this wasn't on the list wtf". Those arrive mid-step or not at all,
 * because by the debrief screen the detail is gone. */
function StepNote({ dish, step, stepOf, stepText }: {
  dish: string; step: number; stepOf: number; stepText: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'broke' | 'confusing' | 'question'>('confusing');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* Lifted out of the button's onClick so the inline unlock can call the exact same save. */
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/kitchen/api/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish, note, step, stepOf, kind, stepText }),
      });
      if (!res.ok) { setErr(res.status === 401 ? 'locked' : `failed ${res.status}`); return; }
      setSent(true);
    } catch {
      setErr('offline');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <p className="quiet" style={{ marginBottom: 15 }}>Noted against step {step}. It will be waiting next time you open this dish.</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ fontSize: 14, padding: '8px 12px', marginBottom: 15 }}
      >Something is wrong with this step</button>
    );
  }

  return (
    <div className="box warn" style={{ marginBottom: 15 }}>
      <span className="k">About step {step}</span>
      <div style={{ display: 'flex', gap: 6, margin: '2px 0 10px', flexWrap: 'wrap' }}>
        {([
          ['broke', 'It went wrong'],
          ['confusing', 'Unclear'],
          ['question', 'I have a question'],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            className={kind === v ? 'primary' : ''}
            style={{ fontSize: 14, padding: '8px 12px', flex: '0 1 auto' }}
            onClick={() => setKind(v)}
          >{label}</button>
        ))}
      </div>
      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Say it however it comes out. Nobody else reads this."
      />
      {err && <SaveFailed err={err} onRetry={save} />}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => setOpen(false)} style={{ fontSize: 15 }}>Cancel</button>
        <button
          className="primary"
          disabled={busy || !note.trim()}
          style={{ fontSize: 15 }}
          onClick={() => void save()}
        >{busy ? 'Saving…' : 'Send'}</button>
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
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/kitchen/api/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish: recipe.id, dishName: recipe.name, rating, note, ranOut }),
      });
      // Same silent-success bug as StepNote had. A debrief is the most expensive thing to lose,
      // because by the time anyone notices, the cook is over and the detail is gone.
      if (!res.ok) { setErr(res.status === 401 ? 'locked' : `failed ${res.status}`); return; }
      setSent(true);
    } catch {
      setErr('offline');
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

      {err && <SaveFailed err={err} onRetry={send} />}

      <div className="nav">
        <button className="primary" disabled={busy} onClick={send}>
          {busy ? 'Saving…' : 'Save and finish'}
        </button>
      </div>
    </div>
  );
}
