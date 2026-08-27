import 'server-only';
import { sql } from './db';

/* EIGHT YEARS OF LENGTHS, READ. Built 2026-08-27, Phase D item 2 of the training redesign.
 *
 * `health_swim_length` was filled on 2026-08-26 with 19,327 individual lengths back to 2018 and
 * nothing read a single row of it. This file is what reads them. The plan called it "the swim level
 * page"; the material is SWOLF over time, PB progression, pace against body weight, the
 * gym-proximity effect, work-to-rest, stroke mix and season gaps.
 *
 * THREE THINGS WERE WRONG IN THE RECOVERED NOTES AND ARE CORRECTED HERE, each by query rather than
 * by argument. They are recorded because the same three would otherwise be re-derived wrongly:
 *
 * 1. THE DATE COLUMN IS UTC AND IS WRONG BY A DAY ON EVERY EVENING SWIM.
 *    `session_start_time` is UTC. Converting it to America/Edmonton reproduces the date
 *    `health_watch_session` independently recorded on 359 of 361 sessions; the raw `date` column
 *    matches on 271. So 90 sessions, all of them evening swims, are stamped a day late in
 *    `health_swim_length` and `health_swim_session`. That is not cosmetic: it is why /swim says
 *    "the export has reached the 26th" one screen under a card headed the 25th, for the same swim.
 *    Every date in this file is derived, and `date` is never selected. The two sessions that still
 *    disagree are both January 2018, eight years and probably a continent away from the rest.
 *
 * 2. SWOLF FROM THE LENGTHS IS NOT SAMSUNG'S SESSION SWOLF, and the gap is not noise.
 *    They agree to 0.0 on continuous swims and diverge by up to 21 on interval swims, tracking how
 *    much rest the session held. Both numbers are defensible and they answer different questions,
 *    which is the same shape as the pace column that put a 1:31 "best pace" on /health off a session
 *    that was 82% rest. So this file computes ONE definition, states it, and reports its own
 *    agreement with the stored figure as data rather than asserting they match.
 *
 * 3. `rest_after_ms` DOES NOT EXIST BEFORE 2025. Zero rows carry it across 10,037 lengths from 2018
 *    to 2024, and 2,265 of 9,290 carry it after. A zero there means UNRECORDED, not "no rest", and
 *    a work-to-rest ratio built on it would read eight years of interval swimming as unbroken. So
 *    per-length rest is used only to split a session into pieces, only where it exists, and the
 *    session-level rest figure comes from the arithmetic that works in every year: session duration
 *    minus the sum of the lengths.
 *
 * NOTHING IN THIS FILE IS TYPED INTO PROSE. Every figure the page prints is returned from here,
 * including the ones about the data's own limits, because a number written into a sentence is a
 * number that goes stale without telling anybody. */

/** A 25 m length faster than this is a sensor miscount, not a swim.
 *
 *  The fastest length in the table is 9.03 s, which beats a world-record 25 m split, and /swim
 *  already refuses to derive a 25 m personal best for exactly this reason. 12 s is the floor that
 *  reason implies: a short-course 50 m world record is a shade over 20 s, so a 25 in under 12 is
 *  not something that happened in a Calgary lane. */
const LENGTH_MIN_MS = 12_000;

/** And a 25 m length slower than two minutes is a watch left running at the wall. 51 rows exceed
 *  it, the worst by 22 minutes. Left in, one of them moves a session's average by a factor of ten. */
const LENGTH_MAX_MS = 120_000;

/** Fewer freestyle lengths than this and a session average is a number about four lengths. */
const MIN_LENGTHS_FOR_SWOLF = 8;

/** How near a weighing has to be for a swim to be told against it. Body composition is read every
 *  few days at best and there are 203 readings against 475 swims, so an exact-date join returns
 *  almost nothing; 30 days is loose enough to have a sample and tight enough that the weight is
 *  still about that month. The gap is returned per point so the page can show it rather than imply
 *  the two were measured together. */
const WEIGH_WINDOW_DAYS = 30;

/* One date definition and one validity band are repeated inline in every query below rather than
   composed from a shared string: neon's tagged template does not interpolate SQL fragments, and a
   hand-concatenated CTE is how a band silently stops applying to one metric. Repetition that the
   type checker can see beats indirection it cannot.

   EVERY DERIVED DATE IS CAST TO ::text IN SQL. Without the cast the driver hands back a Date, and
   `String(date).slice(0, 10)` yields "Fri Jun 06" rather than "2025-06-06". That shipped nothing
   because the first test run printed it, which is the entire argument for querying before
   rendering. */

export interface SwolfPoint {
  /** Calgary calendar day, derived. Never the `date` column. */
  date: string;
  /** Seconds per length plus strokes per length, freestyle only, rest excluded. */
  swolf: number;
  lengths: number;
  /** Seconds per length, the half of SWOLF that speed moves. */
  avgSeconds: number;
  /** Strokes per length, the half efficiency moves. */
  avgStrokes: number;
}

/** How the SWOLF above compares with the figure Samsung stored per session, where both exist.
 *  Reported, not assumed. */
export interface SwolfAgreement {
  sessions: number;
  within1: number;
  avgAbsDiff: number;
  maxDiff: number;
}

export interface RestPoint {
  date: string;
  /** Share of the session spent not swimming, 0 to 100. FLOORED AT 0, because a handful of sessions
   *  have lengths summing to slightly more than the session duration and a negative rest is not a
   *  fact about a swim. `overran` marks them, the page counts them from this array rather than from
   *  a number written down here, and the count differs from the raw one because the length band
   *  below drops the rows a watch recorded at the wall. */
  restPct: number;
  swimSeconds: number;
  sessionSeconds: number;
  /** True where the lengths overran the session and the percentage is a floor, not a measurement. */
  overran: boolean;
}

export interface WeightPacePoint {
  date: string;
  /** Rest-excluded pace per 100 m, in seconds. */
  paceSeconds: number;
  kg: number;
  /** Days between the swim and the nearest weighing. */
  daysOff: number;
  distanceM: number;
}

export interface WeightBand {
  loKg: number;
  hiKg: number;
  swims: number;
  avgPaceSeconds: number;
  bestPaceSeconds: number;
}

/** One year: how much he swam, what he weighed, and how fast he was.
 *
 *  THIS EXISTS BECAUSE THE WEIGHT BANDS INVITED A STORY THAT IS FALSE. The first draft of the page
 *  said his heaviest period was also the period he swam most, which sounds like the obvious confound
 *  and is not what happened: 2023 is his biggest year by a distance, 186 swims, at an average of
 *  104 kg, and 2025 is his fastest year at 118 kg on 102 swims. Volume and weight do not move
 *  together, so neither of them on its own orders his pace. A table by year shows that; a table by
 *  weight cannot, because it has folded the years into each other. */
export interface YearProfile {
  year: string;
  swims: number;
  metres: number;
  avgKg: number | null;
  avgPaceSeconds: number | null;
  bestPaceSeconds: number | null;
}

export interface ProximityCohort {
  label: string;
  swims: number;
  avgPaceSeconds: number | null;
  avgSwolf: number | null;
}

export interface StrokeSlice {
  stroke: string;
  lengths: number;
  pct: number;
}

export interface SeasonGap {
  from: string;
  to: string;
  days: number;
}

export interface Piece {
  /** 1-based, in the order he swam them. */
  n: number;
  lengths: number;
  metres: number;
  swimSeconds: number;
  /** Rest taken after this piece, seconds. Null on the last piece of a session. */
  restSeconds: number | null;
  strokes: string[];
}

export interface PieceSession {
  date: string;
  pieces: Piece[];
}

export interface LengthCoverage {
  rows: number;
  sessions: number;
  firstDate: string;
  lastDate: string;
  /** Rows outside the plausible band, excluded from every figure on the page. */
  excludedRows: number;
  /** Sessions in `health_swim_session` that have no per-length detail at all. */
  sessionsWithoutLengths: number;
  /** Lengths carrying a per-length rest reading, and the year it starts. */
  rowsWithRest: number;
  restFirstYear: string | null;
}

export interface DeepSwim {
  coverage: LengthCoverage;
  swolf: SwolfPoint[];
  swolfAgreement: SwolfAgreement;
  rest: RestPoint[];
  weightPace: WeightPacePoint[];
  weightBands: WeightBand[];
  proximity: ProximityCohort[];
  strokes: StrokeSlice[];
  gaps: SeasonGap[];
  lastPieces: PieceSession | null;
  years: YearProfile[];
}

const num = (v: unknown): number => Number(v);

/** SWOLF per session, from the length rows, rest excluded, freestyle only.
 *
 *  Freestyle only because SWOLF is seconds plus strokes and a kickboard length has almost no
 *  strokes: 1,182 kickboard lengths averaged in would read as a huge efficiency gain. Mixing
 *  strokes into one average is the same error the pace column made. */
async function swolfHistory(): Promise<SwolfPoint[]> {
  const rows = await sql`
    select
      ((session_start_time::timestamp at time zone 'UTC') at time zone 'America/Edmonton')::date::text as d,
      count(*) as lengths,
      avg(duration_ms) / 1000.0 as avg_seconds,
      avg(stroke_count) as avg_strokes
    from health_swim_length
    where stroke_type = 'Freestyle'
      and duration_ms between ${LENGTH_MIN_MS} and ${LENGTH_MAX_MS}
      and stroke_count > 0
      and session_start_time is not null
    group by session_uuid, d
    having count(*) >= ${MIN_LENGTHS_FOR_SWOLF}
    order by d asc
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => {
    const avgSeconds = num(r.avg_seconds);
    const avgStrokes = num(r.avg_strokes);
    return {
      date: String(r.d).slice(0, 10),
      swolf: Math.round((avgSeconds + avgStrokes) * 10) / 10,
      lengths: num(r.lengths),
      avgSeconds: Math.round(avgSeconds * 10) / 10,
      avgStrokes: Math.round(avgStrokes * 10) / 10,
    };
  });
}

/** This file's SWOLF against the one Samsung stored, on the sessions carrying both. */
async function swolfAgreement(): Promise<SwolfAgreement> {
  const rows = await sql`
    with mine as (
      select session_uuid,
             avg(duration_ms) / 1000.0 + avg(stroke_count) as swolf
      from health_swim_length
      where stroke_type = 'Freestyle'
        and duration_ms between ${LENGTH_MIN_MS} and ${LENGTH_MAX_MS}
        and stroke_count > 0
      group by session_uuid
      having count(*) >= ${MIN_LENGTHS_FOR_SWOLF}
    )
    select count(*) as sessions,
           count(*) filter (where abs(mine.swolf - d.avg_swolf) < 1) as within1,
           avg(abs(mine.swolf - d.avg_swolf)) as avg_abs,
           max(abs(mine.swolf - d.avg_swolf)) as max_diff
    from mine
    join health_session_detail d on d.uuid = mine.session_uuid
    where d.avg_swolf is not null and d.avg_swolf > 0
  `;
  const r = (rows[0] ?? {}) as Record<string, unknown>;
  return {
    sessions: num(r.sessions),
    within1: num(r.within1),
    avgAbsDiff: Math.round(num(r.avg_abs) * 100) / 100,
    maxDiff: Math.round(num(r.max_diff) * 10) / 10,
  };
}

/** Work to rest, per session, from session duration minus the sum of its lengths.
 *
 *  Deliberately NOT from `rest_after_ms`, which does not exist before 2025. This arithmetic works
 *  in every year the mirror holds. */
async function restHistory(): Promise<RestPoint[]> {
  const rows = await sql`
    with l as (
      select session_uuid,
             min(session_start_time) as st,
             sum(duration_ms) as len_ms
      from health_swim_length
      where duration_ms between ${LENGTH_MIN_MS} and ${LENGTH_MAX_MS}
      group by session_uuid
    )
    select ((l.st::timestamp at time zone 'UTC') at time zone 'America/Edmonton')::date::text as d,
           l.len_ms, s.duration_ms
    from l
    join health_swim_session s on s.uuid = l.session_uuid
    where s.duration_ms > 0 and l.st is not null
    order by d asc
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => {
    const swimMs = num(r.len_ms);
    const sessionMs = num(r.duration_ms);
    const overran = swimMs > sessionMs;
    return {
      date: String(r.d).slice(0, 10),
      restPct: Math.max(0, Math.round((100 * (sessionMs - swimMs)) / sessionMs)),
      swimSeconds: Math.round(swimMs / 1000),
      sessionSeconds: Math.round(sessionMs / 1000),
      overran,
    };
  });
}

/** Every swim with a rest-excluded pace, told against the nearest weighing.
 *
 *  A LATERAL join, so the window is applied per swim rather than to a pre-picked weighing. */
async function weightAgainstPace(): Promise<WeightPacePoint[]> {
  const rows = await sql`
    with sw as (
      select l.session_uuid,
             ((min(l.session_start_time)::timestamp at time zone 'UTC') at time zone 'America/Edmonton')::date as d
      from health_swim_length l
      where l.session_start_time is not null
      group by l.session_uuid
    )
    select sw.d::text as d, s.moving_pace_per_100m_ms as pace_ms, s.distance_m, w.kg, w.gap
    from sw
    join health_swim_session s on s.uuid = sw.session_uuid
    join lateral (
      select b.kg, abs(b.date::date - sw.d) as gap
      from health_body_comp b
      where abs(b.date::date - sw.d) <= ${WEIGH_WINDOW_DAYS}
      order by abs(b.date::date - sw.d) asc
      limit 1
    ) w on true
    where s.moving_pace_per_100m_ms > 0 and s.distance_m > 0
    order by sw.d asc
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    date: String(r.d).slice(0, 10),
    paceSeconds: Math.round(num(r.pace_ms) / 1000),
    kg: Math.round(num(r.kg) * 10) / 10,
    daysOff: num(r.gap),
    distanceM: Math.round(num(r.distance_m)),
  }));
}

/** Volume, weight and pace by year, which is what settles whether weight explains the pace.
 *
 *  Grouped on the raw `date` column rather than the derived one, deliberately: this is the only
 *  figure on the page grouped by YEAR, and the one-day UTC shift can only move a swim between
 *  years on a 31 December evening. Deriving it here would mean joining every swim back to a start
 *  time the session table does not carry, to protect against an error of at most one swim in eight
 *  years. Every figure that names a DATE is derived; this one names a year. */
async function yearProfile(): Promise<YearProfile[]> {
  const rows = await sql`
    select left(s.date, 4) as yr,
           count(*) as swims,
           sum(s.distance_m) as metres,
           avg(w.kg) as avg_kg,
           avg(s.moving_pace_per_100m_ms) as avg_pace,
           min(s.moving_pace_per_100m_ms) as best_pace
    from health_swim_session s
    left join lateral (
      select b.kg from health_body_comp b
      where abs(b.date::date - s.date::date) <= ${WEIGH_WINDOW_DAYS}
      order by abs(b.date::date - s.date::date) asc
      limit 1
    ) w on true
    group by 1
    order by 1 asc
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    year: String(r.yr),
    swims: num(r.swims),
    metres: Math.round(num(r.metres) || 0),
    avgKg: r.avg_kg == null ? null : Math.round(num(r.avg_kg) * 10) / 10,
    avgPaceSeconds: r.avg_pace == null ? null : Math.round(num(r.avg_pace) / 1000),
    bestPaceSeconds: r.best_pace == null ? null : Math.round(num(r.best_pace) / 1000),
  }));
}

/** The same swims, banded by weight, so the shape can be read instead of asserted. */
function bandByWeight(points: WeightPacePoint[]): WeightBand[] {
  if (!points.length) return [];
  const lo = Math.floor(Math.min(...points.map((p) => p.kg)) / 5) * 5;
  const hi = Math.ceil(Math.max(...points.map((p) => p.kg)) / 5) * 5;
  const bands: WeightBand[] = [];
  for (let start = lo; start < hi; start += 5) {
    const inBand = points.filter((p) => p.kg >= start && p.kg < start + 5);
    if (!inBand.length) continue;
    const paces = inBand.map((p) => p.paceSeconds);
    bands.push({
      loKg: start,
      hiKg: start + 5,
      swims: inBand.length,
      avgPaceSeconds: Math.round(paces.reduce((a, b) => a + b, 0) / paces.length),
      bestPaceSeconds: Math.min(...paces),
    });
  }
  return bands;
}

/** Does swimming straight after lifting go better or worse?
 *
 *  Cohorts by how long after a strength session ENDED the swim began, computed from start_time plus
 *  minutes, all three tables on the same UTC clock. The comparison is association only, and the
 *  page says so: he swims after lifting on the days he has a plan, so the cohorts differ by
 *  intention as well as by fatigue. Returned with its own sample sizes for that reason. */
async function proximityCohorts(): Promise<ProximityCohort[]> {
  const rows = await sql`
    with sw as (
      select d.uuid, d.start_time::timestamp as st, d.avg_swolf,
             s.moving_pace_per_100m_ms as pace_ms
      from health_session_detail d
      join health_swim_session s on s.uuid = d.uuid
      where d.kind = 'swimming' and s.moving_pace_per_100m_ms > 0 and d.start_time is not null
    ),
    lift as (
      select start_time::timestamp + (minutes || ' minutes')::interval as ended
      from health_watch_session
      where kind = 'strength' and minutes is not null and start_time is not null
    ),
    j as (
      select sw.*, (
        select min(extract(epoch from (sw.st - lift.ended)) / 60)
        from lift
        where lift.ended <= sw.st and sw.st - lift.ended < interval '6 hours'
      ) as mins_after
      from sw
    )
    select case
             when mins_after is null then 'No lifting in the six hours before'
             when mins_after <= 45 then 'Within 45 minutes of racking the last set'
             else 'Later the same day'
           end as label,
           count(*) as swims,
           avg(pace_ms) as avg_pace_ms,
           avg(avg_swolf) as avg_swolf
    from j
    group by 1
    order by count(*) desc
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    label: String(r.label),
    swims: num(r.swims),
    avgPaceSeconds: r.avg_pace_ms == null ? null : Math.round(num(r.avg_pace_ms) / 1000),
    avgSwolf: r.avg_swolf == null ? null : Math.round(num(r.avg_swolf) * 10) / 10,
  }));
}

/** What he actually swims. The 1,182 kickboard lengths are the reason the SWOLF chart says
 *  "freestyle only" rather than "all swimming". */
async function strokeMix(): Promise<StrokeSlice[]> {
  const rows = await sql`
    select stroke_type, count(*) as n,
           100.0 * count(*) / sum(count(*)) over () as pct
    from health_swim_length
    where stroke_type is not null
    group by stroke_type
    order by n desc
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    stroke: String(r.stroke_type),
    lengths: num(r.n),
    pct: Math.round(num(r.pct) * 10) / 10,
  }));
}

/** Every break of two weeks or more between swims. The two longest are 698 and 544 days and they
 *  are the reason a "sessions since 2018" figure flatters the record: the record has holes. */
async function seasonGaps(): Promise<SeasonGap[]> {
  /* THREE SOURCES UNIONED, and the reason is a wrong answer this returned first time round.
     Built from the length table alone it reported a longest break of 946 days. The length table
     covers 364 of the 475 swims, so 111 swims were invisible and every gap spanning one of them was
     overstated: a break of 946 days is a break with swims inside it. Adding the watch's own swim
     rows brought it to 764 and left 14 days still missing, which come from `health_swim_session`
     rows that no other table carries.

     Those 14 fall back to the raw `date`, which is a day late on evening swims. A day of error on a
     14-day threshold is the acceptable direction: an extra adjacent day can only close a gap that
     was never there, never invent one. Missing a swim outright inflates a real gap by weeks. */
  const rows = await sql`
    with d as (
      select ((start_time::timestamp at time zone 'UTC')
               at time zone 'America/Edmonton')::date as day
        from health_watch_session
        where kind = 'swimming' and start_time is not null
      union
      select ((session_start_time::timestamp at time zone 'UTC')
               at time zone 'America/Edmonton')::date as day
        from health_swim_length
        where session_start_time is not null
      union
      select s.date::date as day
        from health_swim_session s
        where not exists (select 1 from health_swim_length l where l.session_uuid = s.uuid)
    ),
    g as (select day, lag(day) over (order by day) as prev from d)
    select prev::text as from_day, day::text as to_day, (day - prev) as days
    from g
    where prev is not null and (day - prev) >= 14
    order by prev desc
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    from: String(r.from_day),
    to: String(r.to_day),
    days: num(r.days),
  }));
}

/** The last session split into pieces at the walls he actually stopped at.
 *
 *  Only possible where `rest_after_ms` exists, which is 2025 onward. Returns null rather than
 *  inventing one continuous piece out of a session whose rests were never recorded. */
async function lastPieces(): Promise<PieceSession | null> {
  const rows = await sql`
    with last_session as (
      select session_uuid
      from health_swim_length
      where session_start_time is not null
      group by session_uuid
      having max(rest_after_ms) > 0
      order by min(session_start_time) desc
      limit 1
    )
    select ((session_start_time::timestamp at time zone 'UTC') at time zone 'America/Edmonton')::date::text as d,
           length_index, duration_ms, rest_after_ms, stroke_type, pool_length
    from health_swim_length
    where session_uuid = (select session_uuid from last_session)
    order by length_index asc
  `;
  const ls = rows as unknown as Record<string, unknown>[];
  if (!ls.length) return null;

  const date = String(ls[0]!.d).slice(0, 10);
  const pieces: Piece[] = [];
  let lengths = 0;
  let metres = 0;
  let swimMs = 0;
  let strokes = new Set<string>();

  for (const r of ls) {
    lengths += 1;
    metres += num(r.pool_length) || 25;
    swimMs += num(r.duration_ms);
    if (r.stroke_type) strokes.add(String(r.stroke_type));
    const rest = num(r.rest_after_ms);
    /* A piece ENDS where a rest was recorded. The final length of a session has no rest after it,
       so the loop closes the last piece on the way out rather than needing a sentinel row. */
    if (rest > 0) {
      pieces.push({
        n: pieces.length + 1,
        lengths,
        metres,
        swimSeconds: Math.round(swimMs / 1000),
        restSeconds: Math.round(rest / 1000),
        strokes: [...strokes],
      });
      lengths = 0;
      metres = 0;
      swimMs = 0;
      strokes = new Set<string>();
    }
  }
  if (lengths > 0) {
    pieces.push({
      n: pieces.length + 1,
      lengths,
      metres,
      swimSeconds: Math.round(swimMs / 1000),
      restSeconds: null,
      strokes: [...strokes],
    });
  }
  return { date, pieces };
}

/** What the mirror holds, including what this page threw away. */
async function coverage(): Promise<LengthCoverage> {
  const rows = await sql`
    select
      (select count(*) from health_swim_length) as rows_all,
      (select count(distinct session_uuid) from health_swim_length) as sessions,
      (select min(((session_start_time::timestamp at time zone 'UTC')
                    at time zone 'America/Edmonton')::date)::text
         from health_swim_length where session_start_time is not null) as first_date,
      (select max(((session_start_time::timestamp at time zone 'UTC')
                    at time zone 'America/Edmonton')::date)::text
         from health_swim_length where session_start_time is not null) as last_date,
      (select count(*) from health_swim_length
         where duration_ms not between ${LENGTH_MIN_MS} and ${LENGTH_MAX_MS}) as excluded_rows,
      (select count(*) from health_swim_session s
         where not exists (select 1 from health_swim_length l where l.session_uuid = s.uuid))
        as sessions_without_lengths,
      (select count(*) from health_swim_length where rest_after_ms > 0) as rows_with_rest,
      (select min(left(((session_start_time::timestamp at time zone 'UTC')
                         at time zone 'America/Edmonton')::date::text, 4))
         from health_swim_length where rest_after_ms > 0) as rest_first_year
  `;
  const r = (rows[0] ?? {}) as Record<string, unknown>;
  return {
    rows: num(r.rows_all),
    sessions: num(r.sessions),
    firstDate: String(r.first_date).slice(0, 10),
    lastDate: String(r.last_date).slice(0, 10),
    excludedRows: num(r.excluded_rows),
    sessionsWithoutLengths: num(r.sessions_without_lengths),
    rowsWithRest: num(r.rows_with_rest),
    restFirstYear: r.rest_first_year == null ? null : String(r.rest_first_year),
  };
}

/** One call, one round of queries, for the whole deep-dive page. */
export async function getDeepSwim(): Promise<DeepSwim> {
  const [cov, sw, agree, rest, weightPace, proximity, strokes, gaps, pieces, years] =
    await Promise.all([
      coverage(),
      swolfHistory(),
      swolfAgreement(),
      restHistory(),
      weightAgainstPace(),
      proximityCohorts(),
      strokeMix(),
      seasonGaps(),
      lastPieces(),
      yearProfile(),
    ]);
  return {
    coverage: cov,
    swolf: sw,
    swolfAgreement: agree,
    rest,
    weightPace,
    weightBands: bandByWeight(weightPace),
    proximity,
    strokes,
    gaps,
    lastPieces: pieces,
    years,
  };
}

/** Best and latest of a SWOLF series, plus the arithmetic that explains the move.
 *
 *  Returned as data rather than written as a sentence: "his SWOLF is 40 to 41" was true of some
 *  weeks in 2026 and is what the recovered notes said, and the series says the 2026 average is
 *  nearer 38 with a best of 35. A figure in prose cannot be re-checked by the page that prints it. */
export function swolfSummary(points: SwolfPoint[]): {
  best: SwolfPoint;
  latest: SwolfPoint;
  /** The oldest session in the series, which is what the all-time range is anchored on. */
  first: SwolfPoint;
  /** The best of the last twelve months, so improvement is not measured against an eight-year-old
   *  session he cannot remember. */
  bestRecent: SwolfPoint | null;
  /** THE LAST TWELVE MONTHS ONLY, and this is what the chart draws.
   *
   *  Not a cosmetic crop, and not a filter on the data either. Three real sessions in early 2023 sit
   *  at 82 to 96 while the median of all 353 is 39 and the 99th percentile is 52.7. They are not
   *  artifacts: every length in them is internally consistent at 55 to 84 seconds and 21 to 25
   *  strokes, which is what his swimming actually looked like in February 2023. Dropping them from
   *  the series would be falsifying the record.
   *
   *  But a y-axis stretched to 96 draws the 30-to-45 band that holds almost everything as a flat
   *  line, which is the same defect the Trace component hit from the other direction on 2026-08-27,
   *  when a 6% spread across ten swims was drawn as a mountain range. The honest fix is to narrow
   *  the WINDOW and say so, keeping the all-time figures on the tiles beside it, rather than to
   *  narrow the data and say nothing. */
  recent: SwolfPoint[];
  worstAllTime: SwolfPoint;
} | null {
  if (!points.length) return null;
  const best = points.reduce((a, b) => (b.swolf < a.swolf ? b : a));
  const worstAllTime = points.reduce((a, b) => (b.swolf > a.swolf ? b : a));
  const latest = points[points.length - 1] as SwolfPoint;
  const cutoff = new Date(Date.parse(latest.date) - 365 * 86400000).toISOString().slice(0, 10);
  const recent = points.filter((p) => p.date >= cutoff);
  return {
    best,
    latest,
    first: points[0] as SwolfPoint,
    bestRecent: recent.length ? recent.reduce((a, b) => (b.swolf < a.swolf ? b : a)) : null,
    recent,
    worstAllTime,
  };
}
