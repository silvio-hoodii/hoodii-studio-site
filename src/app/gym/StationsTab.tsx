'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_ROUNDS, DEFAULT_WORK, ROUND_OPTIONS, STATIONS, WARMUP, WORK_OPTIONS,
  logId, phaseAt, stationAt, totalSeconds,
  type PhaseKind, type Station, type StationExercise,
} from '@/lib/gym/stations';

/* THE STATIONS TAB. The reasoning for the structure is at the top of src/lib/gym/stations.ts.
 *
 * Rendered only after a tap (or the restore effect in GymClient), so it never runs on the server and
 * can read localStorage in its initial state. Nothing here writes except `onLog`, which is GymClient's
 * `write` and so inherits the offline queue, the 401 handling and FREE_DAY. */

const PICKS_KEY = 'gym:stations:picks';
const CLOCK_KEY = 'gym:stations:clock';

type SlotKey = 'legs' | 'upper' | 'legs2';
const SLOTS: { key: SlotKey; label: string }[] = [
  { key: 'legs', label: '1 Legs' },
  { key: 'upper', label: '2 Upper' },
  { key: 'legs2', label: '2 Legs' },
];

interface Clock {
  /** The session date it was started on. A clock from another day is thrown away on load. */
  date: string;
  rounds: number;
  workSec: number;
  start: number;
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

const PHASE_LABEL: Record<PhaseKind, string> = {
  ready: 'Get to your station',
  first: 'Exercise 1',
  switch: 'Switch',
  second: 'Exercise 2',
  move: 'Move',
  rest: 'Rest',
  done: 'Done',
};

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function pickFrom(list: StationExercise[], id: string | undefined): StationExercise {
  return list.find((e) => e.id === id) ?? list[0]!;
}

interface Logged { id: string; reps: string }

interface Props {
  date: string;
  nextName: string;
  logged: Logged[];
  onLog: (ex: StationExercise, station: Station, reps: string) => void;
}

export default function StationsTab({ date, nextName, logged, onLog }: Props) {
  const [picks, setPicks] = useState<Record<string, string>>(() => readJson(PICKS_KEY, {}));
  const [clock, setClock] = useState<Clock | null>(() => {
    const saved = readJson<Clock | null>(CLOCK_KEY, null);
    return saved?.date === date ? saved : null;
  });
  const [rounds, setRounds] = useState<number>(() => clock?.rounds ?? DEFAULT_ROUNDS);
  const [workSec, setWorkSec] = useState<number>(() => clock?.workSec ?? DEFAULT_WORK);
  const [start, setStart] = useState<number>(() => clock?.start ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const [reps, setReps] = useState<Record<string, string>>({});

  const config = useMemo(() => ({ rounds, workSec }), [rounds, workSec]);
  const elapsed = clock ? (clock.startedAt != null ? (now - clock.startedAt) / 1000 : clock.pausedAt) : 0;
  const reading = clock ? phaseAt(elapsed, { rounds: clock.rounds, workSec: clock.workSec }) : null;
  const running = clock?.startedAt != null && !reading?.done;

  useEffect(() => {
    try { localStorage.setItem(PICKS_KEY, JSON.stringify(picks)); } catch { /* a private window */ }
  }, [picks]);
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

  /* THE BEEPS ARE THE ONLY THING THE OTHER TWO GET. Three short counting into any change, a long one
     on the change, and one at the halfway point of work for the exercises done one side at a time.
     The context is made inside the Start tap, because a browser refuses sound without a gesture. */
  const audio = useRef<AudioContext | null>(null);
  /* A RELOAD MID-SESSION KEEPS THE CLOCK AND LOSES THE SOUND, because the new page has had no tap yet.
     The other two only have the beeps, so that state gets a button instead of silence. */
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
    setClock({ date, rounds, workSec, start, startedAt: t, pausedAt: 0 });
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

  function logRow(ex: StationExercise, station: Station, ghost: string) {
    const typed = reps[ex.id] ?? '';
    const value = typed !== '' ? typed : ghost;
    if (value === '') return;
    onLog(ex, station, value);
    setReps((p) => ({ ...p, [ex.id]: '' }));
  }

  const liveAt = clock && reading ? stationAt(clock.start, reading.phase.step) : null;
  const shown = clock && reading && !reading.done && liveAt != null ? [STATIONS[liveAt]!] : STATIONS;
  const nextStation = clock && reading && !reading.done
    ? STATIONS[stationAt(clock.start, reading.phase.step + 1)]!
    : null;

  return (
    <div className="st">
      <div className="count" style={{ marginTop: 22 }}>Stations</div>
      <p className="lede" style={{ marginTop: 6 }}>Next on the programme: {nextName}.</p>

      {!clock && (
        <>
          <div className="st-setup">
            <div className="st-choice">
              <span className="quiet">Rounds</span>
              {ROUND_OPTIONS.map((n) => (
                <button key={n} className={`st-chip${rounds === n ? ' on' : ''}`} onClick={() => setRounds(n)}>{n}</button>
              ))}
            </div>
            <div className="st-choice">
              <span className="quiet">Work</span>
              {WORK_OPTIONS.map((n) => (
                <button key={n} className={`st-chip${workSec === n ? ' on' : ''}`} onClick={() => setWorkSec(n)}>{n}s</button>
              ))}
            </div>
          </div>
          <details className="st-warm">
            <summary>Warm-up</summary>
            <ul>{WARMUP.map((w) => <li key={w}>{w}</li>)}</ul>
          </details>
          <button className="btn st-go" onClick={begin}>
            Start at {STATIONS[start]!.name}, {Math.round(totalSeconds(config) / 60)} min
          </button>
        </>
      )}

      {clock && reading && (
        <div className={`st-clock${reading.phase.kind === 'first' || reading.phase.kind === 'second' ? ' work' : ''}`}>
          <div className="st-clock-label">
            {PHASE_LABEL[reading.phase.kind]}
            {!reading.done && <span className="quiet"> Round {reading.phase.round} of {clock.rounds}</span>}
          </div>
          {!reading.done && <div className="st-clock-time tnum">{mmss(reading.remaining)}</div>}
          {!reading.done && nextStation && (reading.phase.kind === 'move' || reading.phase.kind === 'rest') && (
            <div className="st-clock-next">Next: {nextStation.name}</div>
          )}
          <div className="st-clock-actions">
            {running && !soundOn && <button className="btn" onClick={ensureAudio}>Turn sound on</button>}
            {!reading.done && (clock.startedAt != null
              ? <button className="ghost" onClick={pause}>Pause</button>
              : <button className="ghost" onClick={resume}>Resume</button>)}
            {!reading.done && <button className="ghost" onClick={skip}>Skip</button>}
            <button className="ghost" onClick={stop}>{reading.done ? 'Close' : 'End'}</button>
          </div>
        </div>
      )}

      {shown.map((station) => {
        const at = STATIONS.indexOf(station);
        return (
          <div className={`st-card${!clock && start === at ? ' on' : ''}`} key={station.id}>
            <div className="st-head">
              <span className="fill-name">{station.name}</span>
              {!clock && (
                <button className="swap-toggle" onClick={() => setStart(at)} aria-pressed={start === at}>
                  {start === at ? 'You start here' : 'Start here'}
                </button>
              )}
            </div>
            {SLOTS.map(({ key, label }) => {
              const list = station[key];
              const ex = pickFrom(list, picks[`${station.id}:${key}`]);
              const done = logged.filter((l) => l.id === logId(ex));
              const ghost = done.length ? done[done.length - 1]!.reps : '';
              const unit = ex.unit ?? (ex.sided ? 'reps each side' : 'reps');
              return (
                <div className="st-row" key={key}>
                  <label className="st-label">
                    <span className="quiet">{label}</span>
                    <select
                      className="st-pick"
                      value={ex.id}
                      onChange={(e) => setPicks((p) => ({ ...p, [`${station.id}:${key}`]: e.target.value }))}
                    >
                      {list.map((o) => <option key={o.id} value={o.id}>{o.name}{o.sided ? ', each side' : ''}</option>)}
                    </select>
                  </label>
                  <div className="st-cue">{ex.cue}</div>
                  <div className="extra-row">
                    <input
                      className={`extra-num${ghost ? ' free-ghost' : ''}`}
                      inputMode="numeric"
                      value={reps[ex.id] ?? ''}
                      placeholder={ghost ? `${ghost} ${unit}` : unit}
                      aria-label={`${ex.name} ${unit}`}
                      onChange={(e) => {
                        /* Digits only: "12 each" would reach the log as a set with no number. */
                        const digits = e.target.value.replace(/\D/g, '');
                        setReps((p) => ({ ...p, [ex.id]: digits }));
                      }}
                    />
                    <button className="btn" onClick={() => logRow(ex, station, ghost)} disabled={!(reps[ex.id] || ghost)}>
                      Set {done.length + 1}
                    </button>
                  </div>
                  {done.length > 0 && <div className="extra-item tnum">{done.map((d) => d.reps).join(' · ')}</div>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
