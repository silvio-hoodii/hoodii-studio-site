export type ExerciseType = 'weighted' | 'bodyweight' | 'timed';

export interface Alt {
  id: string;
  name: string;
  cue: string;
  sets?: number;
  reps?: string;
  rest?: string;
  timed?: boolean;
  bodyweight?: boolean;
  increment?: number;
  log?: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  rest: string;
  cue: string;
  log?: boolean;
  bodyweight?: boolean;
  timed?: boolean;
  increment?: number;
  alts?: Alt[];
}

export interface Block {
  type: 'main' | 'superset' | 'pair';
  label: string;
  tag?: string;
  exercises: Exercise[];
}

export interface WarmupItem {
  name: string;
  search?: string;
  cue: string;
  media?: string;
}

export interface CooldownItem {
  name: string;
  search?: string;
  cue: string;
}

export interface Day {
  name: string;
  title: string;
  desc: string;
  time: string;
  warmup: 'lower' | 'upper';
  cooldown: string[];
  blocks: Block[];
}

export type DayKey = 'monday' | 'tuesday' | 'thursday' | 'friday';

export interface Program {
  days: Record<DayKey, Day>;
}

export interface HandstandStep {
  id: string;
  name: string;
  sets: number;
  reps: string;
  rest: string;
  timed?: boolean;
  bodyweight?: boolean;
  log?: boolean;
  cue: string;
}
