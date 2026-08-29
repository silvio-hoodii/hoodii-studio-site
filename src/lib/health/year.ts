import 'server-only';
import { sql } from './db';
import { today } from '../day';
import { splitOf, sameSourcePair, type Split } from './split';
import { loadMovements, loadProgram } from '../gym/program';

/* THE YEAR SO FAR. Built 2026-08-28, on his ask: "the main number that I want to see is the
 * difference between the highest weight that I've had this year and the lowest ... I want a big
 * number ... Let's analyze all the other metrics and how the progress has been in just this past
 * year."
 *
 * NOTHING IN THIS FILE IS TYPED INTO PROSE, and nothing the page prints is typed either. That is
 * the discipline /swim/deep paid for: its shipped copy read "the heaviest band is also the period
 * he swam most", which is the obvious confound and is false, and typecheck, lint, build and a full
 * text dump of the rendered page all passed with it in place. Every figure below is returned from a
 * query, including the figures about the data's own limits.
 *
 * THE YEAR IS DERIVED FROM `today()`, never typed. A page headed "2026" that is still headed 2026
 * next January is the `inProgramme` disease with a date on it.
 *
 * FOUR THINGS THAT WOULD HAVE BEEN WRONG IF ASSUMED, each settled by query rather than by argument:
 *
 * 1. THE PEAK IS THE HIGHEST READING, NOT THE HIGHEST WEIGHT. The first body-composition reading of
 *    2026 is 2026-02-13, six weeks into the year, and it is also the year's highest. Whatever he
 *    weighed in January is not in this table and no page may imply it was lower. `recordStarts` is
 *    returned so the page can say where the record actually begins.
 *
 * 2. THE WEIGHT HEADLINE MAY CROSS INSTRUMENTS. THE COMPOSITION SPLIT MAY NOT. On the 36 days
 *    carrying both a Scale and a Watch reading the two agree about WEIGHT to a worst case of
 *    0.050 kg and disagree about FAT MASS by up to 2.450 kg (09-health P2-3, re-derived here rather
 *    than quoted). With a real change of 1 to 3 kg the instrument artifact can be larger than the
 *    thing being measured, so the split is computed only across endpoints sharing a source, and
 *    both worst-case gaps are RETURNED so the page states them instead of the reader trusting them.
 *
 * 3. THE TRAINING YEAR AND THE WEIGHING YEAR ARE DIFFERENT YEARS. `health_watch_session` reaches
 *    back to 2026-01-05 and body composition starts 2026-02-13, and between 2025-11-20 and
 *    2026-02-03 there are two isolated training days. `longestGap` is derived so the page can show
 *    the layoff rather than average over it.
 *
 * 4. THE GYM APP'S LOG IS NOT THE TRAINING RECORD. The watch has seen every session; `gym_set` only
 *    holds what he typed, and its first row this year is months after his first session. `logStart`
 *    is returned so the strength section carries its own scope rather than reading as the year.
 *
 * DATE COLUMNS. Every table read here (`health_body_comp`, `health_watch_session`, `gym_set`,
 * `health_swim_pb`) is stamped in Calgary local time. `health_swim_session` and
 * `health_swim_length` are UTC and are NOT read here: see the four-date-columns note in AGENTS.md
 * and `SWIM_LOCAL_DATE` in src/lib/swim/db.ts. `health_swim_pb.achieved_on` is a date the watch
 * awarded, not a session join, so it carries no time-of-day to be wrong about.
 *
 * ROUND TRIPS. One `sql.transaction`, the construction `getShelfBundle` was written to introduce,
 * because Neon is this account's entire external-API bill and a page of year totals is the shape
 * that quietly issues twelve queries. */

export interface Reading {
  date: string;
  source: string;
  kg: number;
  bf_pct: number | null;
  fat_kg: number | null;
  lean_kg: number | null;
  skm_kg: number | null;
  water_kg: number | null;
  bmr_cal: number | null;
  bmi: number | null;
}

/** One body measurement's movement across the year, peak reading to newest reading.
 *
 *  THERE IS NO `downIsProgress` FLAG HERE, and one was written and then removed the same hour. It
 *  would have driven nothing: the page deliberately colours no row, because on a cut weight and fat
 *  falling is the plan while lean mass and muscle falling is the cost, and one colour cannot mean
 *  both. That argument belongs in the caption, where it is, and a field nothing reads is a field a
 *  later session counts as evidence the feature exists (09-health P3-4). */
export interface Metric {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  from: number;
  to: number;
  delta: number;
}

export interface YearBody {
  year: number;
  /** Highest weight RECORDED this year. Not the highest weight reached: see note 1 above. */
  peak: Reading;
  /** Lowest weight recorded this year. */
  low: Reading;
  /** Newest reading this year, which is usually but not always the low. */
  latest: Reading;
  /** low.kg minus peak.kg. Negative when he lost, which is the number he asked for. */
  deltaKg: number;
  /** Calendar days from the peak reading to the low reading. */
  spanDays: number;
  kgPerWeek: number;
  lowIsLatest: boolean;
  readings: number;
  recordStarts: string;
  /** Peak and low come from different instruments. Tolerable for weight, and the page says so. */
  peakLowMixedSource: boolean;
  /** Every other measurement, peak reading to newest reading. */
  metrics: Metric[];
  /** The year's readings as chart series. Weight from every reading; fat and lean only from
   *  readings carrying both, so a scale-only day cannot put a point on a line it did not measure. */
  weightSeries: { date: string; value: number }[];
  fatSeries: { date: string; value: number }[];
  leanSeries: { date: string; value: number }[];
  /** Fat and lean across the same interval, and only when both endpoints share an instrument. */
  split: Split | null;
  splitFrom: Reading | null;
  splitTo: Reading | null;
  /** Worst same-day disagreement between the two instruments, derived, both columns. */
  instrument: { days: number; worstKg: number | null; worstFatKg: number | null };
}

export interface Discipline {
  kind: string;
  sessions: number;
  days: number;
  minutes: number;
  /** The most recent session of this kind. There is no `first`, and one was selected and removed:
   *  every discipline's first session of the year is within days of the others, so the column said
   *  the same thing seven times and cost the table a column at 390px. */
  last: string;
}

export interface MonthCount {
  month: string;
  days: number;
  sessions: number;
  minutes: number;
}

export interface YearTraining {
  disciplines: Discipline[];
  sessions: number;
  days: number;
  minutes: number;
  months: MonthCount[];
  firstDay: string;
  /** How far the watch export has reached, across every kind. Past this the year is unknown. */
  horizon: string | null;
  /** The longest run of consecutive days with no session, inside the year's own record. */
  longestGap: { days: number; from: string; to: string } | null;
  /** Same figures for the whole of last year, for one comparison the page is allowed to draw. */
  lastYear: { sessions: number; days: number; minutes: number } | null;
}

export interface Lift {
  id: string;
  name: string;
  sessions: number;
  firstDate: string;
  firstTop: number;
  lastDate: string;
  lastTop: number;
  delta: number;
  /** The assisted pull-up logs counterweight, so LESS is progress. Read off program.json. */
  assistance: boolean;
}

export interface YearStrength {
  /** First date `gym_set` holds this year. The strength section's real scope, not the year. */
  logStart: string | null;
  sets: number;
  days: number;
  /** Lifts logged on two or more days this year, so a delta means something. Alias-merged. */
  lifts: Lift[];
  /** Logged on exactly one day, so they have a weight and no trajectory. Counted, not listed. */
  singleSessionLifts: number;
}

export interface Pb {
  distanceM: number;
  thisYearMs: number;
  onDate: string;
  beforeMs: number | null;
  beforeDate: string | null;
  /** Positive milliseconds taken off the previous best. Null when there was no previous best. */
  improvedMs: number | null;
}

export interface YearReview {
  year: number;
  body: YearBody | null;
  training: YearTraining;
  strength: YearStrength;
  swimPbs: Pb[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/* Which measurements get a row, in the order they are read. Weight is deliberately absent: it is the
   headline and printing it twice invites the two to disagree.

   BMI IS IN THIS LIST FOR A REASON. It is populated on every row of `health_body_comp`, mirrored by
   content/health/sync.mjs on every run, published by HealthOS/CURRENT.md, and until today it was
   read by nothing at all in this repo (09-health P2-8). A column written every run and read by
   nothing is the shape that gets deleted by a later cleanup as dead weight. */
const METRICS: { key: keyof Reading; label: string; unit: string; decimals: number }[] = [
  { key: 'bf_pct', label: 'Body fat', unit: '%', decimals: 1 },
  { key: 'fat_kg', label: 'Fat mass', unit: 'kg', decimals: 1 },
  { key: 'lean_kg', label: 'Lean mass', unit: 'kg', decimals: 1 },
  { key: 'skm_kg', label: 'Skeletal muscle', unit: 'kg', decimals: 1 },
  { key: 'water_kg', label: 'Total body water', unit: 'kg', decimals: 1 },
  { key: 'bmr_cal', label: 'Resting burn', unit: 'cal/day', decimals: 0 },
  { key: 'bmi', label: 'BMI', unit: '', decimals: 1 },
];

/** The year's body range on its own, for the Weight tab's headline.
 *
 *  IT IS THE SAME FUNCTION THE DEEP PAGE USES, and that is the whole reason it exists. The Weight
 *  tab prints the headline figure and /health/deep prints it again with the working shown; two
 *  computations of one number drift while both keep printing plausible values, which is the argument
 *  `src/lib/gym/coverage.mts` already won for the Volume tab. One round trip. */
export async function getYearBody(): Promise<YearBody | null> {
  const year = Number(today().slice(0, 4));
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  /* `readOnly` is not decoration on a page that must never write: /health has no write path at all
     and this keeps it that way at the driver rather than by convention. */
  const [comp, instrument] = await sql.transaction(
    [
      sql`select date, source, kg, bf_pct, fat_kg, lean_kg, skm_kg, water_kg, bmr_cal, bmi
          from health_body_comp
          where kg is not null and date >= ${from} and date <= ${to}
          order by date asc`,

      /* The two instruments, measured against each other rather than quoted from an audit. Every day
         carrying both a Scale and a Watch reading, across the WHOLE table and not just this year:
         nineteen readings is too few to characterise an instrument. */
      sql`select count(*)::int as days,
                 max(abs(w.kg - s.kg)) as worst_kg,
                 max(abs(w.fat_kg - s.fat_kg)) as worst_fat
          from health_body_comp w
          join health_body_comp s on w.date = s.date
          where w.source = 'Watch' and s.source = 'Scale'
            and w.kg is not null and s.kg is not null`,
    ],
    { readOnly: true },
  );

  return buildBody(
    year,
    comp as unknown as Reading[],
    instrument as unknown as { days: number; worst_kg: number | null; worst_fat: number | null }[],
  );
}

export async function getYearReview(): Promise<YearReview> {
  const year = Number(today().slice(0, 4));
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const lastFrom = `${year - 1}-01-01`;
  const lastTo = `${year - 1}-12-31`;

  /* TWO ROUND TRIPS, NOT ONE, AND THE SECOND ONE IS THE PRICE OF NOT WRITING THAT QUERY TWICE.
     Folding the two body statements in here would make this a single transaction and would put a
     second copy of the year's body arithmetic on the site. The Weight tab prints the same headline
     figure, and two implementations of one number is the failure `inProgramme` and the four swim
     date columns are both examples of. They run concurrently, so this is one wait rather than two. */
  const [body, rest] = await Promise.all([
    getYearBody(),
    sql.transaction(
      [
        sql`select kind, count(*)::int as sessions, count(distinct date)::int as days,
                   coalesce(sum(minutes), 0)::int as minutes, max(date) as last
            from health_watch_session
            where date >= ${from} and date <= ${to}
            group by kind order by count(*) desc`,

        sql`select substring(date, 1, 7) as month, count(distinct date)::int as days,
                   count(*)::int as sessions, coalesce(sum(minutes), 0)::int as minutes
            from health_watch_session
            where date >= ${from} and date <= ${to}
            group by 1 order by 1`,

        sql`select distinct date from health_watch_session
            where date >= ${from} and date <= ${to} order by date`,

        sql`select max(date) as horizon from health_watch_session`,

        sql`select count(*)::int as sessions, count(distinct date)::int as days,
                   coalesce(sum(minutes), 0)::int as minutes
            from health_watch_session where date >= ${lastFrom} and date <= ${lastTo}`,

        sql`select count(*)::int as sets, count(distinct date)::int as days, min(date) as log_start
            from gym_set
            where done = true and reps > 0 and date >= ${from} and date <= ${to}`,

        /* THE TOP SET PER LIFT PER DAY, one row each, and the grouping happens in JS.
           It used to pick first and last per `exercise_id` in SQL with window functions, which
           cannot be right: the alias merge below runs afterwards and joins two ids into one lift,
           so a first-and-last chosen per id is a first and last of the wrong thing. Two ids logged
           on the same day would also have counted as two sessions. Postgres cannot see the
           catalogue, so the grouping belongs where the catalogue is.

           `estimated = true` rows are excluded for the same reason `getLastSession` excludes them:
           54 rows in this table were backfilled from memory and a progression drawn through a
           recalled number is a progression drawn through a guess. `weight > 0` drops the bodyweight
           rows, which are real sets and are not a load trajectory. */
        sql`select exercise_id, max(exercise_name) as name, date, max(weight) as top
            from gym_set
            where done = true and reps > 0 and weight is not null and weight > 0
              and coalesce(estimated, false) = false
              and date >= ${from} and date <= ${to}
            group by exercise_id, date
            order by date asc`,

        /* Every personal best the watch has ever awarded, both sides of the year boundary, because
           "set this year" is only a fact against what stood before it. */
        sql`select distance_m, achieved_on, duration_ms from health_swim_pb
            order by distance_m asc, duration_ms asc`,
      ],
      { readOnly: true },
    ),
  ]);

  const [byKind, byMonth, trainedDays, horizonRow, lastYearRow, setRows, liftRows, pbRows] = rest;

  const dates = (trainedDays as unknown as { date: string }[]).map((r) => r.date);
  const months = byMonth as unknown as MonthCount[];
  const disciplines = byKind as unknown as Discipline[];
  const ly = (lastYearRow as unknown as { sessions: number; days: number; minutes: number }[])[0] ?? null;

  const training: YearTraining = {
    disciplines,
    sessions: disciplines.reduce((n, d) => n + d.sessions, 0),
    days: dates.length,
    minutes: disciplines.reduce((n, d) => n + d.minutes, 0),
    months,
    firstDay: dates[0] ?? '',
    horizon: (horizonRow as unknown as { horizon: string | null }[])[0]?.horizon ?? null,
    longestGap: longestGap(dates),
    lastYear: ly && ly.sessions > 0 ? ly : null,
  };

  return {
    year,
    body,
    training,
    strength: await buildStrength(
      setRows as unknown as { sets: number; days: number; log_start: string | null }[],
      liftRows as unknown as DayTop[],
    ),
    swimPbs: buildPbs(year, pbRows as unknown as { distance_m: number; achieved_on: string; duration_ms: number }[]),
  };
}

/* ------------------------------------------------------------------------------------------------
 * BODY
 * ---------------------------------------------------------------------------------------------- */
function buildBody(
  year: number,
  readings: Reading[],
  instrumentRows: { days: number; worst_kg: number | null; worst_fat: number | null }[],
): YearBody | null {
  /* Two readings is the floor for a range. One reading has no highest and lowest, and rendering a
     0.0 kg change off a single weigh-in is the "not enough history" case wearing a number. */
  if (readings.length < 2) return null;

  /* Ties broken by date, and the direction is chosen rather than left to the sort. The EARLIEST of
     equal peaks and the LATEST of equal lows is the reading of the interval, so a plateau at either
     end returns the widest true span rather than an arbitrary one. */
  let peak = readings[0] as Reading;
  let low = readings[0] as Reading;
  for (const r of readings) {
    if (r.kg > peak.kg) peak = r;
    if (r.kg <= low.kg) low = r;
  }
  const latest = readings[readings.length - 1] as Reading;

  const deltaKg = round1(low.kg - peak.kg);
  const spanDays = daysBetween(peak.date, low.date);
  const kgPerWeek = spanDays > 0 ? Math.round((deltaKg / spanDays) * 7 * 100) / 100 : 0;

  /* Peak to LATEST for the other measurements, not peak to low. The low is a weight fact; every
     other column belongs to whatever reading is newest, and a body-fat percent taken from the
     lowest weigh-in would silently pick a different day for each metric if the two ever diverge.
     Today they are the same reading and the page says which. */
  const metrics: Metric[] = [];
  for (const m of METRICS) {
    const a = peak[m.key];
    const b = latest[m.key];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const d = m.decimals === 0 ? Math.round(b - a) : round1(b - a);
    metrics.push({
      key: String(m.key),
      label: m.label,
      unit: m.unit,
      decimals: m.decimals,
      from: a,
      to: b,
      delta: d,
    });
  }

  /* THE SPLIT'S TWO ENDS MUST SHARE AN INSTRUMENT. The whole argument, and the numbers behind it,
     are in `sameSourcePair`'s header in ./split.ts, which the Weight tab calls too. The page prints
     the interval it was actually given rather than the one asked for. */
  const withSplit = readings.filter((r) => r.fat_kg != null && r.lean_kg != null);
  const pair = sameSourcePair(readings);
  const splitFrom = pair?.[0] ?? null;
  const splitTo = pair?.[1] ?? null;

  const inst = instrumentRows[0];
  return {
    year,
    peak,
    low,
    latest,
    deltaKg,
    spanDays,
    kgPerWeek,
    lowIsLatest: low.date === latest.date,
    readings: readings.length,
    recordStarts: (readings[0] as Reading).date,
    peakLowMixedSource: peak.source !== low.source,
    metrics,
    weightSeries: readings.map((r) => ({ date: r.date, value: r.kg })),
    fatSeries: withSplit.map((r) => ({ date: r.date, value: r.fat_kg as number })),
    leanSeries: withSplit.map((r) => ({ date: r.date, value: r.lean_kg as number })),
    split: splitFrom && splitTo ? splitOf(splitFrom, splitTo) : null,
    splitFrom,
    splitTo,
    instrument: {
      days: inst?.days ?? 0,
      worstKg: inst?.worst_kg != null ? Math.round(inst.worst_kg * 1000) / 1000 : null,
      worstFatKg: inst?.worst_fat != null ? Math.round(inst.worst_fat * 1000) / 1000 : null,
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * TRAINING
 * ---------------------------------------------------------------------------------------------- */
/** The longest run of untrained days INSIDE the record, first trained day to last. Deliberately not
 *  measured from January 1st: the stretch before his first session of the year is a gap in the
 *  export as much as in his training, and the two are not distinguishable from here. */
function longestGap(dates: string[]): { days: number; from: string; to: string } | null {
  if (dates.length < 2) return null;
  let best: { days: number; from: string; to: string } | null = null;
  for (let i = 1; i < dates.length; i++) {
    const a = dates[i - 1] as string;
    const b = dates[i] as string;
    const gap = daysBetween(a, b) - 1;
    if (gap > 0 && (!best || gap > best.days)) best = { days: gap, from: a, to: b };
  }
  return best;
}

/* ------------------------------------------------------------------------------------------------
 * STRENGTH
 * ---------------------------------------------------------------------------------------------- */
/** One lift's heaviest set on one day. The raw material; everything else is grouped from it. */
interface DayTop {
  exercise_id: string;
  name: string;
  date: string;
  top: number;
}

async function buildStrength(
  totals: { sets: number; days: number; log_start: string | null }[],
  raw: DayTop[],
): Promise<YearStrength> {
  const t = totals[0];

  /* ONE EXERCISE, ONE HISTORY, EVEN WHEN IT HAS TWO IDS. The same rule src/lib/gym/equivalent-ids.ts
     applies to the weight suggestion, applied here to the year: `machine-calf-raise` is an alias of
     `standing-calf-raise` and a per-id table would show two lifts, each with one session and no
     trajectory, for one movement worked all year. The catalogue is the authority, so this is a
     lookup and not a list to maintain.

     A catalogue that will not load must not silently split the histories back apart, which is the
     failure this merge exists to fix arriving disguised as correct behaviour. It degrades to the
     raw ids and nothing worse, exactly as equivalentIds does. */
  let canonical = new Map<string, { id: string; name: string }>();
  let assisted = new Set<string>();
  try {
    const [cat, program] = await Promise.all([loadMovements(), loadProgram()]);
    for (const movement of Object.values(cat.movements)) {
      for (const v of movement.variants) {
        for (const id of [v.id, ...(v.aliases ?? [])]) canonical.set(id, { id: v.id, name: v.name });
      }
    }
    /* `assistance` is a fact about the machine and it lives on the slot in program.json, so it is
       read from there rather than inferred from a name containing "assisted". */
    for (const day of Object.values(program.days)) {
      for (const block of day.blocks) {
        for (const ex of block.exercises) {
          if ((ex as { assistance?: boolean }).assistance === true) assisted.add(ex.id);
        }
      }
    }
  } catch {
    canonical = new Map();
    assisted = new Set();
  }

  const merged = new Map<string, DayTop[]>();
  for (const r of raw) {
    const key = canonical.get(r.exercise_id)?.id ?? r.exercise_id;
    const list = merged.get(key);
    if (list) list.push(r);
    else merged.set(key, [r]);
  }

  const lifts: Lift[] = [];
  let singles = 0;
  for (const [id, rows] of merged) {
    /* Distinct DAYS across the merged family, and one day is one session however many ids it was
       logged under. Summing per-id counts is what inflates every aliased lift. */
    const byDay = new Map<string, number>();
    for (const r of rows) byDay.set(r.date, Math.max(byDay.get(r.date) ?? 0, r.top));
    const days = [...byDay.keys()].sort();
    const firstDate = days[0] as string;
    const lastDate = days[days.length - 1] as string;

    /* One logged day is a weight, not a trajectory. Counted so the page can say how many lifts it
       is not showing, because a table that silently drops half the year's lifts reads as coverage. */
    if (days.length < 2) {
      singles++;
      continue;
    }

    const assistance = rows.some((r) => assisted.has(r.exercise_id)) || assisted.has(id);
    const firstTop = byDay.get(firstDate) as number;
    const lastTop = byDay.get(lastDate) as number;
    lifts.push({
      id,
      name: canonical.get(id)?.name ?? (rows[rows.length - 1] as DayTop).name,
      sessions: days.length,
      firstDate,
      firstTop,
      lastDate,
      lastTop,
      /* On an assistance lift the logged number is counterweight, so the delta is negated to keep
         one meaning for the column: positive is progress everywhere. Its own flag travels with it
         so the page can say "less assistance" rather than printing a rise it does not mean. */
      delta: round1(assistance ? firstTop - lastTop : lastTop - firstTop),
      assistance,
    });
  }

  /* Biggest movers first, and the flat ones after them rather than dropped: a lift that has not
     moved in three months is the finding, not the absence of one. */
  lifts.sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));

  return {
    logStart: t?.log_start ?? null,
    sets: t?.sets ?? 0,
    days: t?.days ?? 0,
    lifts,
    singleSessionLifts: singles,
  };
}

/* ------------------------------------------------------------------------------------------------
 * SWIM PERSONAL BESTS
 * ---------------------------------------------------------------------------------------------- */
/** Per distance: the best set this year, and what it beat. A best "set this year" is only a fact
 *  against what stood before it, so a distance whose year best does not beat its own history is
 *  returned with `improvedMs: null` rather than left out, and the page says which.
 *
 *  Samsung does not label these distances: the 13/14/15/16 to 100/200/400/1500 mapping is DERIVED
 *  in the importer and re-tested on every run by requiring pace per 100 m to rise with distance
 *  (AGENTS.md). This function trusts the column it is handed and adds nothing to that claim. */
function buildPbs(
  year: number,
  rows: { distance_m: number; achieved_on: string; duration_ms: number }[],
): Pb[] {
  const prefix = `${year}-`;
  const byDistance = new Map<number, { distance_m: number; achieved_on: string; duration_ms: number }[]>();
  for (const r of rows) {
    const list = byDistance.get(r.distance_m);
    if (list) list.push(r);
    else byDistance.set(r.distance_m, [r]);
  }

  const out: Pb[] = [];
  for (const [distanceM, all] of byDistance) {
    const thisYear = all.filter((r) => r.achieved_on.startsWith(prefix));
    if (!thisYear.length) continue;
    const best = thisYear.reduce((a, b) => (a.duration_ms <= b.duration_ms ? a : b));
    const before = all.filter((r) => r.achieved_on < prefix);
    const prior = before.length ? before.reduce((a, b) => (a.duration_ms <= b.duration_ms ? a : b)) : null;
    out.push({
      distanceM,
      thisYearMs: best.duration_ms,
      onDate: best.achieved_on,
      beforeMs: prior?.duration_ms ?? null,
      beforeDate: prior?.achieved_on ?? null,
      improvedMs: prior && prior.duration_ms > best.duration_ms ? prior.duration_ms - best.duration_ms : null,
    });
  }
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out;
}
