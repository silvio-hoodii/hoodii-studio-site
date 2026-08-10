/** Timers that outlive the step you started them on.
 *
 *  The problem this solves, in his words on 2026-08-09:
 *
 *    "If we're doing things at the same time, let's say the pasta is cooking while the chicken is
 *     cooking, then move on to the next thing. I move on to the next thing but then when that first
 *     thing is done, I have to go like 17 steps back, click until I get back, check what's going on,
 *     and then come back to the next step."
 *
 *  Three things follow from that and all three are design constraints, not features:
 *
 *  1. A timer belongs to the KITCHEN, not to a screen. It is in localStorage and rendered by the
 *     kitchen layout, so it survives changing step, changing recipe, and closing the tab. The pasta
 *     and the chicken are usually two different recipes, which is exactly the case a per-page timer
 *     cannot handle.
 *
 *  2. A timer carries its own step text and doneness test. The reason he had to navigate back was
 *     to find out what he was supposed to DO when it finished. If the answer travels with the
 *     countdown there is no reason to go back at all.
 *
 *  3. Remaining time is computed from an END TIMESTAMP, never counted down in a variable. A phone
 *     screen locks, the browser throttles or suspends the tab, and an interval that has been asleep
 *     for four minutes has not ticked. Storing when it ENDS means the number is right the instant
 *     the screen comes back on, however long it was away.
 */

export interface KTimer {
  id: string;
  recipeId: string;
  recipeName: string;
  /** 1-indexed, matching what the cook screen shows him. */
  step: number;
  stepOf: number;
  label: string;
  /** Epoch ms. The only durable fact; everything else is derived from it and Date.now(). */
  endsAt: number;
  seconds: number;
  /** Copied in at start so a finished timer can answer "what was this" with no navigation. */
  text: string;
  doneness?: string;
  heat?: string;
}

const KEY = 'kos.timers.v1';

/* useSyncExternalStore compares snapshots by identity, so the parsed array has to be cached and
 * only replaced when the underlying string actually changes. Re-parsing on every read returns a new
 * array every time and spins the render loop. */
let cachedRaw: string | null = null;
let cached: KTimer[] = [];
const EMPTY: KTimer[] = [];

const listeners = new Set<() => void>();

function parse(raw: string | null): KTimer[] {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as KTimer[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readTimers(): KTimer[] {
  if (typeof window === 'undefined') return EMPTY;
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

/** The server render has no localStorage, so the rail starts empty and fills in on hydration. */
export const serverTimers = (): KTimer[] => EMPTY;

function write(next: KTimer[]) {
  const raw = JSON.stringify(next);
  window.localStorage.setItem(KEY, raw);
  cachedRaw = raw;
  cached = next;
  for (const l of listeners) l();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Another tab, or the same page in a second window. Cheap to support and confusing without it.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

/** Starting the same step twice replaces the first rather than stacking two identical countdowns. */
export function startTimer(t: Omit<KTimer, 'id' | 'endsAt'> & { endsAt?: number }): KTimer {
  const timer: KTimer = {
    ...t,
    id: `${t.recipeId}:${t.step}`,
    endsAt: t.endsAt ?? Date.now() + t.seconds * 1000,
  };
  write([...readTimers().filter((x) => x.id !== timer.id), timer]);
  unlockAudio();
  requestWake();
  return timer;
}

export function clearTimer(id: string) {
  const next = readTimers().filter((t) => t.id !== id);
  write(next);
  if (!next.length) releaseWake();
}

export function extendTimer(id: string, seconds: number) {
  write(
    readTimers().map((t) =>
      t.id === id
        // Extending something that already finished should give a full extra period from now, not
        // an interval that is already in the past.
        ? { ...t, endsAt: Math.max(t.endsAt, Date.now()) + seconds * 1000 }
        : t,
    ),
  );
  requestWake();
}

export const remaining = (t: KTimer, now = Date.now()) => Math.round((t.endsAt - now) / 1000);

export function clock(secs: number): string {
  const s = Math.abs(secs);
  const m = Math.floor(s / 60);
  return `${secs < 0 ? '+' : ''}${m}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- *
 * The alert. Audio and vibration, both optional, neither load-bearing.
 * ---------------------------------------------------------------- */

let ctx: AudioContext | null = null;

/** Browsers refuse to create or resume an AudioContext outside a user gesture. Starting a timer is
 *  a tap, so that is where the context gets built, several minutes before it is needed. */
export function unlockAudio() {
  try {
    type WithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* No audio. The chip still turns colour, which is the part that matters. */
  }
}

export function alarm() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 500]);
  } catch { /* not on desktop */ }
  try {
    if (!ctx || ctx.state !== 'running') return;
    // Three rising blips. Generated rather than loaded: an audio file would be a network request,
    // and the strict CSP on this site blocks anything off-host anyway.
    [0, 0.28, 0.56].forEach((offset, k) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = 660 + k * 220;
      const t0 = ctx!.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    });
  } catch { /* nothing to do about it */ }
}

/* ---------------------------------------------------------------- *
 * Screen wake lock. A phone that sleeps mid-recipe is its own small failure: he has wet hands and
 * the step he is on disappears. Held only while a timer is running.
 * ---------------------------------------------------------------- */

let wake: WakeLockSentinel | null = null;

export async function requestWake() {
  try {
    if (wake || !('wakeLock' in navigator)) return;
    wake = await navigator.wakeLock.request('screen');
    wake.addEventListener('release', () => { wake = null; });
  } catch { /* denied, unsupported, or the tab is hidden. Not worth telling him about. */ }
}

export function releaseWake() {
  try {
    void wake?.release();
    wake = null;
  } catch { /* already gone */ }
}

/** A wake lock is dropped by the browser whenever the tab is hidden and is not restored on its own. */
export function reacquireWakeIfNeeded() {
  if (document.visibilityState === 'visible' && readTimers().length) void requestWake();
}
