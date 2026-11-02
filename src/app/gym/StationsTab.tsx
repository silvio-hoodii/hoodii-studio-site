'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_ROUNDS, DEFAULT_WORK, MOVE_SEC, ROUND_OPTIONS, ROUND_REST_SEC, STATIONS, SWITCH_SEC, WARMUP, WORK_OPTIONS,
  assignment, holdWord, logId, phaseAt, picked, stationAt, totalSeconds,
  type Assignment, type Mode, type PhaseKind, type Picks, type SlotKey, type Station, type StationExercise,
} from '@/lib/gym/stations';

/* THE STATIONS TAB. The reasoning for the structure is at the top of src/lib/gym/stations.ts.
 *
 * REBUILT THE SAME DAY IT SHIPPED, on his words: "I think we can do banded walks ... Why isn't it
 * there?" and "exercise missing for upper body, like [raises]", "not explicit enough". Both were
 * already there, inside dropdowns and under the label "2 Legs". So: every option is on the screen,
 * each person is named with what they are doing, and during the session the screen says NOW and NEXT
 * for each of them instead of showing a form. Do not put a dropdown back.
 *
 * Rendered only after a tap (or the restore effect in GymClient), so it never runs on the server and
 * can read localStorage in its initial state. Nothing here writes except `onLog`, which is GymClient's
 * `write` and so inherits the offline queue, the 401 handling and FREE_DAY. */

const SETUP_KEY = 'gym:stations:setup';
const CLOCK_KEY = 'gym:stations:clock';

const SLOTS: { key: SlotKey; label: string; who: string }[] = [
  { key: 'legs', label: 'Exercise 1: legs', who: 'Everyone' },
  { key: 'upper', label: 'Exercise 2: upper body', who: 'Full body people' },
  { key: 'legs2', label: 'Exercise 2: legs', who: 'Legs only people' },
];

const PEOPLE = ['Me', 'Friend 1', 'Friend 2'];

interface Setup {
  picks: Picks;
  count: number;
  /** Friend names, typed once. Stays on this phone. */
  names: string[];
  modes: Mode[];
  rounds: number;
  workSec: number;
}
const DEFAULT_SETUP: Setup = {
  picks: {}, count: 3, names: ['', '', ''], modes: ['full', 'full', 'full'], rounds: DEFAULT_ROUNDS, workSec: DEFAULT_WORK,
};

interface Clock {
  /** The session date it was started on. A clock from another day is thrown away on load. */
  date: string;
  /** Wall-clock ms when elapsed was 0. Null while paused. */
  startedAt: number | null;
  /** Seconds elapsed at the moment of pausing. */
  pausedAt: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const PHASE: Record<PhaseKind, string> = {
  ready: 'Get to your station',
  first: 'Go: exercise 1',
  switch: 'Stop. Get ready for exercise 2',
  second: 'Go: exercise 2',
  move: 'Stop. Move to the next station',
  rest: 'Rest. Round finished',
  done: 'Finished',
};

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function PersonCard({ name, a, mine }: { name: string; a: Assignment; mine: boolean }) {
  const main = a.now;
  const moving = !a.now && a.nextStation;
  const shown = main ?? a.next;
  return (
    <div className={`st-person${mine ? ' mine' : ''}`}>
      <div className="st-person-head">
        <span className="st-person-name">{name}</span>
        <span className="quiet">{moving ? `Go to ${a.nextStation!.name}` : `At ${a.station.name}`}</span>
      </div>
      {shown ? (
        <>
          <div className="st-tag">{main ? 'Now' : 'Next'}</div>
          <div className="st-now">{shown.name}</div>
          <div className="st-hold">Use: {holdWord(shown)}{shown.sided ? '. Change sides at the halfway beep' : ''}</div>
          {mine && <div className="st-cue">{shown.cue}</div>}
        </>
      ) : (
        <div className="st-now">Done</div>
      )}
      {main && (
        <div className="st-then">
          {a.next
            ? <>Next: {a.next.name}{a.nextStation ? `, move to ${a.nextStation.name}` : ', same station'}</>
            : 'Last one'}
        </div>
      )}
    </div>
  );
}

interface Logged { id: string; reps: string }

interface Props {
  date: string;
  nextName: string;
  logged: Logged[];
  onLog: (ex: StationExercise, station: Station, reps: string) => void;
}

export default function StationsTab({ date, nextName, logged, onLog }: Props) {
  const [setup, setSetup] = useState<Setup>(() => ({ ...DEFAULT_SETUP, ...readJson<Partial<Setup>>(SETUP_KEY, {}) }));
  const [clock, setClock] = useState<Clock | null>(() => {
    const saved = readJson<Clock | null>(CLOCK_KEY, null);
    return saved?.date === date ? saved : null;
  });
  const [now, setNow] = useState(() => Date.now());
  const [reps, setReps] = useState<Record<string, string>>({});
  const { picks, count, modes, names, rounds, workSec } = setup;
  const nameOf = (i: number) => (i > 0 && names[i]?.trim()) || PEOPLE[i]!;

  const config = useMemo(() => ({ rounds, workSec }), [rounds, workSec]);
  const elapsed = clock ? (clock.startedAt != null ? (now - clock.startedAt) / 1000 : clock.pausedAt) : 0;
  const reading = clock ? phaseAt(elapsed, config) : null;
  const running = clock?.startedAt != null && !reading?.done;
  const totalSteps = rounds * STATIONS.length;

  useEffect(() => {
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* a private window */ }
  }, [setup]);
  useEffect(() => {
    try {
      if (clock) localStorage.setItem(CLOCK_KEY, JSON.stringify(clock));
      else localStorage.removeItem(CLOCK_KEY);
    } catch { /* a private window */ }
  }, [clock]);

  /* The tick only redraws: where the session is comes from the wall clock, so a throttled phone is
     late to repaint and never wrong. */
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, [running]);

  /* THE SCREEN STAYS ON while the clock runs: the phone is on the floor and nobody touches it for 45
     seconds, which is exactly when a phone sleeps and the beeps stop. */
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const take = () => {
      navigator.wakeLock.request('screen')
        .then((l) => { if (gone) void l.release(); else lock = l; })
        .catch(() => {});
    };
    take();
    const onVisible = () => { if (document.visibilityState === 'visible') take(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [running]);

  /* Three short counting into any change, a long one on the change, one at the halfway point of work
     for the exercises done one side at a time. The context is made inside the Start tap, because a
     browser refuses sound without a gesture. */
  const audio = useRef<AudioContext | null>(null);
  /* A RELOAD MID-SESSION KEEPS THE CLOCK AND LOSES THE SOUND, because the new page has had no tap yet.
     That state gets a button instead of silence. */
  const [soundOn, setSoundOn] = useState(false);
  function beep(ms: number, hz: number, afterMs = 0) {
    const ctx = audio.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = hz;
    gain.gain.value = 0.25;
    osc.connect(gain).connect(ctx.destination);
    const at = ctx.currentTime + afterMs / 1000;
    osc.start(at);
    osc.stop(at + ms / 1000);
  }
  const lastSound = useRef('');
  const phaseIndex = reading?.phase.index;
  const remaining = reading?.remaining;
  useEffect(() => {
    if (!running || phaseIndex == null || remaining == null || !reading) return;
    const key = `${phaseIndex}:${remaining}`;
    if (key === lastSound.current) return;
    const firstTick = lastSound.current === '';
    const changed = !lastSound.current.startsWith(`${phaseIndex}:`);
    lastSound.current = key;
    if (firstTick) return;
    const { kind, length } = reading.phase;
    if (changed) {
      /* High means work, low means stop: someone across the room can tell which without the screen. */
      beep(500, kind === 'first' || kind === 'second' ? 880 : 440);
      if (navigator.vibrate) navigator.vibrate(300);
    } else if (remaining <= 3) {
      beep(120, 660);
    } else if ((kind === 'first' || kind === 'second') && remaining === Math.ceil(length / 2)) {
      beep(200, 520);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phaseIndex, remaining]);

  /* The end, which `running` above is already false for. Three long, and only if this page heard the
     session running: a clock already finished when the page loaded has nothing to announce. */
  const finished = !!reading?.done;
  useEffect(() => {
    if (!finished || lastSound.current === '') return;
    lastSound.current = '';
    beep(500, 880);
    beep(500, 880, 700);
    beep(900, 880, 1400);
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 800]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function ensureAudio() {
    if (!audio.current) {
      const Ctx = window.AudioContext;
      if (Ctx) audio.current = new Ctx();
    }
    void audio.current?.resume();
    setSoundOn(!!audio.current);
  }

  function begin() {
    ensureAudio();
    const t = Date.now();
    lastSound.current = '';
    setNow(t);
    setClock({ date, startedAt: t, pausedAt: 0 });
    window.scrollTo(0, 0);
  }
  function pause() {
    if (!clock || clock.startedAt == null) return;
    const t = Date.now();
    setNow(t);
    setClock({ ...clock, startedAt: null, pausedAt: (t - clock.startedAt) / 1000 });
  }
  function resume() {
    if (!clock) return;
    ensureAudio();
    const t = Date.now();
    lastSound.current = '';
    setNow(t);
    setClock({ ...clock, startedAt: t - clock.pausedAt * 1000 });
  }
  function skip() {
    if (!clock || !reading) return;
    const to = reading.phase.startsAt + reading.phase.length;
    const t = Date.now();
    setNow(t);
    setClock(clock.startedAt != null ? { ...clock, startedAt: t - to * 1000 } : { ...clock, pausedAt: to });
  }
  function stop() {
    lastSound.current = '';
    setClock(null);
  }

  const setMode = (i: number, m: Mode) =>
    setSetup((s) => ({ ...s, modes: s.modes.map((x, j) => (j === i ? m : x)) }));

  /* ---- during the session ---- */
  if (clock && reading) {
    const { kind, step } = reading.phase;
    const views = PEOPLE.slice(0, count).map((_, i) => ({
      name: nameOf(i),
      a: assignment(kind, step, totalSteps, i, modes[i] ?? 'full', picks),
    }));
    const mine = views[0]!.a;
    const toLog = mine.justDid;
    const done = toLog ? logged.filter((l) => l.id === logId(toLog)) : [];
    const ghost = done.length ? done[done.length - 1]!.reps : '';
    const unit = toLog ? (toLog.unit ?? (toLog.sided ? 'reps each side' : 'reps')) : '';
    const save = () => {
      if (!toLog || !mine.justDidAt) return;
      const value = (reps[toLog.id] ?? '') !== '' ? reps[toLog.id]! : ghost;
      if (value === '') return;
      onLog(toLog, mine.justDidAt, value);
      setReps((p) => ({ ...p, [toLog.id]: '' }));
    };
    const stationNo = (step % STATIONS.length) + 1;
    const work = kind === 'first' || kind === 'second';
    return (
      <div className="st">
        <div className={`st-clock${work ? ' work' : ''}`}>
          <div className="st-phase">{PHASE[kind]}</div>
          {!reading.done && <div className="st-clock-time tnum">{mmss(reading.remaining)}</div>}
          {!reading.done && (
            <div className="quiet">
              Round {reading.phase.round} of {rounds}, turn {stationNo} of {STATIONS.length}
            </div>
          )}
          {running && !soundOn && <button className="btn st-sound" onClick={ensureAudio}>Turn sound on</button>}
        </div>

        {toLog && (
          <div className="st-log">
            <div className="st-log-q">{toLog.name}: how many did you do?</div>
            <div className="extra-row">
              <input
                className={`extra-num${ghost ? ' free-ghost' : ''}`}
                inputMode="numeric"
                value={reps[toLog.id] ?? ''}
                placeholder={ghost ? `${ghost} ${unit}` : unit}
                aria-label={`${toLog.name} ${unit}`}
                onChange={(e) => {
                  /* Digits only: "12 each" would reach the log as a set with no number. */
                  const digits = e.target.value.replace(/\D/g, '');
                  setReps((p) => ({ ...p, [toLog.id]: digits }));
                }}
              />
              <button className="btn" onClick={save} disabled={!(reps[toLog.id] || ghost)}>Save</button>
            </div>
            {done.length > 0 && <div className="extra-item tnum">Saved: {done.map((d) => d.reps).join(' · ')}</div>}
          </div>
        )}

        {!reading.done && views.map((v, i) => <PersonCard key={v.name} name={v.name} a={v.a} mine={i === 0} />)}

        <div className="st-actions">
          {!reading.done && (clock.startedAt != null
            ? <button className="ghost" onClick={pause}>Pause</button>
            : <button className="ghost" onClick={resume}>Resume</button>)}
          {!reading.done && <button className="ghost" onClick={skip}>Skip</button>}
          <button className="ghost" onClick={stop}>{reading.done ? 'Close' : 'End session'}</button>
        </div>
      </div>
    );
  }

  /* ---- before it ---- */
  return (
    <div className="st">
      <div className="count" style={{ marginTop: 22 }}>Stations</div>
      <p className="lede" style={{ marginTop: 6 }}>Next on the programme: {nextName}.</p>

      {/* HOW IT WORKS, first thing on the tab, on his words after two builds: "I dont understan how it
          works its not clear each one in one station?" Every number comes from the same constants the
          clock runs on, and the table from the same function that places people, so neither can
          disagree with what the session then does. */}
      <h2 className="st-step">How it works</h2>
      <ol className="st-how">
        <li>{count === 1 ? 'You are' : 'Each person is'} at one station at a time, using that station&apos;s weights.</li>
        <li>At each station, 2 exercises: {workSec} seconds, {SWITCH_SEC} seconds to switch, {workSec} seconds.</li>
        <li>Then {count === 1 ? 'you move' : 'everyone moves at the same time'} to the next station. {MOVE_SEC} seconds to move.</li>
        <li>After all {STATIONS.length} stations, rest {ROUND_REST_SEC} seconds and go again. {rounds} rounds.</li>
      </ol>
      <table className="st-where">
        <thead>
          <tr>
            <th>Turn</th>
            {PEOPLE.slice(0, count).map((_, i) => <th key={i}>{nameOf(i)}</th>)}
          </tr>
        </thead>
        <tbody>
          {STATIONS.map((_, step) => (
            <tr key={step}>
              <td className="tnum">{step + 1}</td>
              {PEOPLE.slice(0, count).map((_, i) => <td key={i}>{STATIONS[stationAt(i, step)]!.name}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="st-step">1. Who is training</h2>
      <div className="st-choice">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            className={`st-opt${count === n ? ' on' : ''}`}
            onClick={() => setSetup((s) => ({ ...s, count: n }))}
          >
            {n === 1 ? 'Just me' : `${n} people`}
          </button>
        ))}
      </div>
      {PEOPLE.slice(0, count).map((name, i) => (
        <div className="st-who" key={name}>
          <div className="st-person-head">
            {i === 0
              ? <span className="st-person-name">{name}</span>
              : (
                <input
                  className="st-name"
                  value={names[i] ?? ''}
                  placeholder={name}
                  aria-label={`${name} name`}
                  autoCapitalize="words"
                  onChange={(e) => setSetup((s) => ({ ...s, names: s.names.map((x, j) => (j === i ? e.target.value : x)) }))}
                />
              )}
            <span className="quiet">Starts at {STATIONS[i]!.name}</span>
          </div>
          <div className="st-choice">
            <button className={`st-opt${modes[i] === 'legs' ? ' on' : ''}`} onClick={() => setMode(i, 'legs')}>Legs only</button>
            <button className={`st-opt${modes[i] === 'full' ? ' on' : ''}`} onClick={() => setMode(i, 'full')}>Full body</button>
          </div>
        </div>
      ))}

      <h2 className="st-step">2. Choose the exercises</h2>
      {STATIONS.map((station, si) => (
        <div className="st-card" key={station.id}>
          <div className="st-card-title">Station {si + 1}: {station.name}</div>
          {SLOTS.map(({ key, label, who }) => {
            const chosen = picked(station, key, picks);
            return (
              <div className="st-slot" key={key}>
                <div className="st-slot-head">
                  <span className="st-slot-label">{label}</span>
                  <span className="quiet">{who}</span>
                </div>
                <div className="st-choice">
                  {station[key].map((o) => (
                    <button
                      key={o.id}
                      className={`st-opt${chosen.id === o.id ? ' on' : ''}`}
                      aria-pressed={chosen.id === o.id}
                      onClick={() => setSetup((s) => ({ ...s, picks: { ...s.picks, [`${station.id}:${key}`]: o.id } }))}
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
                <div className="st-cue">
                  Use: {holdWord(chosen)}{chosen.sided ? ', each side' : ''}. {chosen.cue}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <h2 className="st-step">3. How long</h2>
      <div className="st-slot-label">Rounds</div>
      <div className="st-choice">
        {ROUND_OPTIONS.map((n) => (
          <button key={n} className={`st-opt${rounds === n ? ' on' : ''}`} onClick={() => setSetup((s) => ({ ...s, rounds: n }))}>{n} rounds</button>
        ))}
      </div>
      <div className="st-slot-label" style={{ marginTop: 12 }}>Time on each exercise</div>
      <div className="st-choice">
        {WORK_OPTIONS.map((n) => (
          <button key={n} className={`st-opt${workSec === n ? ' on' : ''}`} onClick={() => setSetup((s) => ({ ...s, workSec: n }))}>{n} seconds</button>
        ))}
      </div>

      <h2 className="st-step">4. Warm up, then start</h2>
      <ul className="st-warm">{WARMUP.map((w) => <li key={w}>{w}</li>)}</ul>
      <button className="btn st-go" onClick={begin}>
        Start, {Math.round(totalSeconds(config) / 60)} minutes
      </button>
    </div>
  );
}
