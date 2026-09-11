import type { Cue } from '@/lib/gym/types';

/* The shapes of content/swim/*.json. Cue stays in gym/types because run and bike share it. */

type Prose = string | string[];

/** A rung, written relative to his number so one ladder serves any number he sets. */
export interface SwimLadderStep {
  weeks: string;
  piece: string;
  rest: string;
  note?: string;
}

export interface SwimCalibration {
  name: string;
  what: string;
  test: string;
  why: string;
}

export interface SwimPlan {
  title: string;
  sessionsPerWeek: string;
  theGoal: { target: string; whatThatActuallyIs: string };
  /** addSeconds is what the How tab adds to his last middle length to print the target. */
  theOneTechniqueChange: { what: string; why: string; addSeconds: number };
  structure: { note: string; calibration: SwimCalibration; ladder: SwimLadderStep[] };
  pullBuoyRule: string;
  cues?: Cue[];
  cuesNote?: string | null;
}

/** A sentence from a captured page; content/swim/validate.mjs refuses one that is not on that page. */
export interface SourceQuote {
  source: string;
  text: string;
}

export interface SwimSource {
  id: string;
  label: string;
  url: string;
  note?: string;
}

/** Coach me: him in the water, alone. US Masters Swimming only. */
export interface SwimCoachingItem {
  id: string;
  name: string;
  do: string;
  check: string;
  quotes: SourceQuote[];
  confidence: 'sourced' | 'inference' | 'convention';
  from?: string;
  fromQuote?: string;
}

/** What HE said about how one piece ended. Only he can author it; it renders beside that piece. */
export interface SwimReport {
  /** The piece's local date and distance, which is how the page finds it. */
  date: string;
  metres: number;
  /** The day he said it. */
  on: string;
  said: string;
}

export interface SwimCoaching {
  meta: { builtOn: string; rebuiltOn?: string; stroke: string; who: string };
  yourWords?: SwimReport[];
  groups: { id: string; name: string; items: SwimCoachingItem[] }[];
  sources: SwimSource[];
}

/** Coach them: what he sees from the deck, what to say, what to show. Swim England only. */
export interface TeachingItem {
  id: string;
  see: string;
  say: string;
  show?: string;
  watch: string;
  quotes: SourceQuote[];
  confidence: 'sourced' | 'convention';
}

export interface SwimTeaching {
  meta: { builtOn: string; rebuiltOn?: string; who: string; sourceFamily?: string };
  /** The safety line, first on the tab. His ruling, 2026-09-03: all three lines, unchanged. */
  beforeYouStart: { title: string; body: Prose };
  groups: { id: string; name: string; items: TeachingItem[] }[];
  sources: SwimSource[];
}
