import 'server-only';
import { sql } from '../health/db';

/* SESSION HISTORY. Built 2026-08-27, Decision 7 of docs/GYM-AUDIT-AND-PLAN-2026-08-27.md.
 *
 * WHY IT DID NOT EXIST UNTIL NOW, which is the point of the whole thing. `gym_session` has been
 * written on every session since 2026-05-25 and read by exactly three things: which day is next,
 * whether the last one was cut short, and its own status. **Nothing displayed a single row.** He
 * asked "where is the history of sessions in the app" and the answer was that the app has kept one
 * for three months and never shown it to him.
 *
 * THE FINDING IT EXISTS TO SETTLE. `gym_session` says every one of its 33 rows finished. `gym_set`
 * holds roughly a third of what the programme asked for. Those two records disagree by a factor of
 * three and nothing put them side by side, so nobody could say whether the gap is work he did not
 * type or a prescription that is too big. Those have the same signature and opposite fixes. An
 * earlier attempt to answer it by inference got it wrong, confidently, in a document. This is the
 * instrument instead of the inference.
 *
 * TWO SOURCES, DIFFERENT DEPTHS, AND THEY MUST NOT BE BLENDED:
 *
 *   gym_session + gym_set      33 sessions from 2026-05-25. What he LIFTED: sets, weights, reps.
 *   health_watch_session      698 strength sessions from 2023-04-24. That he TRAINED: minutes, HR.
 *   health_session_detail      80 strength sessions from 2026-04-25. The per-second detail.
 *
 * A row from the middle tier has no sets and never will. The page prints an empty cell and says why
 * once, rather than a zero. `AGENTS.md`'s "cycling has exactly one session ever" is a true statement
 * about health_session_detail (1 row) and false about health_watch_session (76), which is exactly
 * the kind of blend this comment exists to prevent. */

export interface GymLogRow {
  date: string;
  day: string | null;
  dayTitle: string | null;
  status: string | null;
  /** Sets he actually logged as done, with a real rep count. */
  setsLogged: number;
  /** What the programme asked for, stamped when the session started. Null for the 33 rows that
   *  predate the column: see content/gym/migrate-sets-prescribed.mjs for why they are not
   *  backfilled. */
  setsPrescribed: number | null;
  /** Distinct exercises touched. */
  exercises: number;
  /** Minutes the PAGE was open: finished_at minus started_at. NOT session duration. One row reads
   *  330 minutes because the tab was left open, so anything rendering this must label it as such
   *  or prefer `watchMinutes`. */
  pageOpenMin: number | null;
  /** What the watch independently recorded for that date, where it recorded anything. This is the
   *  trustworthy duration and the reason the unreliable one above is kept rather than hidden: two
   *  numbers that disagree are information, one number that might be wrong is not. */
  watchMinutes: number | null;
  /** Percent of the watch session under 110 bpm, where the per-second detail reached this date. */
  pctEasy: number | null;
}

/** The app's own record, newest first. */
export async function getGymLog(limit = 5, offset = 0): Promise<GymLogRow[]> {
  const rows = await sql`
    select
      g.date,
      g.day,
      g.day_title,
      g.status,
      g.sets_prescribed,
      round(extract(epoch from (g.finished_at - g.started_at)) / 60)::int as page_open_min,
      (select count(*)::int from gym_set s
         where s.date = g.date and s.done = true and s.reps is not null and s.reps > 0) as sets_logged,
      (select count(distinct s.exercise_id)::int from gym_set s
         where s.date = g.date and s.done = true and s.reps is not null and s.reps > 0) as exercises,
      (select sum(coalesce(w.minutes, 0))::int from health_watch_session w
         where w.date = g.date and w.kind = 'strength') as watch_minutes,
      (select round(avg(d.pct_easy))::int from health_session_detail d
         where d.date = g.date and d.kind = 'strength') as pct_easy
    from gym_session g
    order by g.date desc
    limit ${limit} offset ${offset}
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    date: String(r.date).slice(0, 10),
    day: (r.day as string) ?? null,
    dayTitle: (r.day_title as string) ?? null,
    status: (r.status as string) ?? null,
    setsLogged: Number(r.sets_logged ?? 0),
    setsPrescribed: r.sets_prescribed == null ? null : Number(r.sets_prescribed),
    exercises: Number(r.exercises ?? 0),
    pageOpenMin: r.page_open_min == null ? null : Number(r.page_open_min),
    watchMinutes: r.watch_minutes ? Number(r.watch_minutes) : null,
    pctEasy: r.pct_easy == null ? null : Number(r.pct_easy),
  }));
}

export async function countGymLog(): Promise<number> {
  const rows = await sql`select count(*)::int n from gym_session`;
  return Number((rows[0] as { n: number }).n);
}

/** Every set of one date, for expanding a row in place. */
export interface LoggedSet {
  exerciseId: string;
  exerciseName: string | null;
  setIdx: number;
  weight: number | null;
  reps: number | null;
  swappedFrom: string | null;
  estimated: boolean | null;
}

export async function getSetsForDates(dates: string[]): Promise<Record<string, LoggedSet[]>> {
  if (!dates.length) return {};
  const rows = await sql`
    select date, exercise_id, exercise_name, set_idx, weight, reps, swapped_from, estimated
    from gym_set
    where date = any(${dates}) and done = true and reps is not null and reps > 0
    order by date desc, exercise_id, set_idx
  `;
  const out: Record<string, LoggedSet[]> = {};
  for (const r of rows as unknown as Record<string, unknown>[]) {
    const d = String(r.date).slice(0, 10);
    (out[d] ??= []).push({
      exerciseId: String(r.exercise_id),
      exerciseName: (r.exercise_name as string) ?? null,
      setIdx: Number(r.set_idx),
      weight: r.weight == null ? null : Number(r.weight),
      reps: r.reps == null ? null : Number(r.reps),
      swappedFrom: (r.swapped_from as string) ?? null,
      estimated: r.estimated == null ? null : Boolean(r.estimated),
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------------------------
 * THE WATCH'S RECORD, for the surfaces whose whole history is the watch.
 * ------------------------------------------------------------------------------------------- */

export interface WatchLogRow {
  date: string;
  kind: string;
  minutes: number | null;
  distanceM: number | null;
  avgHr: number | null;
  /** Only where health_session_detail reached this date. Null is common and honest. */
  pctEasy: number | null;
  avgCadence: number | null;
  /** True when the per-second detail exists for this session, so a page can say which rows are
   *  thin rather than printing blanks that look like zeroes. */
  hasDetail: boolean;
}

/** `kinds` is a list because the watch splits what a person calls one activity: running outdoors and
 *  treadmill are separate kinds, and both are "running" to him. Same reasoning as
 *  getRecentSessions in ./session.ts, which maps 'treadmill' to ['treadmill','running']. */
export async function getWatchLog(kinds: string[], limit = 5, offset = 0): Promise<WatchLogRow[]> {
  const rows = await sql`
    select
      w.date, w.kind, coalesce(w.minutes, 0)::int as minutes,
      (select round(avg(d.distance_m))::int from health_session_detail d
         where d.date = w.date and d.kind = w.kind) as distance_m,
      (select round(avg(d.avg_hr))::int from health_session_detail d
         where d.date = w.date and d.kind = w.kind) as avg_hr,
      (select round(avg(d.pct_easy))::int from health_session_detail d
         where d.date = w.date and d.kind = w.kind) as pct_easy,
      (select round(avg(d.avg_cadence))::int from health_session_detail d
         where d.date = w.date and d.kind = w.kind) as avg_cadence
    from health_watch_session w
    where w.kind = any(${kinds})
    order by w.date desc, w.start_time desc
    limit ${limit} offset ${offset}
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    date: String(r.date).slice(0, 10),
    kind: String(r.kind),
    minutes: r.minutes == null ? null : Number(r.minutes),
    distanceM: r.distance_m == null ? null : Number(r.distance_m),
    avgHr: r.avg_hr == null ? null : Number(r.avg_hr),
    pctEasy: r.pct_easy == null ? null : Number(r.pct_easy),
    avgCadence: r.avg_cadence == null ? null : Number(r.avg_cadence),
    hasDetail: r.avg_hr != null,
  }));
}

export async function countWatchLog(kinds: string[]): Promise<number> {
  const rows = await sql`select count(*)::int n from health_watch_session where kind = any(${kinds})`;
  return Number((rows[0] as { n: number }).n);
}

/** Oldest date the watch has for these kinds, so a page can say how far back it goes rather than
 *  implying the rows it shows are the whole record. */
export async function watchLogSpan(kinds: string[]): Promise<{ first: string | null; last: string | null }> {
  const rows = await sql`
    select min(date) as first, max(date) as last
    from health_watch_session where kind = any(${kinds})
  `;
  const r = rows[0] as { first: string | null; last: string | null };
  return {
    first: r.first ? String(r.first).slice(0, 10) : null,
    last: r.last ? String(r.last).slice(0, 10) : null,
  };
}
