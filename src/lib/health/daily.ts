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
 * THREE COLUMNS ARE DELIBERATELY NOT ON THIS PAGE, and each was refused on a measurement:
 *
 *   rest_cal    IS HIS BODY WEIGHT IN DISGUISE, not a movement number. Samsung pro-rates a BMR over
 *               the non-active part of the day, so `rest_cal / (1 - active_min/1440)` recovers a
 *               figure that barely moves within one stretch between weigh-ins and steps on the days
 *               he weighed in: see `limits.restFit` and `limits.restMoves` below. A chart labelled
 *               "resting calories" would be a chart of his scale, inverted by his activity, on a
 *               page about movement.
 *   distance_m  carries nothing `steps` does not: the two correlate at `limits.distCorr` below.
 *               Worse, the metres-per-step constant has moved by `limits.mpsDriftPct` since 2022 in
 *               uniform steps applied to every past day at once, which is Samsung recalibrating and
 *               not his stride. No distance figure may span more than one calendar year.
 *   score       is Samsung's opinion from a formula that demonstrably changed: see `limits.scoreFirst`
 *               against `limits.scoreLast`, and the app version that wrote each row is null until
 *               `limits.shVerFrom`. Imported so the claim stays checkable, plotted nowhere.
 *
 * THE FIGURES IN THIS COMMENT USED TO BE TYPED HERE AND ON THE PAGE, and one of them had already
 * gone wrong: the page said the score "pays 77 for 13,261" in the current year, which is 2024's
 * pair. The current year reads lower on both. That is the whole argument for the `limits` block:
 * a number written into a sentence is true on the day it is written and silently false afterwards.
 *
 * NOTHING HERE IS TYPED. Every figure the page prints, including the figures about the data's own
 * limits and the retention windows, is returned from a query below. That discipline is what made
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

export interface CoverageRow {
  column: string;
  /** The plain question this column can answer, or the reason it cannot. */
  reads: string;
  from: string;
  days: number;
}

/* WHAT THE LIMITS SECTION PRINTS, AND WHY IT IS A QUERY AND NOT A PARAGRAPH.
 *
 * The three columns this page refuses to plot are refused on measurements, and the page says so in
 * prose. Until 2026-09-09 those measurements were TYPED into that prose: seven figures, one of them
 * already stale by two years. A page whose thesis is "a number that is not derived goes wrong
 * quietly" cannot make its own argument out of typed numbers. */
export interface Limits {
  /** distance against steps, current year only, because the constant below drifts across years. */
  distCorr: number | null;
  distDays: number;
  /** The metres-per-step constant Samsung applies, by year since 2022: its range and its drift. */
  mpsMin: { year: string; value: number } | null;
  mpsMax: { year: string; value: number } | null;
  mpsDriftPct: number | null;
  /** Samsung's own daily score, first and current year with enough days to have a median. */
  scoreFirst: { year: string; score: number; steps: number } | null;
  scoreLast: { year: string; score: number; steps: number } | null;
  /** The first day carrying an app version at all. Before it, the score's provenance is blank. */
  shVerFrom: string | null;
  /** THE REST_CAL FIT. The longest run of days between two weigh-ins, the active-minute range it
   *  spans, and how far the implied resting burn moves across it once his activity is undone. That
   *  spread IS the noise band, and `restMoves` uses twice it as the threshold for a real change. */
  restFit: { days: number; loActive: number; hiActive: number; spread: number; since: string } | null;
  /** Days the implied resting burn moved further than that band, and how many sit within a day of a
   *  weigh-in. If the second is nearly the first, the column is his scale and not his day. */
  restMoves: { days: number; nearWeighIn: number } | null;
  /** The current year's sub-floor days, and the fewest hours containing movement on any of them.
   *  The only column that says the phone was ON him: resting burn is written whether or not it is. */
  subFloor: { days: number; minMoveHours: number | null } | null;
}

export interface DailyReview {
  /** The last complete 28 days, anchored on the newest complete day rather than on today. */
  now: DayWindow;
  /** What the four weeks AFTER the false all-clear actually held. Derived, never typed. */
  afterPreCollapse: { days: number; belowFloor: number; meanSteps: number | null };
  /** The two months the floor-versus-ceiling table compares, chosen once so the page cannot
   *  choose differently from the sentence under it. */
  compare: { from: MonthPoint; to: MonthPoint } | null;
  /** The window that gave a false all-clear four weeks before the collapse. Kept because it is the
   *  honest limit of the headline: see `falseAllClear` in the page. */
  preCollapse: DayWindow;
  months: MonthPoint[];
  season: SeasonRow[];
  seasonYears: string[];
  scraps: ScrapsRow[];
  coverage: CoverageRow[];
  /** Calendar days with no row at all, by year. The 2020 and 2021 holes are real. */
  gaps: { year: string; missing: number }[];
  /** Newest complete day in the store, and how stale that makes the page. */
  newest: string | null;
  daysBehind: number | null;
  /** The floors story: it is the metric that moved most and it is half-independent of steps. */
  floors: {
    medianRecent: number | null;
    medianYearAgo: number | null;
    corrSteps: number | null;
    daysWithValue: number;
  };
  limits: Limits;
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

/* THE PRE-COLLAPSE WINDOW IS A CONSTANT AND IT IS THE POINT OF THE WHOLE PAGE.
 *
 * The headline count read ZERO in the 28 days to 2025-12-27, and four weeks later he was at 8 days
 * under the floor with a 28-day mean of 6,447. So the number does not forecast, and a page that
 * shows it without saying so is teaching him to trust a light that was green on the way down.
 *
 * The 10th percentile does not rescue it either, which is worth stating because it is the obvious
 * fix and it was proposed: 5,944 then against 6,091 now, a difference of 147 steps. The only figure
 * that separates the two windows is the MEAN, 10,155 then against 12,587 now.
 *
 * A date literal, because it is a historical event and not a rolling window. */
const PRE_COLLAPSE_TO = '2025-12-27';

export async function getDailyReview(): Promise<DailyReview> {
  /* THE WINDOW IS ANCHORED ON THE NEWEST COMPLETE DAY, NOT ON TODAY, and the first version was
     anchored on today. That is not a rounding difference. He exports on Sundays, so the table is
     routinely two or three days behind, and a window running back from today silently contained 27
     rows under a heading that said 28 and printed an end date with no row behind it. The label and
     the data have to come from the same place, so both now come from the rows. */
  const anchorRow = await sql`select max(date) as newest from health_daily where not partial`;
  const anchor = anchorRow[0]?.newest ? String(anchorRow[0].newest) : daysAgo(1);
  const to = anchor;
  const from = shiftDays(anchor, -(WINDOW_DAYS - 1));
  const preFrom = shiftDays(PRE_COLLAPSE_TO, -(WINDOW_DAYS - 1));
  /* The current year, off `today()` rather than a literal, so 1 January needs no edit here. */
  const yearStart = `${today().slice(0, 4)}-01-01`;

  const [rows] = await Promise.all([
    sql.transaction([
      windowSql(from, to),
      windowSql(preFrom, PRE_COLLAPSE_TO),

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

      /* WHAT EACH COLUMN CAN ANSWER AND FROM WHEN. Counted, never typed: four of these columns are
         born on exactly 2023-12-02 (one app upgrade), and a page that plotted them earlier would be
         drawing a line through zeros that look like a sedentary year. */
      sql`select 'steps' as column, min(date) as from_date, count(*)::int as days
            from health_daily where not partial and steps is not null
          union all
          select 'active_min', min(date), count(*)::int
            from health_daily where not partial and active_min is not null
          union all
          select 'walk_min + run_min', min(date), count(*)::int
            from health_daily where not partial and walk_min is not null and run_min is not null
          union all
          select 'other_min', min(date), count(*)::int
            from health_daily where not partial and other_min > 0
          union all
          select 'longest_active_min', min(date), count(*)::int
            from health_daily where not partial and longest_active_min is not null
          union all
          select 'floors', min(date), count(*)::int
            from health_daily where not partial and floors is not null
          union all
          select 'move_hours', min(date), count(*)::int
            from health_daily where not partial and move_hours > 0`,

      /* THE HOLES. Calendar days with no row, by year, so the gap is a printed number rather than a
         flat stretch in a chart that reads as stillness. */
      sql`with cal as (
            select generate_series('2018-11-13'::date, current_date - 1, '1 day')::date as d
          )
          select to_char(date_trunc('year', d), 'YYYY') as year,
                 (count(*) - count(h.date))::int as missing
            from cal left join health_daily h on h.date = to_char(cal.d, 'YYYY-MM-DD')
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
            (select corr(coalesce(floors, 0), steps)
               from health_daily where not partial and date >= '2026-01-01') as corr_steps,
            (select count(*)::int from health_daily where not partial and floors is not null) as days_with`,

      sql`select max(date) as newest from health_daily where not partial`,

      /* THE FOUR WEEKS THAT FOLLOWED THE FALSE ALL-CLEAR. Derived, because the page states it as a
         fact about him and the first draft typed the word "eight" into a sentence. A typed number
         beside a derived one is the drift every other file here has a gate against. */
      sql`select count(*)::int as days,
                 count(*) filter (where steps < ${FLOOR_STEPS})::int as below_floor,
                 avg(steps) as mean_steps
            from health_daily
           where not partial and steps is not null
             and date > ${PRE_COLLAPSE_TO} and date <= ${shiftDays(PRE_COLLAPSE_TO, WINDOW_DAYS)}`,

      /* LIMITS 1: THE REST_CAL ARGUMENT, AS ARITHMETIC.
       *
       * Samsung pro-rates an estimated resting burn over the part of the day he was not moving, so
       * `rest_cal / (1 - active_min/1440)` recovers the flat daily figure it started from. Two
       * things follow, and the page states both:
       *
       *   - Within one stretch between weigh-ins that figure barely moves, ACROSS a wide range of
       *     active minutes. `spread` is that movement, and it is the noise band.
       *   - The days it does move are the days he stood on the scale.
       *
       * The threshold for "moved" is TWICE the measured spread rather than a constant, because a
       * constant is the typed number this whole file exists to avoid: at 1 calorie the count is
       * mostly rounding jitter and the claim reads as false, at 5 it reads as true, and neither
       * figure comes from anywhere. Derived from his own noise, it cannot be tuned to the answer.
       *
       * `active_min between 1 and 1439` excludes the degenerate ends where the divisor is 1 or 0. */
      sql`
        with w as (select date from health_body_comp where kg is not null),
             d as (select h.date, h.active_min,
                          h.rest_cal / (1 - h.active_min / 1440.0) as implied,
                          (select max(w.date) from w where w.date <= h.date) as since
                     from health_daily h
                    where not h.partial and h.rest_cal is not null
                      and h.active_min between 1 and 1439
                      and h.date >= '2023-01-01'),
             fit as (select since, count(*)::int as n, min(active_min)::int as lo,
                            max(active_min)::int as hi, max(implied) - min(implied) as spread
                       from d where since is not null
                      group by since having count(*) >= 10
                      order by count(*) desc limit 1),
             chg as (select date, implied, lag(implied) over (order by date) as prev from d),
             moves as (select chg.date from chg, fit
                        where chg.prev is not null and abs(chg.implied - chg.prev) > 2 * fit.spread)
        select (select n from fit) as fit_days, (select lo from fit) as fit_lo,
               (select hi from fit) as fit_hi, (select spread from fit) as fit_spread,
               (select since from fit) as fit_since,
               (select count(*)::int from moves) as move_days,
               (select count(*)::int from moves
                 where exists (select 1 from health_body_comp b
                                where b.date::date between moves.date::date - 1
                                                      and moves.date::date + 1)) as move_near`,

      /* LIMITS 2: THE TWO COLUMNS WHOSE MEANING CHANGED UNDER HIM, by year.
       *
       * `mps` is Samsung's metres-per-step constant recovered from the totals, and it moves in
       * uniform jumps applied to every past day at once. `med_score` against `med_steps` is the
       * score's exchange rate. The page takes the range of the first and the ends of the second;
       * both are read off THESE rows rather than restated, so a new year needs no edit anywhere.
       *
       * `having count(*) >= 100` keeps a part-year out of the ends of the score comparison. The
       * current year qualifies from early April onward and reads as the newest complete signal
       * before that; a stub of a January is not a year and would read as a collapse. */
      sql`select substring(date, 1, 4) as yr,
                 sum(distance_m) filter (where steps > 0 and distance_m is not null)
                   / nullif(sum(steps) filter (where steps > 0 and distance_m is not null), 0) as mps,
                 count(*) filter (where steps > 0 and distance_m is not null)::int as mps_days,
                 percentile_cont(0.50) within group (order by score) as med_score,
                 percentile_cont(0.50) within group (order by steps) as med_steps,
                 count(*) filter (where score is not null and steps is not null)::int as score_days
            from health_daily
           where not partial
           group by 1 order by 1`,

      /* LIMITS 3: the scalars. `distCorr` is scoped to the current year on purpose: the constant in
       * LIMITS 2 drifts, so a correlation spanning years is measuring the recalibration as much as
       * the relationship. `subfloor_min_move` is the ONLY evidence on this page that the phone was
       * on him rather than in a drawer on his worst days, which is why the sentence that used to
       * cite resting burn beside it was wrong: resting burn is written for a phone in a drawer. */
      sql`select
            (select corr(distance_m, steps) from health_daily
              where not partial and steps > 0 and distance_m is not null
                and date >= ${yearStart}) as dist_corr,
            (select count(*)::int from health_daily
              where not partial and steps > 0 and distance_m is not null
                and date >= ${yearStart}) as dist_days,
            (select min(date) from health_daily where not partial and sh_ver is not null) as sh_ver_from,
            (select count(*)::int from health_daily
              where not partial and steps is not null and steps < ${FLOOR_STEPS}
                and date >= ${yearStart}) as subfloor_days,
            (select min(move_hours)::int from health_daily
              where not partial and steps is not null and steps < ${FLOOR_STEPS}
                and move_hours is not null and date >= ${yearStart}) as subfloor_min_move`,
    ]),
  ]);

  const [
    wNow, wPre, months, season, scraps, coverage, gaps, floors, newest, after,
    restFitRows, byYear, scalars,
  ] = rows as [
    Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[],
    Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[],
    Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[],
    Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[],
    Record<string, unknown>[],
  ];

  const seasonYears = [...new Set(season.map((r) => String(r.yr)))].sort();
  const byMonth = new Map<string, SeasonRow>();
  for (const r of season) {
    const mm = String(r.mm);
    const row = byMonth.get(mm) ?? { mm, byYear: {} };
    row.byYear[String(r.yr)] = num(r.p50);
    byMonth.set(mm, row);
  }

  const newestDate = newest[0]?.newest ? String(newest[0].newest) : null;

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

  /* THE LIMITS, ASSEMBLED FROM THE THREE QUERIES ABOVE AND NOWHERE ELSE. Every branch here returns
     null rather than a fallback figure: a limits section that invents a number to describe a limit
     is the joke this page would otherwise be. The page renders nothing for a null. */
  const mpsRows = byYear
    .filter((r) => r.mps != null && Number(r.mps_days) >= 100 && String(r.yr) >= '2022')
    .map((r) => ({ year: String(r.yr), value: Number(r.mps) }));
  const mpsMin = mpsRows.length ? mpsRows.reduce((a, b) => (b.value < a.value ? b : a)) : null;
  const mpsMax = mpsRows.length ? mpsRows.reduce((a, b) => (b.value > a.value ? b : a)) : null;

  const scoreRows = byYear
    .filter((r) => r.med_score != null && r.med_steps != null && Number(r.score_days) >= 100)
    .map((r) => ({ year: String(r.yr), score: Number(r.med_score), steps: Number(r.med_steps) }));

  const fit = restFitRows[0] ?? {};
  const sc = scalars[0] ?? {};

  const limits: Limits = {
    distCorr: num(sc.dist_corr),
    distDays: Number(sc.dist_days ?? 0),
    mpsMin,
    mpsMax,
    mpsDriftPct: mpsMin && mpsMax && mpsMin.value > 0
      ? ((mpsMax.value - mpsMin.value) / mpsMin.value) * 100
      : null,
    scoreFirst: scoreRows[0] ?? null,
    scoreLast: scoreRows.length > 1 ? scoreRows[scoreRows.length - 1]! : null,
    shVerFrom: sc.sh_ver_from == null ? null : String(sc.sh_ver_from),
    restFit: fit.fit_days == null ? null : {
      days: Number(fit.fit_days),
      loActive: Number(fit.fit_lo),
      hiActive: Number(fit.fit_hi),
      spread: Number(fit.fit_spread),
      since: String(fit.fit_since),
    },
    restMoves: fit.move_days == null ? null : {
      days: Number(fit.move_days),
      nearWeighIn: Number(fit.move_near),
    },
    subFloor: sc.subfloor_days == null ? null : {
      days: Number(sc.subfloor_days),
      minMoveHours: num(sc.subfloor_min_move),
    },
  };

  return {
    now: toWindow(wNow[0] as Record<string, unknown>),
    preCollapse: toWindow(wPre[0] as Record<string, unknown>),
    afterPreCollapse: {
      days: Number(after[0]?.days ?? 0),
      belowFloor: Number(after[0]?.below_floor ?? 0),
      meanSteps: num(after[0]?.mean_steps),
    },
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
    coverage: coverage.map((r) => ({
      column: String(r.column),
      reads: READS[String(r.column)] ?? '',
      from: String(r.from_date),
      days: Number(r.days),
    })),
    gaps: gaps.map((r) => ({ year: String(r.year), missing: Number(r.missing) })),
    newest: newestDate,
    daysBehind: newestDate ? daysBetween(newestDate, today()) : null,
    floors: {
      medianRecent: num(floors[0]?.med_recent),
      medianYearAgo: num(floors[0]?.med_year_ago),
      corrSteps: num(floors[0]?.corr_steps),
      daysWithValue: Number(floors[0]?.days_with ?? 0),
    },
    limits,
  };
}

/* The plain-English half of the coverage table. The DATES and the COUNTS beside these come out of
 * the query above and are never typed; only the sentence saying what the column is for lives here,
 * because that is a fact about English rather than about his data. */
const READS: Record<string, string> = {
  steps: 'How much you walked. The longest and cleanest thing here.',
  active_min: 'Minutes the phone saw you moving, workouts included.',
  'walk_min + run_min': 'The same, workouts taken out. This is your ordinary day.',
  other_min: 'Minutes inside a recorded workout, as the phone saw it.',
  longest_active_min: 'Your longest unbroken stretch of movement in a day.',
  floors: 'Flights of stairs, counted one climb at a time.',
  move_hours: 'Hours of the day containing any movement at all.',
};

function shiftDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}
