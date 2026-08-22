export type ExerciseType = 'weighted' | 'bodyweight' | 'timed';

/** Where in the gym something happens. Keys match `zones` in content/gym/equipment.json, which is
 *  also where each zone declares whether you can get on the floor there. */
export type ZoneKey = 'rack' | 'benchDb' | 'cable' | 'machines' | 'smith' | 'ezPreacher';

/** The fixture an exercise occupies while it is being done: a rack, a bench, one machine, a cable
 *  stack, the preacher seat. `null` means it occupies NOTHING another member could want: floor
 *  work, a band held in two hands, pure bodyweight, or dumbbells carried away from the rack.
 *
 *  This field exists because the programme paired a station lift with a floor exercise somewhere
 *  else FIVE times and nothing could catch it. An exercise carried id, name, sets, reps, rest,
 *  timed, log, cue and alts, and not one of those says where you are standing. See
 *  content/gym/equipment.json for the rule this makes checkable. */
export type Station = string | null;

export interface Alt {
  id: string;
  name: string;
  cue: string;
  zone: ZoneKey;
  station: Station;
  /** True if it needs to be done lying, sitting or kneeling on the ground. Only legal in a zone
   *  whose `floor` is true. The cable section's is false, which is the whole point. */
  needsFloor?: boolean;
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
  zone: ZoneKey;
  station: Station;
  needsFloor?: boolean;
  log?: boolean;
  bodyweight?: boolean;
  timed?: boolean;
  increment?: number;
  alts?: Alt[];
}

/** What a block is FOR. */
export type BlockRole = 'primer' | 'main' | 'accessory';

/** How a block is RUN. Independent of what it is for, which is the whole reason this is a separate
 *  field.
 *
 *  The old model had one `type` of 'main' | 'superset' | 'pair', which conflated the two and got
 *  both wrong. 'superset' and 'pair' produced the IDENTICAL instruction string and the identical
 *  rendering, so they were one concept wearing two names. Meanwhile every 'main' block held two
 *  exercises and told him to "do the second between sets of the first", which is what a superset
 *  IS, while being the only paired block not drawn as one. He spotted it from the screen alone on
 *  2026-08-15: "I also think 2 is a superset. It's just that it doesn't have that line or I have no
 *  idea really if it's a superset."
 *
 *  Splitting the two makes "a main lift that is supersetted" expressible, which it previously was
 *  not. */
export type BlockPairing = 'alternate' | 'sequence';

export interface Block {
  role: BlockRole;
  pairing: BlockPairing;
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

/** Run, bike and swim. Lives in content/gym/conditioning.json and renders at /gym/conditioning,
 *  deliberately NOT inside the workout page: it is read in the morning before a treadmill or at
 *  the poolside, not between sets with wet hands.
 *
 *  `string | string[]` on the prose fields is not laziness. JSON has no multi-line string, and
 *  these carry the reasoning (which trial, which numbers, why this dose and not double it) that
 *  the whole programme rests on. An array is how a paragraph survives in a file that has to stay
 *  diffable. */
type Prose = string | string[];

/** `session` is a sequence of CLOCK TIMES, not distances, since 2026-08-21. He ran 3.1x the week-1
 *  prescription on 2026-08-19 at a speed that was entirely correct, because the distance target
 *  lived on a treadmill console he does not trust and believes is in miles. A clock cannot be in the
 *  wrong unit, so `consoleCheck` is an after-the-fact confirmation in BOTH units and never the
 *  target. Every one of these strings is computed in the patch script from the belt speeds and the
 *  original Bertelsen doses, never typed. */
export interface ConditioningWeek {
  week: number;
  runKm: number;
  session: string;
  clockTotal: string;
  consoleCheck: string;
  note?: string;
}

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

/** A technique cue. Added 2026-08-16, because the plan said how hard and how long and never how,
 *  and he has never run or cycled.
 *
 *  `test` is not optional and it is the whole design: a cue has to be something he PERFORMS with a
 *  yes-or-no answer, never a sense he has to have. Same rule as `doneness.test` on a recipe, learned
 *  the same way.
 *
 *  `confidence` is rendered on the page rather than kept in a file. `convention` means good coaching
 *  practice with no study behind it, and labelling that honestly is what makes the `evidence` rows
 *  worth anything. */
export interface Cue {
  name: string;
  cue: string;
  test: string;
  why?: string | null;
  confidence: 'evidence' | 'convention' | 'contested';
  /** A real citation with the URL that was fetched, or the literal word CONVENTION. */
  grounding?: string | null;
  url?: string | null;
}

export interface Conditioning {
  slots: {
    morning: { name: string; what: string; why: string };
    evening: { name: string; what: string; why: string };
    poolTimes: Record<string, string>;
  };
  run: {
    title: string;
    surface: string;
    sessionsPerWeek: number;
    startedFrom: string;
    why: Prose;
    howHard: { primary: string; secondary: string; startingSpeed: string };
    /** The two belt settings in km/h AND mph, plus the one-off test that tells him which unit his
     *  console is in. Both units, because being right in either beats being right in the one he
     *  turns out not to have. */
    beltSettings: { run: string; walk: string; theUnitTest: string; whyBothUnits: string };
    whyTheClockNotTheConsole: Prose;
    weeks: ConditioningWeek[];
    rules: string[];
  cues?: Cue[];
    /** What was dropped from the cue set and why, which is the more useful half. */
    cuesNote?: string | null;
  };
  bike: {
    title: string;
    surface: string;
    sessionsPerWeek: number;
    why: Prose;
    protocol: { name: string; structure: string; totalMinutes: number; shortVersion: string; evidenceNote: string };
    howHard: { hardPiece: string; heartRate: string; easyPiece: string };
    rules: string[];
  cues?: Cue[];
    /** What was dropped from the cue set and why, which is the more useful half. */
    cuesNote?: string | null;
  };
  swim: {
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
  };
}

/* HandstandStep was removed on 2026-08-16 along with content/gym/handstand-ladder.json and the
 * pike-hold block that opened both upper days. Silvio: "Let's take out the part of the headstand.
 * I'm not gonna do that." He had never logged a single set of it in 427 sets. Nothing imported the
 * ladder JSON either, so it was a five-step progression that existed only on disk. Recoverable from
 * git history if it is ever wanted back. */
