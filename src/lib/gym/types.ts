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

/** Which number moves week to week. Required on anything logged, and validate.mjs fails the build
 *  without it.
 *
 *  Added 2026-08-22 because he read his own programme and asked the question nobody had:
 *  "why band pull apart is an exercise inside the program. How is that actually something that I
 *  can progressively overload? Okay so I'm gonna do 15 this week. Is it a big deal that I do 16
 *  next week?" A band's resistance is what separates an easy set from a hard one, this app has
 *  nowhere to record which band, and so 3x15 on a light one and 3x15 on a heavy one were the same
 *  row forever. Anything with no honest answer here belongs in warmups.json. */
export type Progression = 'weight' | 'reps' | 'time';

export interface Alt {
  id: string;
  name: string;
  cue: string;
  /** Defaults to the parent exercise's axis when absent. See Progression. */
  progression?: Progression;
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
  /** Widens the double-progression rep range so the next load step is actually reachable from the
   *  top of it. See the RANGE_WIDTH note in progression.ts. Default 2. */
  rangeWidth?: number;
  /** Counterweight rather than load: less of it is HARDER, so progress means this number falls.
   *  The assisted pull-up is the only one today. Its cue has always told him "it is the one number
   *  here that should go DOWN over time" while the engine added an increment, which would have put
   *  "+10 lb" on a card directly above that sentence. A fact about the machine, not a judgement. */
  assistance?: boolean;
  log?: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  rest: string;
  cue: string;
  /** Required whenever `log` is not false. See Progression. */
  progression?: Progression;
  zone: ZoneKey;
  station: Station;
  needsFloor?: boolean;
  log?: boolean;
  bodyweight?: boolean;
  timed?: boolean;
  increment?: number;
  /** Widens the double-progression rep range so the next load step is actually reachable from the
   *  top of it. See the RANGE_WIDTH note in progression.ts. Default 2. */
  rangeWidth?: number;
  /** Counterweight rather than load: less of it is HARDER, so progress means this number falls.
   *  The assisted pull-up is the only one today. Its cue has always told him "it is the one number
   *  here that should go DOWN over time" while the engine added an increment, which would have put
   *  "+10 lb" on a card directly above that sentence. A fact about the machine, not a judgement. */
  assistance?: boolean;
  /** ONE CLAUSE SAYING WHY THIS PARTNER IS IN THIS BLOCK, printed on its own row, no tap.
   *
   *  Only the PARTNER (last exercise of the block) may carry it, and validate.mjs fails the build
   *  if the string is not a verbatim span of its own block's `why`, first-character case aside.
   *
   *  Both halves of that are load-bearing. Five of his eighteen gym notes ask "why is this here",
   *  and all eleven exercises they name sit at position 2, never a lead lift. The reason was
   *  already written and already rendered, collapsed behind a summary reading "Why this is here"
   *  while he was looking at a calf raise, so the failure was REACH, not reasoning. And note #12,
   *  eight days later: "Walls of text again why do I need all this, just leave the cue and thats
   *  it, it can even be hidden". The verbatim-span gate is what keeps this field from becoming that
   *  wall one honest-looking clause at a time; nothing new can be said here.
   *
   *  A partner whose block `why` does not explain it gets `open` instead, not an invented reason. */
  whyHere?: string;
  /** Questions only he can answer, parked on the thing they are about. His ruling, 2026-08-27, over
   *  a second UNKNOWNS.md file: the question lives where the next agent is already reading.
   *
   *  validate.mjs checks the shape; `scripts/gym-notes.mjs` surfaces them and goes red past `due`,
   *  because a build that turns red overnight with no file edited would block an unrelated deploy.
   *  Same reason check-ladder.mjs is not in the validator. */
  open?: OpenQuestion[];
  /** Ids this slot used to carry, whose rows are still in `gym_set` under the old name.
   *
   *  NOT AN ALIAS, and the difference decides what happens to his numbers. An alias in
   *  `movements.json` means one movement and one history, and `equivalent-ids.ts` merges the sets
   *  on every read; that is right for a machine calf raise and a standing calf raise. These are two
   *  movements: 50 lb of dumbbell held in two hands is not 50 lb of cable. So this is a pointer for
   *  a reader, never a merge, and nothing in the progression path reads it.
   *
   *  It exists because "he has never done this" and "he did it under another name three days ago"
   *  were indistinguishable, and three cards said "First time: log your working weight" for
   *  movements he did on 2026-08-25. `scripts/check-ladder.mjs` names both states now, and reports
   *  a recent id the programme no longer knows that no slot claims, which is the same rename
   *  happening again with nobody recording it. */
  formerIds?: string[];
  alts?: Alt[];
}

/** One question for Silvio, recorded where the thing it is about lives. */
export interface OpenQuestion {
  /** WHAT THE QUESTION IS ABOUT, and the only one of these values that is load-bearing is
   *  `placement`. `content/gym/validate.mjs` requires a partner exercise to carry either a
   *  `whyHere` or a `placement` question, and the card's fallback line ("no reason recorded yet")
   *  renders on the same condition. Before this field existed both read `open.length`, so a
   *  question about a CUE satisfied a gate about why the exercise is there, and the card announced
   *  that nothing was known while the reason sat one tap above it in the block's `why`. */
  topic: 'placement' | 'cue' | 'prescription' | 'equipment' | 'volume';
  /** The question, with enough context that he does not have to reconstruct it. He answers in one
   *  word; carrying the context is this field's job, not his. Ends in a question mark, and the
   *  validator refuses it otherwise: three rows once held a true statement and asked nothing, and
   *  gym-notes.mjs printed all three to him with due dates on them. */
  q: string;
  /** YYYY-MM-DD. */
  asked: string;
  /** YYYY-MM-DD, after `asked`. Past this, gym-notes.mjs reports it as overdue. The farmer carry
   *  had three contradictory answers live in the app for five days because a 2026-08-22 audit
   *  concluded it was "a decision to put to Silvio, not to invent" and then nobody put it to him. */
  due: string;
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
 *  not.
 *
 *  'fill' was added 2026-08-21 and is now the commonest of the three. Eleven of the thirteen
 *  'alternate' blocks were one real lift plus a band, plank, bridge or carry, while the app told him
 *  "Superset: alternate the two, rest once after both". His instinct that this was not a superset
 *  was right, and the honest description is the third state: the partner is done INSIDE the lift's
 *  rest gaps and adds no time to the session.
 *
 *  That is not a demotion of the partner. Sessions run 81 to 120 minutes with 45 to 75% of the time
 *  below 110 bpm, so filling the rest is the mechanism that shortens them. It is also why a 'fill'
 *  partner is free in time: it happens inside a rest window that is being paid for anyway. */
export type BlockPairing = 'alternate' | 'sequence' | 'fill';

export interface Block {
  role: BlockRole;
  pairing: BlockPairing;
  label: string;
  tag?: string;
  /** One line on why this block is in the programme, and where that comes from. NOT optional, and
   *  validate.mjs fails the build without it.
   *
   *  He said the whole programme reads as arbitrary because he had never seen
   *  HealthOS/knowledge/training-programme-evidence.md, and a programme he does not believe is one
   *  he stops finishing. Where a block has nothing behind it (calf raise, rotator cuff, Copenhagen
   *  plank, biceps) the line says so, because that admission is what makes the sourced lines worth
   *  reading. */
  why: string;
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

/** `time` was removed 2026-08-21. It was a typed string saying "75-85 min" on days the app's own
 *  budget model puts at 100 to 106, while the watch says his real sessions run 81 to 120. Three
 *  numbers for one quantity, and the typed one was the only one nothing could check. The page
 *  computes it from the sets and rest now, and shows what the total is made of. */
export type WarmupKey = 'lower' | 'upper' | 'posture';

export interface Day {
  name: string;
  title: string;
  desc?: string;
  /** One region list, or a list of lists since 2026-09-04: every session carries its region
   *  warm-up AND the posture list, on his ask. validate.mjs checks the FIRST entry against the
   *  region of the first working lift and that every entry exists in warmups.json. */
  warmup: WarmupKey | WarmupKey[];
  cooldown: string[];
  /** The weekdays this session is scheduled on. TWO of them since 2026-09-03: the week is two
   *  sessions alternated, so each is trained twice. Only the plan view on /health and the rest-rule
   *  gate read this; the rotation itself is decided by cycle.ts from what was actually done. */
  scheduledOn: string[];
  blocks: Block[];
}

/** SESSION IDS, not weekdays, since 2026-09-03. A and B alternate (the lifting rotation, each twice
 *  a week); C is the Saturday athletic session, once a week, outside the rotation, since 2026-09-04.
 *  Which weekday a session is SCHEDULED on is `Day.scheduledOn`, a different fact that only the plan
 *  view and the rest-rule gate need. See the note at the top of content/gym/program.json. */
export type DayKey = 'a' | 'b' | 'c';

/** WHAT THE LIFTING IS FOR, in his words. Required; validate.mjs fails the build without it. It was
 *  stated five times between May and September 2026 and written nowhere, and every rebuild in that
 *  window was made against a criterion an agent chose instead. */
export interface Goal {
  his: string;
  measuredBy: string;
  inHisWords: { on: string; said: string }[];
  decided: string;
  assumptions?: string[];
}

/** THE FREEZE. The structural hash of `days` (session keys, weekdays, block roles, exercise ids,
 *  sets, reps) may not change before `until` unless `changes` carries an entry quoting his words
 *  and the new hash. Cue and why text are not part of the hash. See content/gym/structural-hash.mjs. */
export interface Frozen {
  until: string;
  daysHash: string;
  changes: { on: string; hisWords: string; hash: string }[];
}

export interface Program {
  goal: Goal;
  frozen: Frozen;
  days: Record<DayKey, Day>;
}

/** Run and bike. Lives in content/gym/conditioning.json and renders at /gym/conditioning,
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
  confidence: 'evidence' | 'convention' | 'contested' | 'sourced';
  /** A real citation with the URL that was fetched, or the literal word CONVENTION. */
  grounding?: string | null;
  url?: string | null;
  /** The verbatim sentence from the source. Added 2026-08-22, at his instruction: "I don't want
   *  hallucination here so try to keep it as literal as you can." validate.mjs requires one on any
   *  cue claiming to be sourced, and the renderer prints it, because a quote nobody can see does
   *  the same job as no quote at all. Nine were added to content/swim/teaching.json before
   *  anybody noticed this component had nowhere to put them. */
  quote?: string | null;
  /** SWIM ONLY, so far. The entry on the other coaching tab quoting the same sentence, as
   *  "<file>:<id or name>". content/swim/validate.mjs makes both sides declare each other; this is
   *  the half he can see, so a cue that appears twice reads as a decision rather than a copy. */
  sharedWith?: string[] | null;
  source?: string | null;
}

/* THE REST RULE. Chosen by Silvio on 2026-08-21: never more than three training days in a row, a
 * rule rather than a fixed day off, because the finding it answers was density and not volume.
 *
 * `maxConsecutive` is read in two places and both of them execute. content/gym/validate.mjs
 * recomputes the PLANNED week from program.json plus assignedDays and exits non-zero if the
 * programme breaks its own rule, so a self-contradicting plan cannot deploy. src/lib/gym/week.ts
 * counts what the WATCH actually recorded and prints it against the same number. Neither is prose.
 *
 * assignedDays deliberately does NOT restate the lifting split: those keys live in program.json and
 * are read from there. A second copy drifts the first time a day moves. */
export interface RestRule {
  maxConsecutive: number;
  decidedBy: string;
  decidedOn: string;
  rule: string;
  whyThisShape: Prose;
  whatCountsAsTraining: Prose;
  whenItFires: string;
  /** Why three is his number and not a finding. Rendered, never hidden. */
  theHonestCaveat: string;
}

/** Why the week holds four activities rather than one. Sourced from the concurrent-training
 *  evidence, and on the page because it had lived only in a file he had never opened. */
export interface HowItFits {
  title: string;
  lead: string;
  points: { claim: string; detail: string; source: string }[];
  sourceNote: string;
}

export interface ConditioningWeekPlan {
  restRule: RestRule;
  howItFits?: HowItFits;
  /** Slot name to weekday keys. Extra keys are tolerated so a new slot needs no type change. */
  assignedDays: Record<string, string[] | string | undefined> & { why?: Prose };
}

export interface Conditioning {
  slots: {
    morning: { name: string; what: string; why: string };
    evening: { name: string; what: string; why: string };
    poolTimes: Record<string, string>;
  };
  /** Optional in the type so an older conditioning.json still parses; validate.mjs makes it
   *  mandatory in practice by failing the build when it is missing. */
  week?: ConditioningWeekPlan;
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
}

/* HandstandStep was removed on 2026-08-16 along with content/gym/handstand-ladder.json and the
 * pike-hold block that opened both upper days. Silvio: "Let's take out the part of the headstand.
 * I'm not gonna do that." He had never logged a single set of it in 427 sets. Nothing imported the
 * ladder JSON either, so it was a five-step progression that existed only on disk. Recoverable from
 * git history if it is ever wanted back. */

/* SWIM TYPES LEFT THIS FILE on 2026-08-26 and are in src/lib/swim/types.ts: BaselineFact,
 * SwimLadderStep, SwimCalibration, SwimPlan, TeachingStage, SwimCoaching and SwimTeaching, plus the
 * `swim` member that used to hang off Conditioning above. Swim stopped being a tab on
 * /gym/conditioning and became its own route, and its types followed its content to content/swim/.
 *
 * `Cue` deliberately STAYED here. Run and bike cues are the same shape and the swim types import
 * it from this file, which is the honest direction: the cue is the shared idea, swim is not. */
