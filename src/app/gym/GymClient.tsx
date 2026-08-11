'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Program, Day, DayKey, Exercise, Alt, WarmupItem, CooldownItem } from '@/lib/gym/types';
import type { Suggestion, LastSession } from '@/lib/gym/progression';
import type { NextUp } from '@/lib/gym/cycle';
import {
  DAY_ORDER, BUDGETS, budgetedBlocks, exType, parseTargetReps, restSeconds,
  effectiveExercise, PLATE_IDS, plateMath, warmupRamp,
} from '@/lib/gym/program-shared';

interface Props {
  program: Program;
  warmups: { lower: WarmupItem[]; upper: WarmupItem[] };
  cooldowns: Record<string, CooldownItem>;
  rirGuide: { rir: string; desc: string; highlight?: boolean }[];
  nextUp: NextUp;
}

interface SetEntry {
  weight: string;
  reps: string;
  rir: string;
  done: boolean;
}

const todayDate = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default function GymClient({ program, warmups, cooldowns, rirGuide, nextUp }: Props) {
  const [activeDay, setActiveDay] = useState<DayKey>(nextUp.nextDay);
  const [budget, setBudget] = useState<number | null>(null);
  const [swaps, setSwaps] = useState<Record<string, Alt>>({});
  const [sets, setSets] = useState<Record<string, SetEntry[]>>({});
  const [plan, setPlan] = useState<Record<string, { last: LastSession | null; suggestion: Suggestion }>>({});
  const [openAlts, setOpenAlts] = useState<Set<string>>(new Set());
  const [timer, setTimer] = useState<{ label: string; targetEnd: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const day: Day = program.days[activeDay];
  const date = todayDate();

  const blocks = useMemo(() => budgetedBlocks(day, budget), [day, budget]);

  const effOf = useCallback((ex: Exercise) => effectiveExercise(ex, swaps[ex.id]), [swaps]);

  // ---- rest timer: wall-clock target, same fix as gym.html (2026-08-10). A throttled/suspended
  // setInterval on a locked phone just means the NEXT tick recomputes correctly from Date.now(),
  // instead of a counter having silently stalled. `remaining` is real state, set only from inside
  // effects/callbacks (never computed from Date.now() during render, which React 19 flags as
  // impure) — startTimer and the tick effect are the only writers. ----
  const [remaining, setRemaining] = useState(0);
  const vibratedRef = useRef(false);

  const startTimer = useCallback((label: string, seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    vibratedRef.current = false;
    const targetEnd = Date.now() + seconds * 1000;
    setTimer({ label, targetEnd });
    setRemaining(seconds);
  }, []);
  const dismissTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(null);
  }, []);

  useEffect(() => {
    if (!timer) return;
    const tick = () => setRemaining(Math.max(0, Math.round((timer.targetEnd - Date.now()) / 1000)));
    tick();
    timerRef.current = setInterval(tick, 1000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [timer]);

  useEffect(() => {
    if (timer && remaining === 0 && !vibratedRef.current) {
      vibratedRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }, [remaining, timer]);

  // ---- load suggestions + hydrate today's already-logged sets, on day change ----
  useEffect(() => {
    let cancelled = false;
    const exercises = blocks.flatMap((b) =>
      b.exercises.filter((e) => e.log).map((e) => {
        const eff = effOf(e);
        return { id: eff.id, targetReps: parseTargetReps(eff.reps), type: exType(eff), increment: eff.increment };
      }),
    );
    if (exercises.length) {
      postJson('/gym/api/plan', { date, exercises })
        .then((data) => {
          if (cancelled) return;
          const byId: typeof plan = {};
          for (const ex of data.exercises || []) byId[ex.id] = { last: ex.last, suggestion: ex.suggestion };
          setPlan((prev) => ({ ...prev, ...byId }));
        })
        .catch(() => {});
    }
    postJson('/gym/api/session', { date })
      .then((data) => {
        if (cancelled || !data.sets) return;
        setSets((prev) => {
          const next = { ...prev };
          for (const s of data.sets as { exercise_id: string; set_idx: number; weight: number | null; reps: number | null; done: boolean }[]) {
            const arr = (next[s.exercise_id] = next[s.exercise_id] ? [...next[s.exercise_id]!] : []);
            arr[s.set_idx - 1] = {
              weight: s.weight != null ? String(s.weight) : '',
              reps: s.reps != null ? String(s.reps) : '',
              rir: '',
              done: !!s.done,
            };
            next[s.exercise_id] = arr;
          }
          return next;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay]);

  function getSet(effId: string, idx: number): SetEntry {
    return sets[effId]?.[idx] ?? { weight: '', reps: '', rir: '', done: false };
  }

  function updateSet(ex: Exercise, effId: string, idx: number, patch: Partial<SetEntry>) {
    setSets((prev) => {
      const arr = prev[effId] ? [...prev[effId]!] : [];
      arr[idx] = { ...getSet(effId, idx), ...patch };
      return { ...prev, [effId]: arr };
    });
  }

  function autosave(ex: Exercise, effId: string, idx: number, entry: SetEntry) {
    const p = plan[effId];
    void postJson('/gym/api/set', {
      date, day: activeDay, dayTitle: day.title,
      exerciseId: effId, exerciseName: ex.name, setIdx: idx + 1,
      weight: entry.weight === '' ? null : Number(entry.weight),
      reps: entry.reps === '' ? null : Number(entry.reps),
      rir: entry.rir === '' ? null : Number(entry.rir),
      done: entry.done,
      swappedFrom: swaps[ex.id] ? ex.id : null,
      suggW: p?.suggestion.weight ?? null,
      suggR: p?.suggestion.reps ?? null,
    }).catch(() => {});
  }

  function toggleDone(ex: Exercise, effId: string, idx: number) {
    const entry = { ...getSet(effId, idx), done: !getSet(effId, idx).done };
    updateSet(ex, effId, idx, entry);
    autosave(ex, effId, idx, entry);
    if (entry.done) {
      const secs = restSeconds(effOf(ex).rest);
      startTimer(ex.name, secs);
    }
  }

  function swapExercise(originalId: string, alt: Alt) {
    setSwaps((prev) => ({ ...prev, [originalId]: alt }));
    setOpenAlts((prev) => { const n = new Set(prev); n.delete(originalId); return n; });
  }
  function revertSwap(originalId: string) {
    setSwaps((prev) => { const n = { ...prev }; delete n[originalId]; return n; });
  }
  function toggleAltPicker(id: string) {
    setOpenAlts((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const totals = useMemo(() => {
    let total = 0, done = 0;
    for (const b of blocks) {
      for (const ex of b.exercises) {
        if (!ex.log) continue;
        const eff = effOf(ex);
        total += eff.sets;
        for (let i = 0; i < eff.sets; i++) if (getSet(eff.id, i).done) done++;
      }
    }
    return { total, done };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, sets, swaps]);

  async function finishWorkout() {
    await postJson('/gym/api/finish', { date, day: activeDay }).catch(() => {});
    setFinished(true);
  }

  const warmupList = warmups[day.warmup] || [];
  const cooldownList = day.cooldown.map((k) => cooldowns[k]).filter(Boolean) as CooldownItem[];

  /* The program runs on a rolling cycle, not the calendar: computeNextUp() picks the next day from
   * what was actually logged. So the tabs said "Monday / Tuesday / Thursday / Friday" while the app
   * selected "Thursday" on a Tuesday, which is two true things that read as a contradiction.
   *
   * The split name is DERIVED from the day's own title rather than added as a second field, because
   * a hand-kept short name is exactly the kind of duplicate string that drifts from what it labels.
   * "Lower B — Hinge" becomes "Lower B". */
  function splitName(d: Day): string {
    const head = d.title.split(/\s[—–-]\s/)[0]?.trim();
    return head || d.name;
  }

  /* How to actually run a block, derived from its type. Nothing in the UI distinguished a superset
   * from a straight block, so two exercises sharing one rest window looked identical to two done
   * in sequence. The data always knew (validate.mjs enforces exactly 2 per superset/pair); the
   * screen just never said it. */
  function howToRun(block: { type: string; exercises: unknown[] }): string | null {
    if (block.exercises.length < 2) return null;
    if (block.type === 'superset' || block.type === 'pair') {
      return 'Superset: alternate the two, rest once after both.';
    }
    if (block.type === 'main') return 'Do the second between sets of the first.';
    return null;
  }

  return (
    <>
      <div className="tabs">
        {DAY_ORDER.map((k) => (
          <button key={k} className={`tab${k === activeDay ? ' on' : ''}`} onClick={() => setActiveDay(k)}>
            {splitName(program.days[k])}
          </button>
        ))}
      </div>

      <div className="count" style={{ marginTop: 22 }}>{day.title}</div>
      <p className="lede" style={{ marginTop: 4 }}>{day.desc} · {day.time}</p>

      <div className="budgets">
        <span className="quiet" style={{ alignSelf: 'center', marginRight: 4 }}>I have</span>
        {BUDGETS.map((m) => (
          <button key={m} className={budget === m ? 'on' : ''} onClick={() => setBudget(budget === m ? null : m)}>{m}</button>
        ))}
        <button className={budget === null ? 'on' : ''} onClick={() => setBudget(null)}>Full</button>
      </div>

      <div className="progress-row">
        <span>{totals.done}/{totals.total} sets</span>
        {nextUp.streak > 0 && <span>{nextUp.streak}-day streak{nextUp.restNudge ? ' — consider a rest day' : ''}</span>}
      </div>

      {/* Open by default. Collapsed, these read as missing: you are holding a phone in a gym, not
        * browsing, and a closed disclosure is a thing you do not know is there. Reported lost on
        * 2026-08-11 when both were present the whole time. */}
      {warmupList.length > 0 && (
        <details className="collapse" style={{ marginTop: 18 }} open>
          <summary>Warmup ({warmupList.length} min)</summary>
          {warmupList.map((w) => (
            <div className="warm-item" key={w.name}>
              <div className="name">{w.name}</div>
              <div className="cue">{w.cue}</div>
            </div>
          ))}
        </details>
      )}

      {blocks.map((block, bi) => (
        <div className={`block${block.type === 'superset' || block.type === 'pair' ? ' tied' : ''}`} key={bi}>
          <div className="block-label">{block.label} <span className="tag">{block.tag}</span></div>
          {howToRun(block) && <div className="block-how">{howToRun(block)}</div>}
          {block.exercises.map((ex) => {
            const swap = swaps[ex.id];
            const eff = effOf(ex);
            const p = plan[eff.id];
            const showPlate = PLATE_IDS.has(eff.id);
            const targetW = p?.suggestion.weight ?? null;
            const ramp = block.type === 'main' && targetW != null ? warmupRamp(targetW) : null;
            return (
              <div className="ex" key={ex.id}>
                <div className="ex-name">{eff.name}</div>
                <div className="ex-meta">{eff.sets}×{eff.reps} · {eff.rest} rest</div>
                <div className="ex-cue">{eff.cue}</div>
                {swap && <div className="swapped-note">Swapped from {ex.name} · <button className="swap-toggle" onClick={() => revertSwap(ex.id)}>revert</button></div>}

                {showPlate && targetW != null && (
                  <div className="ex-sub">{plateMath(targetW)}</div>
                )}
                {ramp && <div className="ex-sub">Ramp: {ramp}</div>}

                {p?.suggestion && (
                  <div className="ex-suggest">
                    {p.suggestion.weight != null ? `${p.suggestion.weight} lb × ${p.suggestion.reps}` : `× ${p.suggestion.reps}`}
                    <span className="ex-suggest-why">{p.suggestion.reason}</span>
                  </div>
                )}

                {ex.log && (
                  <div className="sets">
                    {Array.from({ length: eff.sets }).map((_, i) => {
                      const entry = getSet(eff.id, i);
                      return (
                        <div className="set-row" key={i}>
                          <span className="n">{i + 1}</span>
                          <input
                            type="number" inputMode="decimal" placeholder={eff.bodyweight ? 'BW' : 'lb'}
                            value={entry.weight}
                            disabled={!!eff.bodyweight}
                            onChange={(e) => updateSet(ex, eff.id, i, { weight: e.target.value })}
                            onBlur={() => autosave(ex, eff.id, i, getSet(eff.id, i))}
                          />
                          <input
                            type="number" inputMode="decimal" placeholder={eff.timed ? 's' : 'reps'}
                            value={entry.reps}
                            onChange={(e) => updateSet(ex, eff.id, i, { reps: e.target.value })}
                            onBlur={() => autosave(ex, eff.id, i, getSet(eff.id, i))}
                          />
                          <button
                            type="button" aria-label="mark set done"
                            className={`done-toggle${entry.done ? ' on' : ''}`}
                            onClick={() => toggleDone(ex, eff.id, i)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {ex.alts && ex.alts.some((a) => a.id !== eff.id) && (
                  <div className="ex-swap">
                    <button className="swap-toggle" onClick={() => toggleAltPicker(ex.id)}>
                      {swap ? 'Pick a different step/alternative ▾' : 'Not available? Pick alternative ▾'}
                    </button>
                    {openAlts.has(ex.id) && (
                      <div className="swap-list">
                        {ex.alts.filter((a) => a.id !== eff.id).map((a) => (
                          <button className="swap-opt" key={a.id} onClick={() => swapExercise(ex.id, a)}>
                            <div className="swap-opt-name">{a.name}</div>
                            <div className="swap-opt-cue">{a.cue}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {cooldownList.length > 0 && (
        <details className="collapse" style={{ marginTop: 24 }} open>
          <summary>Cooldown</summary>
          {cooldownList.map((c) => (
            <div className="warm-item" key={c.name}>
              <div className="name">{c.name}</div>
              <div className="cue">{c.cue}</div>
            </div>
          ))}
        </details>
      )}

      <details className="collapse">
        <summary>RIR guide</summary>
        {rirGuide.map((r) => (
          <div className="warm-item" key={r.rir}>
            <div className="name">RIR {r.rir}</div>
            <div className="cue">{r.desc}</div>
          </div>
        ))}
      </details>

      <div style={{ marginTop: 30, marginBottom: 30 }}>
        {finished ? (
          <p className="lede">Session saved. {totals.done}/{totals.total} sets logged.</p>
        ) : (
          <button className="primary" style={{ width: '100%' }} onClick={finishWorkout}>
            Finish workout ({totals.done}/{totals.total})
          </button>
        )}
      </div>

      <div className={`timer-bar${timer ? '' : ' hidden'}`}>
        <div>
          <div className="timer-label">{timer?.label} rest</div>
          <div className={`timer-time${remaining === 0 ? ' go' : ''}`}>
            {remaining === 0 ? 'GO' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
          </div>
        </div>
        <button onClick={dismissTimer}>Skip</button>
      </div>
    </>
  );
}
