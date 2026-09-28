import 'server-only';
import { sql } from './db';
import { today, daysAgo } from '../day';

/* EVERY DAY HE HAS MOVED, SINCE 2018. Built 2026-09-09, on his ask: "analyze the data itself,
 * across the boards, all disciplines all topics, all the metrics, made evident within the app and
 * creating good insights".
 *
 * WHY THIS DOMAIN AND NOT THE WATCH ONES. He said the other half himself, unprompted, before any
 * of this was measured: "nothing regarding sleep, i don't wear the watch and i never log my sleep
 * on the phone". Counted against the calendar afterwards, he was right about far more than sleep.
 * Days carrying at least one reading, over the last fourteen:
 *
 *   phone   steps, distance, active minutes, calories, floors   14/14
 *   watch   passive heart rate                                   5/14
 *   watch   HRV                                                  5/14
 *   watch   sleep stages, SpO2, respiratory rate, skin temp      2/14
 *
 * He carries the phone always and wears the watch for workouts. So this table is the ONLY
 * continuous record of him that exists, 2,592 days of it, and until today not one number of it
 * reached any page. Everything else on this site is a SESSION, which only exists on a day he
 * trained.
 *
 * rest_cal, distance_m and score are not on this page: resting burn is his body weight in disguise,
 * distance carries nothing steps does not, and the score's formula changed under him. The `limits`
 * block that measured each of those fed a section deleted on 2026-09-15 and was cut on 2026-09-27;
 * its queries are in git history.
 *
 * NOTHING HERE IS TYPED. Every figure the page prints is returned from a query below. That discipline is what made
 * three wrong "facts" on /swim/deep falsifiable at all; typecheck, lint, build and a full rendered
 * text dump had all passed with a sentence in place that its own table disproved.
 */

/* `not partial` APPEARS IN EVERY QUERY IN THIS FILE AND THAT IS DELIBERATE.
 *
 * The newest day in an export is always half a day, because he exports mid-afternoon: 6,797 steps
 * and three quarters of a day's resting burn on 2026-09-08, against a month whose median is 13,869.
 * Included in an average it drags every recent figure down while looking like a bad day.
 *
 * It is a COLUMN rather than a rule each query re-derives, so an omission is visible by grepping
 * this file rather than by noticing a number is slightly wrong. If a figure here ever looks a few
 * percent low, this is the first thing to check. */

/* THE WINDOW IS 28 DAYS AND NOT 30. Four whole weeks, so the count is never carrying five Saturdays
 * against four, and he trains on a weekly cycle. */
export const WINDOW_DAYS = 28;

/* THE FLOOR, IN STEPS. Not a target and not his: it is the line below which a day contained
 * essentially no walking, and it is used only to COUNT days, never to grade one. Chosen because his
 * own distribution has a shoulder there, and because the count it produces moved further than any
 * other figure in this table: from 9 days in 28 to 2. */
export const FLOOR_STEPS = 5000;

/* WHAT COUNTS AS ONE UNBROKEN STRETCH, IN MINUTES. Exported because the scraps table prints it in a
 * column heading and the query below filters on it, and until 2026-09-09 those were two independent
 * 30s: the heading was typed and the threshold was a literal in the SQL, so moving one would have
 * left the other describing a column it no longer measured. Found by `scripts/lint-typed-figures.mjs`
 * on its first run, in one of its own self-test cases. */
export const STRETCH_MIN = 30;

/* THE TAILS THE FLOOR TABLE COMPARES. `TAIL_P` is the percentile the queries take and `TAIL_ONE_IN`
 * is the same fact in the words the table prints, "the worst 1 in 10". Two spellings of one
 * decision, derived from each other rather than written twice: the labels used to be typed while
 * the percentile lived in the SQL, which is how a table ends up describing a column it stopped
 * measuring. Same finding, same run of the gate, as STRETCH_MIN above. */
export const TAIL_P = 0.1;
export const TAIL_ONE_IN = Math.round(1 / TAIL_P);

export interface DayWindow {
  from: string;
  to: string;
  days: number;
  /** Days in the window below FLOOR_STEPS. THE headline number. */
  belowFloor: number;
  /** The 10th percentile of steps: the same question asked continuously rather than as a count. */
  p10: number | null;
  p50: number | null;
  p90: number | null;
  meanSteps: number | null;
  activeMinP50: number | null;
}

export interface MonthPoint {
  month: string;
  days: number;
  p10: number;
  p50: number;
  p90: number;
  activeMin: number;
  floors: number | null;
}

export interface SeasonRow {
  /** '01'..'12' */
  mm: string;
  byYear: Record<string, number | null>;
}

export interface ScrapsRow {
  year: string;
  restDays: number;
  /** Median longest unbroken block of movement, minutes, on days he did NOT train. */
  medianLongestMin: number;
  /** Median total active minutes on those same days, for contrast. */
  medianActiveMin: number;
  pctWith30: number;
}

export interface DailyReview {
  /** The last complete 28 days, anchored on the newest complete day rather than on today. */
  now: DayWindow;
  /** The two months the floor-versus-ceiling table compares, chosen once so the page cannot
   *  choose differently from the sentence under it. */
  compare: { from: MonthPoint; to: MonthPoint } | null;
  months: MonthPoint[];
  season: SeasonRow[];
  seasonYears: string[];
  scraps: ScrapsRow[];
  /** Newest complete day in the store, and how stale that makes the page. */
  newest: string | null;
  daysBehind: number | null;
  /** The floors story: it is the metric that moved most and it is half-independent of steps. */
  floors: {
    medianRecent: number | null;
    medianYearAgo: number | null;
    daysWithValue: number;
  };
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** One window of days, described the four ways that disagree with each other usefully. */
function windowSql(from: string, to: string) {
  /* `min(date)` and `max(date)`, not the requested bounds. A window whose label says "28 days to
     8 Sep" while only 27 rows exist and none of them is the 8th is the shape of error this whole
     file is written against: a heading and a number sourced from two different places. */
  return sql`
    select min(date) as from_date, max(date) as to_date,
           count(*)::int as days,
           count(*) filter (where steps < ${FLOOR_STEPS})::int as below_floor,
           percentile_cont(${TAIL_P}) within group (order by steps) as p10,
           percentile_cont(0.50) within group (order by steps) as p50,
           percentile_cont(${1 - TAIL_P}) within group (order by steps) as p90,
           avg(steps) as mean_steps,
           percentile_cont(0.50) within group (order by active_min) as active_p50
      from health_daily
     where not partial and steps is not null
       and date >= ${from} and date <= ${to}
  `;
}

function toWindow(r: Record<string, unknown>): DayWindow {
  return {
    from: String(r.from_date),
    to: String(r.to_date),
    days: Number(r.days),
    belowFloor: Number(r.below_floor),
    p10: num(r.p10),
    p50: num(r.p50),
    p90: num(r.p90),
    meanSteps: num(r.mean_steps),
    activeMinP50: num(r.active_p50),
  };
}

export async function getDailyReview(): Promise<DailyReview> {
  /* THE WINDOW IS ANCHORED ON THE NEWEST COMPLETE DAY, NOT ON TODAY, and the first version was
     anchored on today. That is not a rounding difference. He exports on Sundays, so the table is
     routinely two or three days behind, and a window running back from today silently contained 27
     rows under a heading that said 28 and printed an end date with no row behind it. The label and
     the data have to come from the same place, so both now come from the rows. */
  const anchorRow = await sql`select max(date) as newest from health_daily where not partial`;
  const anchor = anchorRow[0]?.newest ? String(anchorRow[0].newest) : daysAgo(1);
  const newestDate = anchorRow[0]?.newest ? String(anchorRow[0].newest) : null;
  const to = anchor;
  const from = shiftDays(anchor, -(WINDOW_DAYS - 1));

  const [rows] = await Promise.all([
    sql.transaction([
      windowSql(from, to),

      /* MONTHLY, FROM 2022. Agent-verified retention window: 2020 is missing 118 calendar days and
         2021 another 147, so a line drawn through them reads as a collapse he did not have. 2019 is
         complete but sits the far side of that hole. */
      sql`select substring(date, 1, 7) as month, count(*)::int as days,
                 percentile_cont(${TAIL_P}) within group (order by steps) as p10,
                 percentile_cont(0.50) within group (order by steps) as p50,
                 percentile_cont(${1 - TAIL_P}) within group (order by steps) as p90,
                 percentile_cont(0.50) within group (order by active_min) as active_min,
                 percentile_cont(0.50) within group (order by coalesce(floors, 0)) as floors
            from health_daily
           where not partial and steps is not null and date >= '2022-01-01'
           group by 1 having count(*) >= 20 order by 1`,

      /* MONTH OF YEAR, BY YEAR. This is the falsification, not decoration: the recovery looks like
         a Calgary summer until you see that June to September 2025 was that year's WORST season and
         March 2024 its best month. Nothing else on the page can rule weather out. */
      sql`select substring(date, 6, 2) as mm, substring(date, 1, 4) as yr,
                 percentile_cont(0.50) within group (order by steps) as p50,
                 count(*)::int as days
            from health_daily
           where not partial and steps is not null and date >= '2022-01-01'
           group by 1, 2 having count(*) >= 20 order by 1, 2`,

      /* THE SCRAPS. On days he did not train, how long is his longest unbroken stretch of movement.
       *
       * A REST DAY IS THE UNION OF THREE SOURCES SAYING NOTHING, and it was `other_min = 0` alone
       * until 2026-09-09. That test was defended in this comment as "exactly right for SPLITTING
       * training days from rest days". It is not, and the cross-discipline pass measured the cost:
       * 15 days since 2023 that he TRAINED are counted as rest here, six of them this year, under a
       * heading that reads "On a day you do not train".
       *
       * The miss is a real shape, not an edge case. `other_min` is the watch session folded into
       * the daily row, so a lift he logged in the app while not wearing the watch is invisible to
       * it. Six such days in 2026 (2026-05-25, 05-30, 06-03, 07-15, 07-21, 09-08), none of which
       * carries an adjacent-date watch row, so it is a miss rather than a timezone artifact.
       *
       * `gym_set` and `health_watch_session` are therefore both consulted. Each of the three can
       * see a session the other two cannot, and a day is rest only when all three are silent. That
       * makes the reading conservative in the safe direction: a mislabelled rest day inflates a
       * figure captioned "on days you do not train", which is the flattering error. */
      sql`select substring(d.date, 1, 4) as year, count(*)::int as rest_days,
                 percentile_cont(0.50) within group (order by d.longest_active_min) as longest,
                 percentile_cont(0.50) within group (order by d.active_min) as active,
                 (count(*) filter (where d.longest_active_min >= ${STRETCH_MIN}))::numeric * 100 / count(*) as pct30
            from health_daily d
           where not d.partial and d.other_min = 0 and d.longest_active_min is not null
             and d.date >= '2023-01-01'
             and not exists (select 1 from health_watch_session w where w.date = d.date)
             and not exists (select 1 from gym_set g where g.date = d.date)
           group by 1 order by 1`,

      /* FLOORS. Half-independent of steps (r = 0.56), the metric that moved furthest, and the one
         nobody has ever seen: activity.day_summary's own floor_count died in October 2024 and the
         per-climb events replaced it, verified equal on all 296 days both exist. */
      sql`select
            (select percentile_cont(0.50) within group (order by coalesce(floors, 0))
               from health_daily where not partial and date >= ${from} and date <= ${to}) as med_recent,
            (select percentile_cont(0.50) within group (order by coalesce(floors, 0))
               from health_daily where not partial
                and date >= ${shiftDays(from, -365)} and date <= ${shiftDays(to, -365)}) as med_year_ago,
            (select count(*)::int from health_daily where not partial and floors is not null) as days_with`,
    ]),
  ]);

  /* No coverage query since 2026-09-27: the h1 took its year from the first steps row (2019) while
     the charts start in 2022, so it now takes the year from `months`, the rows the charts draw. */
  const [wNow, months, season, scraps, floors] = rows as [
    Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[],
    Record<string, unknown>[], Record<string, unknown>[],
  ];

  const seasonYears = [...new Set(season.map((r) => String(r.yr)))].sort();
  const byMonth = new Map<string, SeasonRow>();
  for (const r of season) {
    const mm = String(r.mm);
    const row = byMonth.get(mm) ?? { mm, byYear: {} };
    row.byYear[String(r.yr)] = num(r.p50);
    byMonth.set(mm, row);
  }

  /* THE TWO MONTHS THE FLOOR TABLE COMPARES, chosen here so the page cannot choose differently.
     The first draft picked "the first month whose name ends in -01", which found January 2022 and
     printed 1.7x under a sentence claiming the worst days had moved several times further than the
     best. The table and the prose disagreed, on a page written specifically to stop that. It is the
     first month of the CURRENT year against the newest month with a full-enough count. */
  const monthRows = months.map((r) => ({
    month: String(r.month),
    days: Number(r.days),
    p10: Number(r.p10),
    p50: Number(r.p50),
    p90: Number(r.p90),
    activeMin: Number(r.active_min),
    floors: num(r.floors),
  }));
  const thisYear = today().slice(0, 4);
  const inYear = monthRows.filter((m) => m.month.startsWith(thisYear));
  const compare = inYear.length >= 2
    ? { from: inYear[0]!, to: inYear[inYear.length - 1]! }
    : null;

  return {
    now: toWindow(wNow[0] as Record<string, unknown>),
    compare,
    months: monthRows,
    season: [...byMonth.values()].sort((a, b) => a.mm.localeCompare(b.mm)),
    seasonYears,
    scraps: scraps.map((r) => ({
      year: String(r.year),
      restDays: Number(r.rest_days),
      medianLongestMin: Number(r.longest),
      medianActiveMin: Number(r.active),
      pctWith30: Math.round(Number(r.pct30)),
    })),
    newest: newestDate,
    daysBehind: newestDate ? daysBetween(newestDate, today()) : null,
    floors: {
      medianRecent: num(floors[0]?.med_recent),
      medianYearAgo: num(floors[0]?.med_year_ago),
      daysWithValue: Number(floors[0]?.days_with ?? 0),
    },
  };
}

function shiftDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}
