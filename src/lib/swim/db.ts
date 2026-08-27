import 'server-only';
import { neon } from '@neondatabase/serverless';
import { daysAgo } from '../day';

/* EVERYTHING /swim READS AND WRITES. Rebuilt 2026-08-26.
 *
 * This file used to be the read layer for the Calgary pool schedule: six scrapers on the laptop
 * pushed a mirror into swim_session / swim_coverage / swim_pool / swim_sync and this queried it.
 * All four tables and all six scrapers are gone, along with the only answer anywhere to "which pool
 * has lane swim open right now". That was Silvio's call, made knowing the cost.
 *
 * What replaced it is the half that was buried three clicks deep inside /gym/conditioning?p=swim:
 * his own swimming. The tables below keep their existing names on purpose. Renaming
 * `gym_swim_baseline` to tidy a prefix would need a migration on the store holding the only copy of
 * his calibration number, and renaming the `health_*` tables would break the HealthOS importer that
 * fills them. A tidy prefix is not worth either.
 *
 * Same Neon database as Kitchen, Gym and Health; the table prefixes are what keep them apart. */
const DATABASE_URL =
  process.env.SWIM_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('SWIM_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL as fallback) is not set');
}

export const sql = neon(DATABASE_URL);

/* ---------------------------------------------------------------------------------------------
 * The calibration number.
 *
 * A HISTORY, not one row. Re-calibrating in eight weeks is the point of the ladder, and overwriting
 * would throw away the evidence that it moved. `getSwimBaseline` returns the newest.
 * DDL: content/swim/baseline.sql.
 * ------------------------------------------------------------------------------------------- */
export interface SwimBaseline {
  measuredOn: string;
  metres: number;
  noBuoy: boolean;
  note: string | null;
}

export async function addSwimBaseline(b: SwimBaseline): Promise<void> {
  await sql`
    insert into gym_swim_baseline (measured_on, metres, no_buoy, note)
    values (${b.measuredOn}, ${b.metres}, ${b.noBuoy}, ${b.note})
  `;
}

export async function getSwimBaseline(): Promise<SwimBaseline | null> {
  const rows = await sql`
    select measured_on, metres, no_buoy, note
    from gym_swim_baseline
    order by measured_on desc, id desc
    limit 1
  `;
  const r = rows[0] as { measured_on: string; metres: number; no_buoy: boolean; note: string | null } | undefined;
  return r ? { measuredOn: r.measured_on, metres: Number(r.metres), noBuoy: r.no_buoy, note: r.note } : null;
}

/* ---------------------------------------------------------------------------------------------
 * The history, from the watch.
 * ------------------------------------------------------------------------------------------- */
export interface SwimSessionRow {
  date: string;
  distanceM: number | null;
  pacePer100mMs: number | null;
}

export interface SwimHistory {
  sessions: SwimSessionRow[];
  longestDistanceM: number | null;
  /** Best WALL-CLOCK pace, rest included. Comparable across every session.
   *
   *  Renamed from `bestPacePer100mMs` on 2026-08-26 so a caller cannot keep the old meaning by
   *  accident. The column behind it used to be computed two ways depending on what the export held,
   *  and a minimum over a mixed column always picks the flattering definition. */
  bestWallPacePer100mMs: number | null;
  /** Best REST-EXCLUDED pace, and only from sessions whose per-length detail was read. Null when no
   *  session in the store has any. Never a fallback for the wall-clock figure. */
  bestMovingPacePer100mMs: number | null;
  /** How many sessions carry a moving pace at all, so a page can say what the number is drawn from
   *  rather than implying it covers everything. */
  movingPaceSessions: number;
  totalSessions: number;
  /** The newest session date the mirror holds. A page that draws a 90-day window has to be able to
   *  say where the data actually stops, or a stalled sync reads as three quiet weeks. */
  lastSessionOn: string | null;
}

/** Session-level swim history for the last N days, plus all-time bests.
 *
 *  Lifted out of src/lib/health/db.ts on 2026-08-26 so /swim owns its own reads. /health no longer
 *  shows swim at all: it links here. */
export async function getSwimHistory(days = 90): Promise<SwimHistory> {
  /* Calgary dates, not UTC ones: every row in these tables was stamped in local time. Same reason
     src/lib/health/db.ts routes its cutoffs through this helper. See src/lib/day.ts. */
  const cutoff = daysAgo(days);
  const [sessionRows, prRows] = await Promise.all([
    sql`
      select date, distance_m, pace_per_100m_ms from health_swim_session
      where date >= ${cutoff}
      order by date asc
    `,
    /* TWO MINIMA, over two columns that mean two different things.
       Taking one minimum over the old mixed column is what put a 1:31 "best pace" on /health,
       faster than his official 100 m personal best, off a 300 m session that was 82% rest.
       `pace_per_100m_ms` is always wall clock. `moving_pace_per_100m_ms` exists only where the
       lengths were read and is NEVER a fallback for the other. */
    sql`
      select
        max(distance_m) filter (where distance_m > 0) as longest,
        min(pace_per_100m_ms) filter (where pace_per_100m_ms > 0) as best_wall_pace,
        min(moving_pace_per_100m_ms) filter (where moving_pace_per_100m_ms > 0) as best_moving_pace,
        count(*) filter (where moving_pace_per_100m_ms > 0) as moving_sessions,
        count(*) as total,
        max(date) as last_on
      from health_swim_session
    `,
  ]);
  const pr = prRows[0] as {
    longest: number | null;
    best_wall_pace: number | null;
    best_moving_pace: number | null;
    moving_sessions: string;
    total: string;
    last_on: string | null;
  };
  return {
    sessions: (
      sessionRows as unknown as { date: string; distance_m: number | null; pace_per_100m_ms: number | null }[]
    ).map((r) => ({ date: r.date, distanceM: r.distance_m, pacePer100mMs: r.pace_per_100m_ms })),
    longestDistanceM: pr.longest,
    bestWallPacePer100mMs: pr.best_wall_pace,
    bestMovingPacePer100mMs: pr.best_moving_pace,
    movingPaceSessions: Number(pr.moving_sessions),
    totalSessions: Number(pr.total),
    lastSessionOn: pr.last_on,
  };
}

/** The one line the front door needs: last swim, how far, and how long ago.
 *
 *  Derived, never hand-written. The row on / read "Which Calgary pools have lane swim open right
 *  now" for months while pointing at a page that had stopped being a schedule, and before that it
 *  read "Sessions, drills, and what to work on in the water", which the app had never been. A
 *  sentence nobody computes is a sentence nobody checks. */
export interface SwimFrontRow {
  lastDate: string | null;
  lastDistanceM: number | null;
  totalSessions: number;
  longestDistanceM: number | null;
}

export async function getSwimFrontRow(): Promise<SwimFrontRow> {
  const [lastRows, aggRows] = await Promise.all([
    sql`select date, distance_m from health_swim_session order by date desc limit 1`,
    sql`
      select count(*) as total, max(distance_m) filter (where distance_m > 0) as longest
      from health_swim_session
    `,
  ]);
  const last = lastRows[0] as { date: string; distance_m: number | null } | undefined;
  const agg = aggRows[0] as { total: string; longest: number | null };
  return {
    lastDate: last?.date ?? null,
    lastDistanceM: last?.distance_m ?? null,
    totalSessions: Number(agg.total),
    longestDistanceM: agg.longest,
  };
}
