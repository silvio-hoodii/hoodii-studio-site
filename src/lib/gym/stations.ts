/** STATIONS, since 2026-11-02: a circuit for when there is no gym. His words: "I just have a 12 kilos
 *  dumbbell, a couple of 10 ... a couple of smaller dumbbells, like 1 kilo each, and then another of 2
 *  kilos each ... There's also a couple of short bands", "I have two more friends ... we might be kind
 *  of doing stations", "let's make it kind of flexible in the sense that I get to choose the
 *  exercises", "full body or lower body depending on who's doing what".
 *
 *  THREE THINGS ARE STRUCTURAL HERE, NOT ADVICE.
 *
 *  1. NOBODY WAITS FOR GEAR. Every piece of gear belongs to exactly one station, and a station can only
 *     offer exercises using its own gear, so any pick by anyone is safe. Four stations for three people
 *     leaves one empty at every moment. stations.test.ts refuses a violation.
 *  2. NOBODY WAITS FOR ANYONE. Work is timed, so a slower person simply does fewer reps and everyone
 *     moves on the same beep. The clock is a pure function of elapsed time (`phaseAt`), so a phone that
 *     drops the tab comes back on the right second.
 *  3. FULL BODY OR LEGS IS A PER-PERSON CHOICE WITH NO SETTING. Every station offers a legs exercise,
 *     then a second exercise as either upper or legs. Each person just does the row they want.
 *
 *  WEIGHT IS NOT LOGGED, only reps, with the gear in the name. He does not know whether the 10s are
 *  kilos or pounds, and gym_set.weight is pounds, so a number there would be a guess. The `st-` id
 *  prefix keeps these sets away from progression.ts too: 12 kilos for 15 reps must not read as a
 *  collapse of his goblet squat next time the programme offers one. */

export type Gear = 'tens' | 'twelve' | 'bands' | 'ones' | 'twos';

export interface StationExercise {
  id: string;
  name: string;
  /** What the hand holds. Empty means bodyweight. */
  gear: Gear[];
  /** Half the time on each side. The clock beeps at the halfway point. */
  sided?: boolean;
  /** What the number box counts, when it is not reps. */
  unit?: string;
  cue: string;
}

export interface Station {
  id: string;
  name: string;
  gear: Gear[];
  /** First choice is the recommendation. */
  legs: StationExercise[];
  upper: StationExercise[];
  legs2: StationExercise[];
}

export const STATIONS: Station[] = [
  {
    id: 'tens',
    name: 'Pair of 10s',
    gear: ['tens'],
    legs: [
      { id: 'rdl', name: 'Romanian deadlift', gear: ['tens'], cue: 'Hips back, soft knees, weights close to the legs. Three seconds down, squeeze glutes to stand.' },
      { id: 'sl-rdl', name: 'Single-leg Romanian deadlift', gear: ['tens'], sided: true, cue: 'Hips square, back leg long. Touch down whenever balance goes.' },
      { id: 'staggered-rdl', name: 'Staggered Romanian deadlift', gear: ['tens'], sided: true, cue: 'Back foot on its toes for balance only. Nearly all the weight on the front heel.' },
    ],
    upper: [
      { id: 'floor-press', name: 'Floor press', gear: ['tens'], cue: 'On your back, elbows touch the floor softly, then press.' },
      { id: 'curl-tens', name: 'Curl', gear: ['tens'], cue: 'Elbows pinned to the ribs, three seconds down.' },
      { id: 'overhead-press', name: 'Overhead press', gear: ['tens'], cue: 'Ribs down, squeeze glutes, press straight up.' },
    ],
    legs2: [
      { id: 'reverse-lunge', name: 'Reverse lunge', gear: ['tens'], cue: 'Step back, alternate legs, push through the front heel.' },
      { id: 'split-squat-loaded', name: 'Split squat', gear: ['tens'], sided: true, cue: 'Feet stay planted. Back knee straight down, front heel heavy.' },
      { id: 'farmer-carry', name: 'Farmer carry', gear: ['tens'], unit: 'lengths', cue: 'Walk tall, short steps. Count lengths.' },
    ],
  },
  {
    id: 'twelve',
    name: 'The 12',
    gear: ['twelve'],
    legs: [
      { id: 'goblet-squat', name: 'Goblet squat', gear: ['twelve'], cue: 'Three seconds down, one second at the bottom, stand fast.' },
      { id: 'sumo-goblet-squat', name: 'Sumo goblet squat', gear: ['twelve'], cue: 'Wide stance, toes out, knees follow the toes. Three seconds down.' },
    ],
    upper: [
      { id: 'one-arm-row', name: 'One-arm row', gear: ['twelve'], sided: true, cue: 'Free hand on the knee, flat back, elbow to the hip.' },
      { id: 'one-arm-press', name: 'One-arm overhead press', gear: ['twelve'], sided: true, cue: 'Ribs down, no lean away from the weight.' },
    ],
    legs2: [
      { id: 'lateral-lunge', name: 'Lateral lunge', gear: ['twelve'], sided: true, cue: 'Big step sideways, sit back into that hip, other leg straight.' },
      { id: 'swing', name: 'Swing', gear: ['twelve'], cue: 'Hips drive it, arms only guide. Snap the glutes at the top.' },
      { id: 'goblet-reverse-lunge', name: 'Goblet reverse lunge', gear: ['twelve'], cue: 'Hold it at the chest, step back, alternate legs.' },
    ],
  },
  {
    id: 'bands',
    name: 'Bands',
    gear: ['bands'],
    legs: [
      { id: 'band-bridge', name: 'Banded glute bridge', gear: ['bands'], cue: 'Band above the knees, push them out. Two seconds squeezing at the top.' },
      { id: 'sl-bridge', name: 'Single-leg glute bridge', gear: [], sided: true, cue: 'Drive through the planted heel, hips stay level.' },
    ],
    upper: [
      { id: 'push-up', name: 'Push-up', gear: [], cue: 'Straight line head to heel. Knees down when the reps stop.' },
      { id: 'band-pull-apart', name: 'Band pull-apart', gear: ['bands'], cue: 'Arms straight at chest height, pull the band wide, shoulder blades together.' },
    ],
    legs2: [
      { id: 'band-side-walk', name: 'Band side walk', gear: ['bands'], cue: 'Half squat, band above the knees. Small steps, knees pushing out, change direction halfway.' },
      { id: 'band-clamshell', name: 'Banded clamshell', gear: ['bands'], sided: true, cue: 'On your side, heels together, open the knee without rolling back.' },
      { id: 'band-squat-pulse', name: 'Banded squat', gear: ['bands'], cue: 'Band above the knees, push them out the whole way down and up.' },
    ],
  },
  {
    id: 'small',
    name: '1s and 2s',
    gear: ['ones', 'twos'],
    legs: [
      { id: 'split-squat', name: 'Split squat', gear: [], sided: true, cue: 'Feet stay planted. Three seconds down, back knee nearly to the floor.' },
      { id: 'curtsy-lunge', name: 'Curtsy lunge', gear: [], cue: 'Step back and across, alternate legs, hips facing forward.' },
      { id: 'step-up', name: 'Step-up', gear: [], sided: true, cue: 'Needs a solid step. Whole foot on it, push through that heel, no bounce off the back foot.' },
    ],
    upper: [
      { id: 'lateral-raise', name: 'Lateral raise', gear: ['twos'], cue: 'The 2s. Slight bend in the elbows, up to shoulder height, slow down.' },
      { id: 'curl', name: 'Curl', gear: ['twos'], cue: 'The 2s. Elbows pinned to the ribs, three seconds down.' },
      { id: 'triceps-ext', name: 'Overhead triceps extension', gear: ['twos'], cue: 'The 2s. Elbows point up and stay close to the head.' },
      { id: 'front-raise', name: 'Front raise', gear: ['ones'], cue: 'The 1s. Up to shoulder height, no swing.' },
    ],
    legs2: [
      { id: 'frog-pump', name: 'Frog pump', gear: [], cue: 'On your back, soles together, knees wide. Fast squeeze at the top.' },
      { id: 'fire-hydrant', name: 'Fire hydrant', gear: [], sided: true, cue: 'On hands and knees, lift the knee out to the side, hips stay level.' },
      { id: 'side-leg-raise', name: 'Side-lying leg raise', gear: [], sided: true, cue: 'On your side, toes forward, lift from the hip.' },
    ],
  },
];

export const WARMUP = ['Squat ×10', 'Glute bridge ×10', 'Reverse lunge ×5 each leg', 'Arm circles ×10 each way'];

export const ROUND_OPTIONS = [3, 4, 5] as const;
export const WORK_OPTIONS = [30, 45, 60] as const;
export const DEFAULT_ROUNDS = 3;
export const DEFAULT_WORK = 45;

export const GET_READY_SEC = 20;
/* 20, not 15: one switch is standing up off the floor or getting down to it. */
export const SWITCH_SEC = 20;
export const MOVE_SEC = 30;
export const ROUND_REST_SEC = 60;

export type PhaseKind = 'ready' | 'first' | 'switch' | 'second' | 'move' | 'rest' | 'done';

export interface Phase {
  kind: PhaseKind;
  /** 1-based. */
  round: number;
  /** How many stations along from where you started, 0-based. */
  step: number;
  /** Seconds this phase lasts. */
  length: number;
  /** Seconds into the whole session this phase starts. */
  startsAt: number;
  /** Position in the timeline, so a change of phase is one comparison. */
  index: number;
}

export interface ClockConfig {
  rounds: number;
  workSec: number;
  stations?: number;
}

/** The whole session, written out. A round ends on a long rest, except the last, which just ends. */
export function timeline({ rounds, workSec, stations = STATIONS.length }: ClockConfig): Phase[] {
  const out: Phase[] = [];
  let at = 0;
  const push = (kind: PhaseKind, round: number, step: number, length: number) => {
    out.push({ kind, round, step, length, startsAt: at, index: out.length });
    at += length;
  };
  push('ready', 1, 0, GET_READY_SEC);
  for (let r = 0; r < rounds; r++) {
    for (let s = 0; s < stations; s++) {
      const step = r * stations + s;
      push('first', r + 1, step, workSec);
      push('switch', r + 1, step, SWITCH_SEC);
      push('second', r + 1, step, workSec);
      const lastOfRound = s === stations - 1;
      if (!lastOfRound) push('move', r + 1, step, MOVE_SEC);
      else if (r < rounds - 1) push('rest', r + 1, step, ROUND_REST_SEC);
    }
  }
  return out;
}

export function totalSeconds(config: ClockConfig): number {
  const t = timeline(config);
  const last = t[t.length - 1]!;
  return last.startsAt + last.length;
}

export interface ClockReading {
  phase: Phase;
  /** Whole seconds left in this phase, counted up so the display never shows 0 while still running. */
  remaining: number;
  done: boolean;
}

/** Where the session is, from elapsed seconds alone. No ticking state, so nothing can drift. */
export function phaseAt(elapsedSec: number, config: ClockConfig): ClockReading {
  const t = timeline(config);
  const e = Math.max(0, elapsedSec);
  for (const phase of t) {
    if (e < phase.startsAt + phase.length) {
      return { phase, remaining: Math.ceil(phase.startsAt + phase.length - e), done: false };
    }
  }
  const last = t[t.length - 1]!;
  return { phase: { ...last, kind: 'done', index: t.length, length: 0 }, remaining: 0, done: true };
}

/** Which station someone is on, having started at `start`. */
export function stationAt(start: number, step: number, stations = STATIONS.length): number {
  return (start + step) % stations;
}

/** The gym_set id. The prefix is what keeps these rows away from progression.ts. */
export function logId(ex: StationExercise): string {
  return `st-${ex.id}`;
}

/** The gym_set name: the gear goes here because the weight is not logged. */
export function logName(ex: StationExercise, station: Station): string {
  if (!ex.gear.length) return ex.name;
  if (ex.gear[0] === 'ones') return `${ex.name} (1s)`;
  if (ex.gear[0] === 'twos') return `${ex.name} (2s)`;
  if (ex.gear[0] === 'bands') return `${ex.name} (band)`;
  return `${ex.name} (${station.name.toLowerCase()})`;
}
