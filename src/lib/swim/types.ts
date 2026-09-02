import type { Cue } from '@/lib/gym/types';

/* EVERYTHING SWIM, in one place. Moved out of src/lib/gym/types.ts on 2026-08-26.
 *
 * Swim was a tab on /gym/conditioning and a schedule scraper at /swim, and the two halves of the
 * same subject never met. The schedule is dead and the tracker took the route, so these types
 * follow the content they describe: content/swim/*.json.
 *
 * `Cue` is deliberately NOT moved. Run and bike cues are the same shape and it stays where the
 * other two disciplines can see it. A teaching point and a training cue really are the same thing:
 * something to do, a test with a binary answer, and where it came from. */

/** `string | string[]` on the prose fields is not laziness. JSON has no multi-line string, and
 *  these carry the reasoning (which trial, which numbers, why this dose and not double it) that the
 *  whole programme rests on. An array is how a paragraph survives in a file that has to stay
 *  diffable. */
type Prose = string | string[];

/** A labelled fact about where he currently is. An ordered ARRAY, not the `Record<string, string>`
 *  this was until 2026-08-21, and the change is the point: the page read three fields by name
 *  (`continuousUnassisted`, `typicalSession`, `matchesTheData`), so the data had to fit the slots,
 *  and two false claims survived in them for weeks because there was nowhere else for the truth to
 *  go. A list the page walks cannot be outgrown by what the lap data turns out to say. */
export interface BaselineFact {
  label: string;
  value: string;
  /** True for a fact that BACKS the headline ones rather than changing what he does next. Rendered
   *  behind a tap. The flag lives in the data, not in the page's row order, because "the first two
   *  are the important ones" is a coupling that breaks silently the moment a fact is inserted. */
  secondary?: boolean;
  /** Names a figure the PAGE computes and appends, rather than one typed into the file.
   *
   *  Added 2026-08-28 (11-swim P1-4). This fact carried a typed list of nine longest pieces under a
   *  label saying ten, ending around 2026-08-22, with a diagnosis the live laps contradict: seven of
   *  the last ten swims hold a piece of 150 m or more. The block's own comment already claimed "the
   *  page cannot outgrow what the laps say", which was true of the LABELS and not of the numbers.
   *
   *  A string here rather than a boolean because more of this file will follow: every typed figure
   *  in `baseline` is a candidate, and naming which derivation applies keeps the page from guessing. */
  derived?: 'longestPieces';
}

/** A rung. `piece` is written RELATIVE to the number the week-0 calibration swim returns, never as
 *  an absolute distance: the lap data says 600 m unbroken, he said 200 m unassisted, the difference
 *  is almost certainly the pull buoy, and nothing in the watch export records a buoy. A constant
 *  here would be wrong by up to 400 m in a direction nobody can predict. */
export interface SwimLadderStep {
  weeks: string;
  piece: string;
  rest: string;
  note?: string;
}

/** The swim that sets the ladder. Exists because the alternative to measuring the opening rung was
 *  guessing it, and both guesses were bad: 3 x 200 m spends two months rebuilding a capacity the
 *  lap data already shows, and 2 x 400 m hands a novice a piece he may not hold. */
export interface SwimCalibration {
  name: string;
  what: string;
  test: string;
  why: string;
}

/** The plan itself. content/swim/plan.json, lifted out of conditioning.json on 2026-08-26 with its
 *  provenance paragraphs attached. */
export interface SwimPlan {
  title: string;
  sessionsPerWeek: string;
  baseline: BaselineFact[];
  theGoal: { target: string; whatThatActuallyIs: string; whyItIsAchievable: string };
  theOneTechniqueChange: { what: string; why: string; howToKnow: string };
  onDrills: string;
  structure: { note: string; calibration: SwimCalibration; ladder: SwimLadderStep[] };
  paddleRule: { rule: string; why: Prose };
  pullBuoyRule: string;
  cues?: Cue[];
  /** What was dropped from the cue set and why, which is the more useful half. */
  cuesNote?: string | null;
}

/** The handbook for when somebody at the pool asks him what to work on.
 *
 *  Reuses `Cue`, because a teaching point and a training cue are the same shape: a thing to do, a
 *  TEST with a binary answer, and where it came from. The test matters more here than anywhere else
 *  on this site: he is standing on a pool deck looking at another person, so the cue has to be
 *  something he can SEE rather than something they have to feel. */
export interface TeachingStage {
  id: string;
  n: number;
  name: string;
  /** Who this stage is for, so he can pick one by recognising the person in front of him. */
  who: string;
  sourceId?: string;
  cues: Cue[];
}

/** COACHING HIM, in the water, alone. The sibling of SwimTeaching, which is him coaching somebody
 *  else from the deck. Split on 2026-08-22 because every cue in the teaching file begins "stand
 *  next to them and watch", which is right for that job and no use at all for his own swimming.
 *  Every check carries a verbatim quote and a source; content/swim/validate.mjs enforces it. */
export interface SwimCoaching {
  meta: { builtOn: string; stroke: string; who: string };
  theQuestion: { title: string; body: Prose };
  checks: {
    id: string;
    n: number;
    name: string;
    say: string;
    say2?: string;
    test: string;
    confidence: 'sourced' | 'inference' | 'convention';
    quote?: string;
    source?: string;
    from?: string;
    fromQuote?: string;
    /** The entry on the OTHER coaching tab that quotes the same sentence, as "<file>:<id or name>".
     *  content/swim/validate.mjs requires both sides to name each other. See checkSharedQuotes there
     *  for the three defects that came out of two tabs quoting one sentence without knowing it. */
    sharedWith?: string[];
  }[];
  sources: { id: string; label: string; url: string; note?: string }[];
}

export interface SwimTeaching {
  meta: { builtOn: string; stroke: string; who: string };
  /** The safety line. First thing on the page, deliberately. */
  beforeYouStart: { title: string; body: Prose };
  stages: TeachingStage[];
  whatToLookFor: {
    title: string;
    intro: string;
    items: { see: string; say: string; stage: string }[];
  };
  sources: { id: string; label: string; url: string; note?: string }[];
}
