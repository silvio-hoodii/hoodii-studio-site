'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SaveBlocked from '@/components/SaveBlocked';
import { today } from '@/lib/day';
import type { Program, Day, DayKey, Exercise, Alt, WarmupItem, CooldownItem } from '@/lib/gym/types';
import type { Suggestion, LastSession } from '@/lib/gym/progression';
import type { NextUp } from '@/lib/gym/cycle';
import type { TrainingStreak } from '@/lib/gym/week';
import {
  DAY_ORDER, dayTimeBreakdown, exType, findExercise,
  parseTargetReps, restSeconds, effectiveExercise, PLATE_IDS, plateMath, warmupRamp, splitName,
} from '@/lib/gym/program-shared';

interface Props {
  program: Program;
  warmups: { lower: WarmupItem[]; upper: WarmupItem[] };
  cooldowns: Record<string, CooldownItem>;
  rirGuide: { rir: string; desc: string; highlight?: boolean }[];
  nextUp: NextUp;
  /* Its own prop rather than a field on nextUp, because it is no longer counted off the same
     evidence. See the note on the NextUp interface in lib/gym/cycle.ts. */
  streak: TrainingStreak;
}

/* No `rir`. It was declared here, sent on every POST as null, stored in a column, and never once
 * filled: 396 logged sets, 0 with a value, because no input for it was ever built. The progression
 * engine declares the field in its own type and reads it nowhere.
 *
 * Removed rather than given an input. A third box on every set row is real friction on a phone in a
 * gym, and building the capture ahead of any demand for it is what left 1,359 French cards with one
 * review. The gym_set column stays, so nothing historical is lost and adding this back later is a
 * form field and a payload key. The RIR guide stays on the page too: it teaches the idea, which is
 * useful whether or not anything records it. */
interface SetEntry {
  weight: string;
  reps: string;
  done: boolean;
}

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* A write that failed and is still owed to the server. Keyed so that typing 40, then 45, then 47
 * into the same box queues ONE entry holding 47, not three that would replay in order. */
interface PendingWrite {
  key: string;
  url: string;
  body: unknown;
}

/* The top set of a session, which is the one number worth putting on a line.
 *
 * Weight first, reps as the tie-break, and reps alone when there is no weight: a bodyweight or
 * timed exercise progresses by count and would otherwise draw a flat line at zero. */
function topSet(sets: { weight: number | null; reps: number | null }[]): number | null {
  let best: number | null = null;
  const weighted = sets.some((s) => s.weight != null && s.weight > 0);
  for (const s of sets) {
    const v = weighted ? s.weight : s.reps;
    if (v == null) continue;
    if (best == null || v > best) best = v;
  }
  return best;
}

/* Eight sessions, one line, no text inside the drawing.
 *
 * Deliberately no axis, no labels and no numbers in the SVG. The range is stated in HTML beside it,
 * because text inside a viewBox scales with the box and /health spent this week rendering its axis
 * labels at 6.1px on a phone for exactly that reason. Fixed pixel size for the same reason: this
 * one cannot be stretched.
 *
 * It only appears from three sessions on. Two points is a line between two points, not a trend, and
 * a chart on an exercise he has done once is decoration on a screen he already found cluttered. */
function Trend({ recent }: { recent: LastSession[] }) {
  const points = [...recent]
    .reverse()
    .map((s) => topSet(s.sets))
    .filter((v): v is number => v != null);
  if (points.length < 3) return null;

  const W = 92;
  const H = 20;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1] as number);
  const first = points[0] as number;
  const latest = points[points.length - 1] as number;

  return (
    <span className="trend">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${points.length} sessions, ${first} to ${latest}`}
      >
        <path d={d} />
        <circle cx={lastX} cy={lastY} r={2.5} />
      </svg>
      {/* "flat at 10" over a line with a visible hump in it is the drawing and the caption
          disagreeing. Only the genuinely unchanging series gets called held; a series that ended
          where it started but moved in between says so and lets the line show the shape. */}
      <span className="trend-n tnum">
        {points.every((v) => v === points[0])
          ? `held at ${latest}`
          : `${first} to ${latest}`} over {points.length}
      </span>
    </span>
  );
}

/* Where a swap chosen but not yet lifted is kept.
 *
 * The DB is the record of what he DID: a set logged under an alternative carries `swapped_from`, so
 * the swap is recoverable from the log the moment one set lands. This holds the other half, the
 * minute between picking an alternative and finishing the first set of it, which no server knows
 * about. Per date, so yesterday's substitutions do not follow him into today. */
const swapKey = (date: string) => `gym:swaps:${date}`;

export default function GymClient({ program, warmups, cooldowns, rirGuide, nextUp, streak }: Props) {
  /* `todayDay` first. `nextDay` is what to train NEXT, and once today's first set lands the cycle
   * has already advanced past today, so opening on it showed a different workout with every box
   * empty. See the comment on NextUp.todayDay. */
  const [activeDay, setActiveDay] = useState<DayKey>(nextUp.todayDay ?? nextUp.nextDay);
  /* THE TIME BUDGET IS GONE, 2026-08-22, and he designed the replacement.
   *
   * It made him predict his own session before starting it, which he said he gets wrong in both
   * directions: "even if I pick 45, maybe I didn't have 45 minutes, I thought I hadn't and I didn't
   * really so I want to switch to 25." Then he noticed what the cap actually does: "what you do
   * between the full and the 25 is just you're taking out everything that comes after the main
   * lift. Why don't you just have one and I'll check everything that I will do?"
   *
   * He is right, and the ordering already encodes it. The day is one list in priority order, every
   * block always visible, and he ticks what he did. A short session is now a fact recorded after
   * the fact instead of a prediction made before it, which is also the only version that can be
   * true. budgetKeep and the chips are deleted rather than hidden. */
  const [swaps, setSwaps] = useState<Record<string, Alt>>({});
  const [sets, setSets] = useState<Record<string, SetEntry[]>>({});
  const [plan, setPlan] = useState<Record<string, { last: LastSession | null; suggestion: Suggestion; recent: LastSession[] }>>({});
  const [openAlts, setOpenAlts] = useState<Set<string>>(new Set());
  const [timer, setTimer] = useState<{ label: string; targetEnd: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Everything owed to the server, and what went wrong last. The queue is a ref because autosave
   * fires from an onBlur and must not depend on having re-rendered since the last one; the count
   * is state because the banner shows it. */
  const pendingRef = useRef<Map<string, PendingWrite>>(new Map());
  /* Only the SETS, not the finish. The banner counts what it can name, and the first version passed
   * the whole queue size next to the word "set": pressing Finish on a locked device with nothing
   * typed produced "1 set waiting to be saved" over a queue holding one finish and no sets. A
   * component built to stop the UI asserting unconfirmed things must not assert one itself. */
  const [pendingSets, setPendingSets] = useState(0);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [finishBlocked, setFinishBlocked] = useState(false);
  const [note, setNote] = useState('');
  const [notesSaved, setNotesSaved] = useState(0);
  /* Every note is its own queue key. A set upserts on (date, exercise, index) so re-typing corrects
   * it; two notes on one evening are two separate things he said and neither replaces the other. */
  const noteSeq = useRef(0);
  const finishWantedRef = useRef(false);
  /* Which ending he chose, so a finish that lands LATER through the banner's unlock is still the
   * ending he picked rather than a plain finish. Same reasoning as finishWantedRef above. */
  const endingRef = useRef<'finished' | 'cutshort'>('finished');
  const finishLandedRef = useRef(false);
  const countSets = () => [...pendingRef.current.keys()].filter((k) => k.startsWith('set:')).length;

  /* The one place a write leaves this component.
   *
   * Was: `void postJson(...).catch(() => {})` for every set and `await ... .catch(() => {})` for
   * the finish, which is why a locked phone logged a whole session into nothing and then said
   * "Session saved." Returning a boolean rather than throwing is deliberate: every caller has to
   * decide what to render, and a promise nobody awaited is exactly how this got shipped. */
  const write = useCallback(async (key: string, url: string, body: unknown): Promise<boolean> => {
    const queue = (reason: string) => {
      pendingRef.current.set(key, { key, url, body });
      setPendingSets(countSets());
      setSaveErr(reason);
      return false;
    };
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return queue(r.status === 401 ? 'locked' : `failed ${r.status}`);
      pendingRef.current.delete(key);
      // Recorded here rather than at the call site, so a finish that goes out inside a queue flush
      // counts as landed and is never posted a second time.
      if (key.startsWith('finish:')) finishLandedRef.current = true;
      setPendingSets(countSets());
      if (pendingRef.current.size === 0) setSaveErr(null);
      return true;
    } catch {
      return queue('offline');
    }
  }, []);

  /* Send everything queued. Each attempt re-queues itself on failure, so a partial flush leaves the
   * banner up with an honest count rather than silently dropping the rest. */
  const retryPending = useCallback(async (): Promise<boolean> => {
    let allOk = true;
    for (const p of [...pendingRef.current.values()]) {
      if (!(await write(p.key, p.url, p.body))) allOk = false;
    }
    return allOk;
  }, [write]);

  const day: Day = program.days[activeDay];
  /* Calgary, from lib/day.ts, not the phone's timezone. This used getTimezoneOffset() and so
   * stamped a workout with wherever the phone thought it was, while the hub counted days-since in
   * Calgary. Two answers to "what day is it" on one dish of data. */
  const date = today();

  /* The whole day, always. See the note on the deleted budget state above: the list is the plan
     and what he ticks is the session. */
  const blocks = day.blocks;

  const effOf = useCallback((ex: Exercise) => effectiveExercise(ex, swaps[ex.id]), [swaps]);

  // ---- rest timer: wall-clock target, same fix as gym.html (2026-08-10). A throttled/suspended
  // setInterval on a locked phone just means the NEXT tick recomputes correctly from Date.now(),
  // instead of a counter having silently stalled. `remaining` is real state, set only from inside
  // effects/callbacks (never computed from Date.now() during render, which React 19 flags as
  // impure): startTimer and the tick effect are the only writers. ----
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

  /* ---- rehydrate today's session ----
   *
   * Two things come back from the log, not one. The SETS, and the SWAPS that were in force when
   * they were logged, which `swapped_from` has been recording all along and nothing ever read.
   *
   * Without the second half the first half is worse than useless. Sets are stored under the id of
   * the exercise actually performed, so after a reload the page would show the ORIGINAL exercise
   * with three empty boxes while the three sets he did sat in the database under a different id.
   * His words, 2026-08-14: "it always came back to the default when I switch pages... I'm not
   * really sure it's working well."
   *
   * Day only. Not `swaps`, not `budget`: this overwrites set values from the server, and re-running
   * it while he is typing would clobber an entry that has not been saved yet. */
  useEffect(() => {
    let cancelled = false;

    /* Anything picked on this device and not yet lifted. Read here rather than in an initial state,
       because this component server-renders and localStorage does not exist there; applied through
       the same promise as the server's answer, because setting state synchronously in an effect
       cascades a render before paint. */
    let local: Record<string, Alt> = {};
    try {
      const raw = localStorage.getItem(swapKey(date));
      if (raw) local = JSON.parse(raw) as Record<string, Alt>;
    } catch { /* private mode, a full disk: a lost swap is not worth breaking the page over */ }

    /* Precedence, weakest first: this device's memory, then the log (what actually happened, and
       the same answer on every device), then anything he has changed since the page opened. */
    const applySwaps = (fromLog: Record<string, Alt>) => {
      const merged = { ...local, ...fromLog };
      if (!Object.keys(merged).length) return;
      setSwaps((prev) => { const n = { ...merged, ...prev }; persistSwaps(n); return n; });
    };

    postJson('/gym/api/session', { date })
      .then((data) => {
        if (cancelled || !data.sets) return;
        const rows = data.sets as {
          exercise_id: string; set_idx: number; weight: number | null; reps: number | null;
          done: boolean; swapped_from: string | null;
        }[];
        setSets((prev) => {
          const next = { ...prev };
          for (const s of rows) {
            const arr = (next[s.exercise_id] = next[s.exercise_id] ? [...next[s.exercise_id]!] : []);
            arr[s.set_idx - 1] = {
              weight: s.weight != null ? String(s.weight) : '',
              reps: s.reps != null ? String(s.reps) : '',
              done: !!s.done,
            };
            next[s.exercise_id] = arr;
          }
          return next;
        });
        const fromLog: Record<string, Alt> = {};
        for (const s of rows) {
          if (!s.swapped_from) continue;
          const slot = findExercise(day, s.swapped_from);
          const alt = slot?.alts?.find((a) => a.id === s.exercise_id);
          if (alt) fromLog[s.swapped_from] = alt;
        }
        applySwaps(fromLog);
      })
      .catch(() => { if (!cancelled) applySwaps({}); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay]);

  /* ---- suggestions, for whatever is on screen right now ----
   *
   * Separate from the hydrate above, and keyed on the EFFECTIVE exercise ids rather than the day.
   * Sharing one effect meant a swap fetched nothing, so a swapped exercise rendered with no
   * suggestion, no plate math and no warmup ramp: the three things that make the screen worth
   * opening, missing on exactly the exercise he had just chosen deliberately. */
  const planTargets = useMemo(
    () => blocks.flatMap((b) => b.exercises.filter((e) => e.log).map((e) => {
      const eff = effOf(e);
      return {
        id: eff.id, targetReps: parseTargetReps(eff.reps), type: exType(eff),
        increment: eff.increment, rangeWidth: eff.rangeWidth,
      };
    })),
    [blocks, effOf],
  );
  const planKey = planTargets.map((t) => t.id).join(',');

  useEffect(() => {
    if (!planTargets.length) return;
    let cancelled = false;
    postJson('/gym/api/plan', { date, exercises: planTargets })
      .then((data) => {
        if (cancelled) return;
        const byId: typeof plan = {};
        for (const ex of data.exercises || []) {
          byId[ex.id] = { last: ex.last, suggestion: ex.suggestion, recent: ex.recent ?? [] };
        }
        setPlan((prev) => ({ ...prev, ...byId }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  function getSet(effId: string, idx: number): SetEntry {
    return sets[effId]?.[idx] ?? { weight: '', reps: '', done: false };
  }

  function updateSet(effId: string, idx: number, patch: Partial<SetEntry>) {
    setSets((prev) => {
      const arr = prev[effId] ? [...prev[effId]!] : [];
      arr[idx] = { ...getSet(effId, idx), ...patch };
      return { ...prev, [effId]: arr };
    });
  }

  /* These take `eff`, the exercise he is ACTUALLY doing, and `slotId`, the position in the program
   * it is filling. They never see the original Exercise, which is the point: every defect here so
   * far has been `ex.name` written where `eff.name` was meant, and the two are only different after
   * a swap, so it survives any test done without one. Today's log carries the proof:
   * `exercise_id: box-jump` next to `exercise_name: "Broad Jump"`, a row that contradicts itself. */
  function autosave(slotId: string, eff: Exercise, idx: number, entry: SetEntry) {
    const p = plan[eff.id];
    void write(`set:${date}:${eff.id}:${idx}`, '/gym/api/set', {
      date, day: activeDay, dayTitle: day.title,
      exerciseId: eff.id, exerciseName: eff.name, setIdx: idx + 1,
      weight: entry.weight === '' ? null : Number(entry.weight),
      reps: entry.reps === '' ? null : Number(entry.reps),
      done: entry.done,
      swappedFrom: swaps[slotId] ? slotId : null,
      suggW: p?.suggestion.weight ?? null,
      suggR: p?.suggestion.reps ?? null,
    });
  }

  /** Sends the note, and clears the box only if it actually landed. A queued note stays on screen
   *  AND in the retry queue, so the flush after unlocking can double-post it; that is the trade
   *  taken deliberately, because a duplicate note is a nuisance and a lost one is not recoverable. */
  async function saveNote() {
    const body = note.trim();
    if (!body) return;
    const ok = await write(`note:${date}:${noteSeq.current++}`, '/gym/api/note', {
      date, day: activeDay, dayTitle: day.title, body,
    });
    if (ok) {
      setNote('');
      setNotesSaved((n) => n + 1);
    }
  }

  function toggleDone(slotId: string, eff: Exercise, idx: number) {
    const entry = { ...getSet(eff.id, idx), done: !getSet(eff.id, idx).done };
    updateSet(eff.id, idx, entry);
    autosave(slotId, eff, idx, entry);
    if (entry.done) startTimer(eff.name, restSeconds(eff.rest));
  }

  function persistSwaps(next: Record<string, Alt>) {
    try {
      if (Object.keys(next).length) localStorage.setItem(swapKey(date), JSON.stringify(next));
      else localStorage.removeItem(swapKey(date));
    } catch { /* see the restore above */ }
  }

  function swapExercise(originalId: string, alt: Alt) {
    setSwaps((prev) => { const n = { ...prev, [originalId]: alt }; persistSwaps(n); return n; });
    setOpenAlts((prev) => { const n = new Set(prev); n.delete(originalId); return n; });
  }
  function revertSwap(originalId: string) {
    setSwaps((prev) => { const n = { ...prev }; delete n[originalId]; persistSwaps(n); return n; });
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

  /* "Session saved." is a claim about the database, so it is only allowed once the database has
   * agreed. Sets owed from earlier in the session go first: finishing a session whose sets never
   * landed would record an empty workout and call it done.
   *
   * Three things this has to get right, all of them found by an adversarial pass on 2026-08-14
   * after the first version shipped:
   *
   *  - A refused finish must CHANGE something on screen. The first version returned silently when
   *    the queue would not flush, so with three sets owed a tap re-sent them, they were refused
   *    again, and the page was byte-identical before and after. A button that does nothing visible
   *    is the same lie as a button that claims success.
   *  - A finish that lands LATER, through the banner's unlock, is still a finish. Otherwise the
   *    session is recorded, the screen says nothing, and he presses Finish again.
   *  - It must not post twice. `finishLanded` is set by `write` itself on the finish key, so a
   *    finish that went out as part of a queue flush is not re-sent here. */
  async function flushAndFinish(status: 'finished' | 'cutshort' = 'finished'): Promise<boolean> {
    finishWantedRef.current = true;
    endingRef.current = status;
    if (pendingRef.current.size > 0 && !(await retryPending())) {
      setFinishBlocked(true);
      return false;
    }
    if (!finishLandedRef.current) {
      if (!(await write(`finish:${date}`, '/gym/api/finish', { date, day: activeDay, status: endingRef.current }))) {
        setFinishBlocked(true);
        return false;
      }
    }
    setFinishBlocked(false);
    setFinished(true);
    return true;
  }

  /* What the banner's retry means depends on how far he had got. If he was only entering sets, send
   * the sets. If he had already asked to finish, finish. */
  async function retryAll(): Promise<boolean> {
    return finishWantedRef.current ? flushAndFinish() : retryPending();
  }

  const warmupList = warmups[day.warmup] || [];
  const cooldownList = day.cooldown.map((k) => cooldowns[k]).filter(Boolean) as CooldownItem[];

  /* How to actually run a block, now read from `pairing` rather than the old conflated `type`.
   *
   * The old version had three branches producing two distinct strings: 'superset' and 'pair' both
   * returned the IDENTICAL sentence, and 'main' returned "Do the second between sets of the first",
   * which describes a superset while being the only paired block the UI did not draw a bracket
   * around. He worked that out from the screen on 2026-08-15 without seeing the code: "I also think
   * 2 is a superset. It's just that it doesn't have that line or I have no idea really if it's a
   * superset." He was right, and the fix was the data model, not the CSS. */
  function howToRun(block: { pairing: string; exercises: unknown[] }): string | null {
    if (block.exercises.length < 2) return null;
    if (block.pairing === 'alternate') return 'Superset: alternate the two, rest once after both.';
    /* Added 2026-08-21. Eleven of the thirteen paired blocks were a real lift plus a band, plank,
     * bridge or carry, and this line used to call them supersets. He said they were not, and he was
     * right. This says the true thing, and it is the one instruction on the page that makes the
     * session SHORTER rather than longer: the rest is being spent either way. */
    if (block.pairing === 'fill') {
      return 'Do the second one during the first one’s rest, not after it. It adds no time to the session.';
    }
    return 'Finish all sets of the first, then start the second.';
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
      {/* COMPUTED, not typed. program.json used to carry time: "75-85 min" on days this model puts
        * at 100 to 106 and whose real sessions ran 81 to 120. The split is the point: the work is
        * not what makes the session long. */}
      <p className="lede" style={{ marginTop: 4 }}>{day.desc}</p>
      <p className="lede quiet" style={{ marginTop: 2 }}>
        {(() => {
          const t = dayTimeBreakdown(day);
          return `The whole day is about ${t.total} min at the pace you have actually been working: ${t.sets} sets, ${t.restMin} min of that prescribed rest and ${t.overheadMin} min of standing around at 2.5 min a set. The standing around is the part worth attacking.`;
        })()}
      </p>

      {/* WHAT TO DROP, said once, instead of a cap that decides for him.
        *
        * The list is already in priority order and the roles already say which end is which, so the
        * only thing missing was a sentence naming the direction. Everything from the first
        * `accessory` block down is the tail. The two `main` blocks and the primer are the spine. */}
      {(() => {
        const firstAccessory = day.blocks.findIndex((b) => b.role === 'accessory');
        const spineCount = firstAccessory < 0 ? day.blocks.length : firstAccessory;
        const tail = day.blocks.slice(spineCount).flatMap((b) => b.exercises.map((e) => effOf(e).name));
        if (!tail.length) return null;
        return (
          <p className="lede quiet drop-order" style={{ marginTop: 6 }}>
            {`Do it in this order. Short on time, cut from the bottom: ${tail.join(', ')}. The first ${spineCount} blocks are the session.`}
          </p>
        );
      })()}

      <div className="progress-row">
        <span>{totals.done}/{totals.total} sets</span>
        {/* The nudge now fires at the rule's own ceiling, not at a separate number. This line used
            to say "consider a rest day" at five consecutive days while conditioning.json's rest
            rule has been a maximum of three since it was written, so /gym stayed quiet through two
            days the week page was already calling an overrun. */}
        {streak.run > 0 && (
          <span>
            {streak.run}-day streak{streak.overRule ? `, over the max of ${streak.maxConsecutive}` : ''}
          </span>
        )}
      </div>

      {/* Says WHY the same day came round again. Re-offering it silently would read as the app
        * having lost its place, which is the bug this feature exists to prevent. */}
      {nextUp.cutShort && !nextUp.todayDay && (
        <p className="lede" style={{ marginTop: 6 }}>
          You cut {program.days[nextUp.nextDay]?.title ?? 'the last session'} short on {nextUp.lastDate},
          so it comes round again rather than the next day in the rotation.
        </p>
      )}

      {/* Sticky, because the set he just typed is most of a screen below this line and a warning
        * that scrolls away is a warning he does not get. */}
      {saveErr && (
        <SaveBlocked
          err={saveErr}
          noun="set"
          queued={pendingSets}
          onRetry={retryAll}
          loginHref="/gym/login"
          sticky
        />
      )}

      {/* Open by default. Collapsed, these read as missing: you are holding a phone in a gym, not
        * browsing, and a closed disclosure is a thing you do not know is there. Reported lost on
        * 2026-08-11 when both were present the whole time. */}
      {warmupList.length > 0 && (
        <details className="fold" style={{ marginTop: 18 }} open>
          <summary>Warmup ({warmupList.length} min)</summary>
          {warmupList.map((w) => (
            <div className="warm-item" key={w.name}>
              <div className="name">{w.name}</div>
              <div className="cue">{w.cue}</div>
            </div>
          ))}
        </details>
      )}

      {/* A BLOCK, not a heading over some exercises.
        *
        * Silvio, after training on 2026-08-14: "the layout was confusing because there are like
        * four exercises at the same level and they were sort of inside one." Measured, he was
        * describing an inverted hierarchy: the boundary between two blocks was nothing at all
        * (a 30px margin and an 11px grey label) while the boundary between two exercises INSIDE a
        * block was a visible hairline. So seven exercises read as one flat list, and the left
        * bracket that only some blocks carry was the only structure on screen, which is what read
        * as "inside one".
        *
        * Now the block opens with the full-ink rule the rest of the site opens a section with, and
        * carries its position, so at any point on a long scroll he can see which of how many he is
        * in. The bracket wraps the EXERCISES rather than the whole block, so it groups the two
        * things that are actually tied instead of swallowing the label as well. */}
      {blocks.map((block, bi) => (
        <div className={`exgroup${block.pairing === 'alternate' || block.pairing === 'fill' ? ' tied' : ''}`} key={bi}>
          <div className="exgroup-label">
            <span className="exgroup-n tnum">{bi + 1}/{blocks.length}</span>
            {block.label} <span className="tag">{block.tag}</span>
            {/* THE SPINE, SAID OUT LOUD. The main lifts are what the session is; everything after
              * them is optional and always was, but nothing on screen said so, so a session cut
              * short read as a session failed. Derived from `role` rather than a second flag that
              * could disagree with it. */}
            {block.role === 'accessory' && <span className="tag opt">optional</span>}
          </div>
          {howToRun(block) && <div className="exgroup-how">{howToRun(block)}</div>}
          {/* WHY THIS BLOCK IS HERE, behind a tap. He said the programme reads as arbitrary because
            * he had never seen the evidence file, and judged this the highest-value change in the
            * whole audit: a programme he does not believe is one he stops finishing. Collapsed,
            * because eighteen of these open would rebuild the wall of text the tabs removed. */}
          <details className="src">
            <summary>Why this is here</summary>
            <div className="src-body">{block.why}</div>
          </details>
          <div className="exlist">
          {block.exercises.map((ex) => {
            const swap = swaps[ex.id];
            const eff = effOf(ex);
            const p = plan[eff.id];
            const showPlate = PLATE_IDS.has(eff.id);
            const targetW = p?.suggestion.weight ?? null;
            const ramp = block.role === 'main' && targetW != null ? warmupRamp(targetW) : null;
            return (
              /* The slot in the program and the exercise actually filling it. They differ only
                 after a swap, which is exactly when everything here has gone wrong before, and the
                 interaction harness has no other way to see an id. See scripts/probe-gym.js. */
              <div className="ex" key={ex.id} data-slot={ex.id} data-eff={eff.id}>
                <div className="ex-name">{eff.name}</div>
                <div className="ex-meta">{eff.sets}×{eff.reps} · {eff.rest} rest</div>
                <div className="ex-cue">{eff.cue}</div>
                {/* `swap-revert`, not `swap-toggle`. Both controls sat on a swapped card wearing the same class,
                     and the revert link renders first, so "the swap control" resolved to the wrong one: an
                     interaction test aiming at the alternatives list reverted the swap instead. Two different
                     actions should not answer to the same name. */}
                {swap && <div className="swapped-note">Swapped from {ex.name} · <button className="swap-revert" onClick={() => revertSwap(ex.id)}>revert</button></div>}

                {showPlate && targetW != null && (
                  <div className="ex-sub">{plateMath(targetW)}</div>
                )}
                {ramp && <div className="ex-sub">Ramp: {ramp}</div>}

                {p?.suggestion && (
                  <div className="ex-suggest">
                    {p.suggestion.weight != null ? `${p.suggestion.weight} lb × ${p.suggestion.reps}` : `× ${p.suggestion.reps}`}
                    <span className="ex-suggest-why">{p.suggestion.reason}</span>
                    {p.recent && <Trend recent={p.recent} />}
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
                            onChange={(e) => updateSet(eff.id, i, { weight: e.target.value })}
                            onBlur={() => autosave(ex.id, eff, i, getSet(eff.id, i))}
                          />
                          <input
                            type="number" inputMode="decimal" placeholder={eff.timed ? 's' : 'reps'}
                            value={entry.reps}
                            onChange={(e) => updateSet(eff.id, i, { reps: e.target.value })}
                            onBlur={() => autosave(ex.id, eff, i, getSet(eff.id, i))}
                          />
                          <button
                            type="button" aria-label="mark set done"
                            className={`done-toggle${entry.done ? ' on' : ''}`}
                            onClick={() => toggleDone(ex.id, eff, i)}
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
        </div>
      ))}

      {cooldownList.length > 0 && (
        <details className="fold" style={{ marginTop: 24 }} open>
          <summary>Cooldown</summary>
          {cooldownList.map((c) => (
            <div className="warm-item" key={c.name}>
              <div className="name">{c.name}</div>
              <div className="cue">{c.cue}</div>
            </div>
          ))}
        </details>
      )}

      <details className="fold">
        <summary>RIR guide</summary>
        {rirGuide.map((r) => (
          <div className="warm-item" key={r.rir}>
            <div className="name">RIR {r.rir}</div>
            <div className="cue">{r.desc}</div>
          </div>
        ))}
      </details>

      {/* ---- a note from the floor ----
        *
        * Asked for on 2026-08-16: "maybe a note place in the end for when I find something that I
        * wanna write it down or tell you."
        *
        * ON VOICE. He asked whether he could send a voice note. He can, and this is it: the
        * microphone on the phone keyboard dictates straight into this box. Recording and uploading
        * real audio would mean blob storage, a transcription service and a bill, to arrive at text
        * in a database, which is where this already puts it. The hint under the label exists
        * because the capability is invisible: the keyboard has the button, the web page cannot
        * show it.
        *
        * Stays visible after the session is finished. A thought does not arrive on cue, and the
        * most likely moment for one is walking out.
        *
        * The text is NOT cleared unless the write actually landed. Sets are different: the input
        * itself holds the value and a queued set can be re-read off the screen. A note that failed
        * to send and got wiped out of the box is gone from the world. */}
      <div className="exgroup">
        <div className="exgroup-label">
          Note <span className="tag">(anything worth telling me)</span>
        </div>
        <p className="ex-cue" style={{ marginBottom: 8 }}>
          Tap the microphone on your keyboard and talk. It arrives as text. Machines taken, something
          that hurt, a swap you made, a question: whatever it is, it gets read before the next change
          to the programme.
        </p>
        <textarea
          className="note-box"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="The racks were all taken so I..."
          autoCapitalize="sentences"
          spellCheck
        />
        <div className="note-actions">
          <button className="btn" onClick={() => void saveNote()} disabled={!note.trim()}>
            Save note
          </button>
          {notesSaved > 0 && (
            <span className="quiet">
              {notesSaved} note{notesSaved === 1 ? '' : 's'} saved today
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 30, marginBottom: 30 }}>
        {finished ? (
          <p className="lede">
            Session saved. {totals.done}/{totals.total} sets logged.
            {endingRef.current === 'cutshort' && ' Cut short, so this day comes round again next time rather than the next one.'}
          </p>
        ) : (
          <>
            <button className="primary" style={{ width: '100%' }} onClick={() => void flushAndFinish('finished')}>
              Finish workout ({totals.done}/{totals.total})
            </button>
            {/* THE SECOND ENDING, added 2026-08-16. Until now Finish was the only way out, so a day
              * he barely started and a day he completed left exactly the same trace, and the
              * rotation in cycle.ts moved on from both. His note after doing two sets of a
              * five-block Lower A: "Didn't have that much time so can we just restart from here
              * next session whats the best approach". This is the answer, and it is a button rather
              * than something to remember. Secondary styling on purpose: finishing is still the
              * normal ending and this must not read as the easy way out. */}
            <button
              className="ghost"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => void flushAndFinish('cutshort')}
            >
              Ran out of time, keep this day for next session
            </button>
            {/* Said at the button, not only in the banner at the top of the page. He pressed a
              * thing down here, so this is where "it did not work" has to appear. */}
            {finishBlocked && (
              <p className="lede" style={{ color: 'var(--destructive)' }}>
                Not finished. The server refused it, so this session is not recorded yet. Unlock
                this device in the notice at the top of the page and it will finish on its own.
              </p>
            )}
          </>
        )}
      </div>

      <div className={`timer-bar${timer ? '' : ' off'}`}>
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
