import 'server-only';
import { sql } from '../health/db';
import { today, dayOf, daysAgo } from '../day';
import { loadConditioning } from './program';
import type { Conditioning, Program } from './types';

/* THE INTEGRATED WEEK. Built 2026-08-21, because until now the week was four separate surfaces and
 * none of them knew the others existed.
 *
 * His words: "what about the rest days where did we land on that is there anything like too much? i
 * swam today already but i feel like i still have energy, is that going tobe incliuded in the
 * program, i want the whole thing to be integrated."
 *
 * Four lifting days lived in program.json, three runs and a bike and three to four swims lived in
 * conditioning.json, the real attendance lived in the watch export, and the load lived in gym_set.
 * Nothing summed them, so "is this too much" had no answer anywhere in the project. He then chose
 * the rule that turns the sum into a judgment: never more than three training days in a row.
 *
 * TWO NUMBERS, AND THEY ARE NOT THE SAME NUMBER. The plan says four training days with a maximum run
 * of two. The watch says he did seven in a row from 2026-08-14 to 08-20 after four days completely
 * off. Reporting only the plan would be describing an intention; reporting only the actual would lose
 * what he is drifting from. So both, side by side, which is the only shape in which the drift is
 * visible.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM. It is arithmetic on load, not a recovery measurement.
 * `recovery` below carries how many days since sleep and HRV were last recorded, and on the day this
 * was written that was six, because the watch is worn all day and taken off at night. A page that
 * printed "you are recovered" off session counts would be inventing a measurement it does not have.
 */

export type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const WEEKDAYS: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** One day of the plan: what the programme asks for on this weekday. */
export interface PlannedDay {
  weekday: WeekdayKey;
  /** The lifting day key from program.json, or null when the split has no day here. */
  liftKey: string | null;
  liftTitle: string | null;
  /** Conditioning slots assigned to this weekday, e.g. ['morningCardio', 'swim']. */
  slots: string[];
  training: boolean;
}

/** One real day, from the watch. */
export interface ActualDay {
  date: string;
  weekday: WeekdayKey;
  /** Sessions the watch recorded, walking already excluded by the mirror. */
  sessions: { kind: string; minutes: number }[];
  minutes: number;
  trained: boolean;
  /** Whether the app logged load for this day, as distinct from the watch seeing a session. */
  logged: boolean;
  /** False past the export horizon: nothing is known about this day, which is not the same as rest. */
  known: boolean;
  /** How many consecutive training days end on this day. 0 on a rest day. */
  runLength: number;
  /** True when runLength has passed the rule. */
  overRule: boolean;
}

export interface RecoveryFreshness {
  metric: string;
  lastSeen: string | null;
  daysSince: number | null;
}

export interface TrainingWeek {
  rule: {
    maxConsecutive: number;
    text: string;
    decidedOn: string;
  };
  plan: {
    days: PlannedDay[];
    trainingDays: number;
    longestRun: number;
  };
  actual: {
    days: ActualDay[];
    /** Consecutive training days ending on the most recent KNOWN day. */
    currentRun: number;
    /** Where that run started, for a sentence that names the dates rather than a bare count. */
    currentRunFrom: string | null;
    longestRun: number;
    longestRunFrom: string | null;
    longestRunTo: string | null;
    horizon: string | null;
    /** True when the current run has passed the rule. */
    overRule: boolean;
  };
  /** Sleep and HRV, the only measurements that could turn this arithmetic into an observation. */
  recovery: {
    metrics: RecoveryFreshness[];
    /** The freshest of them, which is the generous reading. */
    daysSinceAny: number | null;
    /** Nothing recorded in over two days means the rule is running on load alone. */
    dark: boolean;
  };
}

/* Two days, not the fourteen CURRENT.md uses for a body measurement. A weigh-in three days old is
 * still roughly true; last night either was or was not recorded, and a rest-day rule that leans on
 * a five-night-old HRV reading is leaning on nothing. */
const RECOVERY_DARK_AFTER_DAYS = 2;

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Which weekday a YYYY-MM-DD Calgary date falls on. Parsed as noon UTC so no offset can shift it. */
export function weekdayOf(date: string): WeekdayKey {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(d + 6) % 7] as WeekdayKey;
}

/** The plan, from program.json plus conditioning.json's slot assignments. No copy of the split. */
export function plannedWeek(program: Program, conditioning: Conditioning): TrainingWeek['plan'] {
  const liftDays = program.days as Record<string, { title?: string } | undefined>;
  const assigned = conditioning.week?.assignedDays ?? {};

  const days: PlannedDay[] = WEEKDAYS.map((weekday) => {
    const lift = liftDays[weekday];
    const slots = Object.entries(assigned)
      .filter(([k, v]) => !k.startsWith('$') && k !== 'why' && Array.isArray(v) && v.includes(weekday))
      .map(([k]) => k);
    return {
      weekday,
      liftKey: lift ? weekday : null,
      liftTitle: lift?.title ?? null,
      slots,
      training: Boolean(lift) || slots.length > 0,
    };
  });

  /* Scanned across two weeks for the same reason validate.mjs does it: a Friday-to-Monday block is
     one run of four, and a single Monday-to-Sunday pass scores it as two runs of two. */
  let run = 0;
  let longest = 0;
  for (const d of [...days, ...days]) {
    if (d.training) {
      run++;
      if (run > longest) longest = run;
    } else run = 0;
  }

  return {
    days,
    trainingDays: days.filter((d) => d.training).length,
    longestRun: Math.min(longest, 7),
  };
}

/* ONE CONSECUTIVE-DAY COUNTER, AND ONLY ONE. Extracted 2026-08-26.
 *
 * Until today this project had two, and showed them as if they were the same number. This one, from
 * the watch, on /gym/conditioning. And a second in cycle.ts built from the app's own log, on /gym
 * and on the hub. They disagreed BY DESIGN, and cycle.ts said so in its own words: the gap it left
 * open was "trained but didn't open the app to log it". Train without logging and one advanced while
 * the other reset, and no page mentioned the other's existence.
 *
 * Deleting the cycle.ts one is what makes the disagreement unrepresentable, rather than a thing
 * every future edit has to remember. That deletion is only SAFE because of the `trained` line
 * below: the surviving counter now counts a day the APP logged as well as a day the WATCH saw, so
 * it is strictly more complete than either of the two it replaces. Removing a counter without that
 * line would have made the days the watch missed worse, not better.
 */
interface ActualBlock {
  days: ActualDay[];
  currentRun: number;
  currentRunFrom: string | null;
  longestRun: number;
  longestRunFrom: string | null;
  longestRunTo: string | null;
  horizon: string | null;
}

async function actualBlock(days: number, maxConsecutive: number): Promise<ActualBlock> {
  const cutoff = daysAgo(days);
  const [sessionRows, loggedRows, horizonRows] = await Promise.all([
    sql`select date, kind, coalesce(minutes, 0)::int as minutes
        from health_watch_session
        where date >= ${cutoff}
        order by date, start_time`,
    sql`select distinct date from gym_set
        where done = true and reps is not null and reps > 0 and date >= ${cutoff}`,
    /* How far the mirror has reached, across every kind. A swim on the 20th proves the sync ran that
       day; an absence of lifting rows does not. Past this date the strip knows nothing and says so
       rather than drawing rest, which is the distinction /health learned to make on 2026-08-14. */
    sql`select max(date) as last from health_watch_session`,
  ]);

  const byDate = new Map<string, { kind: string; minutes: number }[]>();
  for (const r of sessionRows as unknown as { date: string; kind: string; minutes: number }[]) {
    const list = byDate.get(r.date) ?? [];
    list.push({ kind: r.kind, minutes: r.minutes });
    byDate.set(r.date, list);
  }
  const logged = new Set((loggedRows as unknown as { date: string }[]).map((r) => r.date));
  const horizon = (horizonRows[0] as { last: string | null } | undefined)?.last ?? null;

  const out: ActualDay[] = [];
  let run = 0;
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgo(i);
    const sessions = byDate.get(date) ?? [];
    const isLogged = logged.has(date);
    /* A LOGGED DAY IS A TRAINED DAY, added 2026-08-26 with the counter merge above.
       The watch is the better witness but it is not the only one: it misses a session recorded on
       the phone, one where the watch was flat, and one it recorded but could not classify. Before
       this line those days broke the run, which is precisely the hole the second counter existed to
       cover. `logged` stays a separate field because "the app has load for this day" is still a
       different and useful fact from "something trained here". */
    const trained = sessions.length > 0 || isLogged;
    run = trained ? run + 1 : 0;
    out.push({
      date,
      weekday: weekdayOf(date),
      sessions,
      minutes: sessions.reduce((a, s) => a + s.minutes, 0),
      trained,
      logged: isLogged,
      /* A day the app logged is known on the app's own evidence, whatever the mirror has reached. */
      known: isLogged || (horizon != null && date <= horizon),
      runLength: run,
      overRule: run > maxConsecutive,
    });
  }

  /* The CURRENT run ends at the last day anything is KNOWN about, not at today. Counting to today
     would reset the run to zero every morning before the mirror has caught up, and would then
     announce a rest day he has not taken. */
  const lastKnown = [...out].reverse().find((d) => d.known);
  const currentRun = lastKnown?.runLength ?? 0;
  const currentRunFrom =
    currentRun > 0 && lastKnown
      ? (out[out.indexOf(lastKnown) - (currentRun - 1)]?.date ?? lastKnown.date)
      : null;

  let longestRun = 0;
  let longestEndIdx = -1;
  out.forEach((d, i) => {
    if (d.runLength > longestRun) {
      longestRun = d.runLength;
      longestEndIdx = i;
    }
  });

  return {
    days: out,
    currentRun,
    currentRunFrom,
    longestRun,
    longestRunFrom:
      longestEndIdx >= 0 ? (out[longestEndIdx - (longestRun - 1)]?.date ?? null) : null,
    longestRunTo: longestEndIdx >= 0 ? (out[longestEndIdx]?.date ?? null) : null,
    horizon,
  };
}

/** The streak on its own, for surfaces that want the number without the whole week.
 *
 *  Loads conditioning itself rather than taking it as a parameter, so a caller cannot accidentally
 *  judge the run against a different rest rule than the week page uses. The count and the ceiling
 *  it is judged against come from the same place or they do not come at all: /gym used to nudge at
 *  five consecutive days while conditioning.json's rule has been a maximum of three. */
export interface TrainingStreak {
  /** Consecutive training days ending on the most recent KNOWN day. */
  run: number;
  /** Where that run started, so a sentence can name the date rather than print a bare count. */
  from: string | null;
  maxConsecutive: number;
  overRule: boolean;
}

export async function getTrainingStreak(days = 28): Promise<TrainingStreak> {
  const conditioning = await loadConditioning();
  const maxConsecutive = conditioning.week?.restRule?.maxConsecutive ?? 3;
  const block = await actualBlock(days, maxConsecutive);
  return {
    run: block.currentRun,
    from: block.currentRunFrom,
    maxConsecutive,
    overRule: block.currentRun > maxConsecutive,
  };
}

/**
 * The real week from the watch, plus the run-length arithmetic the rule is judged on.
 *
 * `days` counts back far enough to see the run he is currently in, not just the last seven: a
 * seven-day block read through a seven-day window reports a run of seven with no idea whether day
 * eight is also training. 28 days is four weeks of context for a few hundred bytes.
 */
export async function getTrainingWeek(
  program: Program,
  conditioning: Conditioning,
  days = 28,
): Promise<TrainingWeek> {
  const maxConsecutive = conditioning.week?.restRule?.maxConsecutive ?? 3;
  const [block, recoveryRows] = await Promise.all([
    actualBlock(days, maxConsecutive),
    sql`select metric, last_seen from health_recovery order by metric`,
  ]);
  const {
    days: out, currentRun, currentRunFrom, longestRun, longestRunFrom, longestRunTo, horizon,
  } = block;
  const now = today();

  const metrics: RecoveryFreshness[] = (
    recoveryRows as unknown as { metric: string; last_seen: string | null }[]
  ).map((r) => ({
    metric: r.metric,
    lastSeen: r.last_seen,
    daysSince: r.last_seen ? daysBetween(r.last_seen, now) : null,
  }));
  const freshest = metrics
    .map((m) => m.daysSince)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)[0];

  return {
    rule: {
      maxConsecutive,
      text: conditioning.week?.restRule?.rule ?? `Never more than ${maxConsecutive} training days in a row.`,
      decidedOn: conditioning.week?.restRule?.decidedOn ?? '',
    },
    plan: plannedWeek(program, conditioning),
    actual: {
      days: out,
      currentRun,
      currentRunFrom,
      longestRun,
      longestRunFrom,
      longestRunTo,
      horizon,
      overRule: currentRun > maxConsecutive,
    },
    recovery: {
      metrics,
      daysSinceAny: freshest ?? null,
      /* No rows at all is also dark, and is the more likely state on a fresh database. Saying
         "recovery data is dark" when the table is empty is true; saying nothing would let the page
         imply the rule was checked against a measurement. */
      dark: freshest == null || freshest > RECOVERY_DARK_AFTER_DAYS,
    },
  };
}

/** Kind labels. The mirror stores the watch's own vocabulary; this is what a person reads. */
export const KIND_LABEL: Record<string, string> = {
  strength: 'lifting',
  swimming: 'swim',
  treadmill: 'run',
  running: 'run',
  cycling: 'bike',
  /* Two different things, and one word for both was wrong. See the split in
     HealthOS/server/import-watch-sessions.mjs: 'other' is a workout he started and did not name,
     'other-auto' is one the watch invented ten minutes in and could not name either. Both count as
     a training day; only one of them is a session he decided to do. */
  other: 'workout, unnamed',
  'other-auto': 'movement the watch noticed',
};

export const SLOT_LABEL: Record<string, string> = {
  morningCardio: 'morning run or bike',
  swim: 'evening swim',
};

export { dayOf };
