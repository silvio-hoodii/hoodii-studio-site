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
   *  session in the store has any. Never a fallback for the wall-clock figure.
   *
   *  GUARDED SINCE 2026-08-28, and the guard is the finding. Splitting the column into two on
   *  2026-08-26 fixed the COLUMN and not the MINIMUM: `min(moving_pace_per_100m_ms)` still had no
   *  floor, so it still returned 1:31, and /swim still rendered that three blocks under a 100 m
   *  personal best of 1:38.71. Faster over 300 m than over 100 m is not a pace, it is an artifact.
   *
   *  Where it came from, measured: 2025-01-22, 300 m, a 26-minute session with FIVE minutes of
   *  swimming in it. 82 percent rest. Rest-excluded pace over twelve lengths with long stops between
   *  them describes the fastest length he happened to swim, not a pace he held. A minimum over a set
   *  containing that session always returns it, whatever the column is called.
   *
   *  So the minimum now runs over sessions where swimming was at least half the session, and the
   *  number arrives WITH its provenance in `bestMovingPaceFrom` so a page can state what it was
   *  measured over. A number that says which swim it came from cannot be a silent lie. The threshold
   *  itself is a judgment and is parked as an open question on content/swim/plan.json. */
  bestMovingPacePer100mMs: number | null;
  /** Which session produced `bestMovingPacePer100mMs`, so the page can say so. Null when the pace is. */
  bestMovingPaceFrom: { date: string; distanceM: number; restShare: number } | null;
  /** How many sessions carry a moving pace at all, so a page can say what the number is drawn from
   *  rather than implying it covers everything. */
  movingPaceSessions: number;
  /** How many of those the rest-share floor EXCLUDED. A different fact from "has no detail", and a
   *  page that conflates the two is back where it started: one means the watch did not time the
   *  lengths, the other means it did and the swim was mostly standing at the wall. */
  mostlyRestSessions: number;
  totalSessions: number;
  /** The newest session date the mirror holds. A page that draws a 90-day window has to be able to
   *  say where the data actually stops, or a stalled sync reads as three quiet weeks. */
  lastSessionOn: string | null;
}

/** Session-level swim history for the last N days, plus all-time bests.
 *
 *  Lifted out of src/lib/health/db.ts on 2026-08-26 so /swim owns its own reads. /health no longer
 *  shows swim at all: it links here. */
/* THE DATE ON THIS TABLE IS UTC, AND THAT PUT TWO DATES FOR ONE SWIM ON ONE SCREEN.
 *
 * Found 2026-08-27 while building /swim/deep. `health_swim_session.date` is derived from a UTC
 * instant, so any swim starting after 18:00 in Calgary is filed on the following day: 94 of 475
 * rows. `health_session_detail`, which feeds the "Your last session" card at the top of this page,
 * is local and correct. So /swim showed a card headed "Aug 25" and, one screen below it, "Last swim
 * the watch export has reached: Aug 26", about the same swim.
 *
 * The comment above this function claimed the opposite ("every row in these tables was stamped in
 * local time") and had been right about the tables it was written for. It is the reason nobody
 * looked.
 *
 * THE EVIDENCE, not a preference: converting `session_start_time` from UTC to America/Edmonton
 * reproduces the date `health_watch_session` independently recorded on 359 of 361 sessions where
 * both exist. The raw column matches on 271. Neither `health_swim_session` nor the mirror that
 * fills it carries a start time, so the instant is recovered by joining to the tables that do, and
 * the 108 sessions with no per-length detail and no session detail keep the raw date rather than
 * being dropped. Fixing this at the source, in the importer, is the real repair; this makes the two
 * halves of one page agree in the meantime. */
/* THE REST-EXCLUDED PACE IS COMPUTED FROM THE LENGTHS NOW, NOT FROM THE STORED COLUMN.
 *
 * Rewritten 2026-09-02, and this is the THIRD pass at the same tile. The column was split in two on
 * 2026-08-26 and the minimum was floored at "swimming is at least half the session" on 2026-08-28,
 * each time with a comment saying the artifact was gone. Measured on 2026-09-02 the tile read
 * **1:39 per 100 m over 1300 m on 2025-05-14**, three blocks under a 100 m freestyle personal best
 * of 1:38.71. The session behind it: 52 lengths of MIXED STROKE (breaststroke, backstroke and
 * freestyle together), containing a 9.4 second length, which is below the 12,000 ms floor
 * `src/lib/swim/deep.ts` calls a sensor miscount because it beats a world-record 25 m split, and a
 * 67.9 second length against a median of 24.1. It cleared the floor at 51% swimming.
 *
 * The floor was the wrong instrument twice because the contamination is not at the session level.
 * `moving_pace_per_100m_ms` is a stored aggregate over EVERY length in the session whatever stroke
 * it was and whatever the sensor said, so no session-level threshold can reach inside it.
 * /swim/deep already filters both, in `LENGTH_MIN_MS`, `LENGTH_MAX_MS` and a freestyle predicate,
 * and /swim was reading a column that filters neither. Same numbers, two pages, two answers.
 *
 * So this recomputes it: freestyle only, lengths inside the same 12 to 60 second band, at least 8
 * of them, and the session still has to be at least half swimming. The stored column is left alone
 * because the importer writes it and other things read it; nothing on /swim minimises over it any
 * more. The rest share is RETURNED AND RENDERED, which it was not: it was computed on 2026-08-28,
 * put in `bestMovingPaceFrom`, and never printed, so a caption reading "rest removed, over 1300 m"
 * still let the reader believe the number was a pace he had held. */
const SWIM_CLEAN_FREESTYLE = `(
        select ln.session_uuid,
               sum(ln.duration_ms) as swim_ms,
               sum(ln.pool_length) as metres,
               count(*) as n
          from health_swim_length ln
         where ln.stroke_type = 'Freestyle'
           and ln.duration_ms between 12000 and 60000
         group by 1
      )`;

const SWIM_LOCAL_DATE = `coalesce(
        ((l.st::timestamp at time zone 'UTC') at time zone 'America/Edmonton')::date,
        ((d.start_time::timestamp at time zone 'UTC') at time zone 'America/Edmonton')::date,
        s.date::date)`;

export async function getSwimHistory(days = 90): Promise<SwimHistory> {
  /* Calgary dates on both sides of the comparison. `daysAgo` gives a Calgary day (see
     src/lib/day.ts) and the column it is compared against is now converted to one. */
  const cutoff = daysAgo(days);
  const [sessionRows, bestFromRows, prRows] = await Promise.all([
    sql`
      select ${sql.unsafe(SWIM_LOCAL_DATE)}::text as date, s.distance_m, s.pace_per_100m_ms
      from health_swim_session s
      left join (
        select session_uuid, min(session_start_time) as st from health_swim_length group by 1
      ) l on l.session_uuid = s.uuid
      left join health_session_detail d on d.uuid = s.uuid and d.kind = 'swimming'
      where ${sql.unsafe(SWIM_LOCAL_DATE)}::text >= ${cutoff}
      order by 1 asc
    `,
    /* TWO MINIMA, over two columns that mean two different things.
       Taking one minimum over the old mixed column is what put a 1:31 "best pace" on /health,
       faster than his official 100 m personal best, off a 300 m session that was 82% rest.
       `pace_per_100m_ms` is always wall clock. `moving_pace_per_100m_ms` exists only where the
       lengths were read and is NEVER a fallback for the other. */
    /* WHICH SESSION THE MOVING-PACE MINIMUM CAME FROM, so the page can state it. A third query
       rather than a window function, because the aggregate below has to keep reading as the
       arithmetic it is. It repeats the floor, which is the one duplication here that earns itself: a
       provenance row selected under a DIFFERENT floor than the minimum would name the wrong swim,
       and a number attributed to the wrong session is worse than the number this replaces. */
    sql`
      select ${sql.unsafe(SWIM_LOCAL_DATE)}::text as date, fs.metres as distance_m, s.duration_ms,
             (fs.swim_ms / (fs.metres / 100.0)) as moving_pace_per_100m_ms
      from health_swim_session s
      join ${sql.unsafe(SWIM_CLEAN_FREESTYLE)} fs on fs.session_uuid = s.uuid
      left join (
        select session_uuid, min(session_start_time) as st from health_swim_length group by 1
      ) l on l.session_uuid = s.uuid
      left join health_session_detail d on d.uuid = s.uuid and d.kind = 'swimming'
      where s.duration_ms > 0
        and fs.n >= 8
        and fs.swim_ms >= s.duration_ms * 0.5
      order by 4 asc
      limit 1
    `,
    sql`
      select
        max(s.distance_m) filter (where s.distance_m > 0) as longest,
        min(s.pace_per_100m_ms) filter (where s.pace_per_100m_ms > 0) as best_wall_pace,
        /* THE FLOOR IS ONE OF TWO GUARDS AND IT WAS NEVER THE MAIN ONE. The share of the session
           that was swimming has to be at least half, or the figure describes a rest interval
           rather than a pace. But the pace itself now comes from fs, the freestyle band-filtered
           lengths, because the stored column mixes strokes and includes sensor miscounts and no
           session-level floor can reach inside an aggregate. See SWIM_CLEAN_FREESTYLE above for the
           mixed-stroke session with a 9.4 second length that this tile printed as 1:39 per 100 m.
           NO BACKTICKS IN HERE: this is inside a tagged template and a backtick ends it. That cost a
           typecheck once, and it is the fifth instance of the same class in one session. */
        min(fs.swim_ms / (fs.metres / 100.0)) filter (
          where fs.n >= 8
            and s.duration_ms > 0
            and fs.swim_ms >= s.duration_ms * 0.5
        ) as best_moving_pace,
        count(*) filter (where fs.n >= 8) as moving_sessions,
        /* How many were excluded BY THE FLOOR rather than by having no detail, because those are two
           different facts and a page that conflates them is back where it started. */
        count(*) filter (
          where fs.n >= 8
            and s.duration_ms > 0
            and fs.swim_ms < s.duration_ms * 0.5
        ) as mostly_rest_sessions,
        count(*) as total,
        /* THE LINE THE READER SEES, so it is the one that had to stop disagreeing with the card at
           the top of the page. Derived, per SWIM_LOCAL_DATE above. */
        max(${sql.unsafe(SWIM_LOCAL_DATE)})::text as last_on
      from health_swim_session s
      left join ${sql.unsafe(SWIM_CLEAN_FREESTYLE)} fs on fs.session_uuid = s.uuid
      left join (
        select session_uuid, min(session_start_time) as st from health_swim_length group by 1
      ) l on l.session_uuid = s.uuid
      left join health_session_detail d on d.uuid = s.uuid and d.kind = 'swimming'
    `,
  ]);
  const pr = prRows[0] as {
    longest: number | null;
    best_wall_pace: number | null;
    best_moving_pace: number | null;
    moving_sessions: string;
    mostly_rest_sessions: string;
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
    bestMovingPaceFrom: (() => {
      const f = bestFromRows[0] as
        { date: string; distance_m: number; duration_ms: number; moving_pace_per_100m_ms: number } | undefined;
      if (!f) return null;
      const swimMs = (f.moving_pace_per_100m_ms * f.distance_m) / 100;
      return {
        date: f.date,
        distanceM: f.distance_m,
        restShare: Math.max(0, Math.round((1 - swimMs / f.duration_ms) * 100)),
      };
    })(),
    movingPaceSessions: Number(pr.moving_sessions),
    mostlyRestSessions: Number(pr.mostly_rest_sessions),
    totalSessions: Number(pr.total),
    lastSessionOn: pr.last_on,
  };
}


/** The longest UNBROKEN piece in each of the last N swims, derived. 11-swim P1-4.
 *
 *  WHAT IT REPLACES. `content/swim/plan.json` carried this as a typed sentence:
 *
  *    "Longest piece in your last ten swims: 100, 100, 100, 500, 125, 250, 150, 100, 150 m.
  *     The long one happens monthly, not weekly. That is the gap, not fitness."
 *
 *  Nine values under a label saying ten, a snapshot ending around 2026-08-22, and a diagnosis the
 *  live data contradicts. Recomputed: SEVEN of the last ten swims hold a piece of 150 m or more,
 *  six of them inside eleven days, and the newest is a 200 m piece on 2026-08-26 which is exactly
 *  the number he recorded as his baseline two days later. The long one happens most swims now.
 *
 *  That sentence is the premise of the whole ten-week continuity ladder, and the page prints it
 *  under the heading "Where you are". The block's own comment says the 2026-08-21 fix means "the
 *  page cannot outgrow what the laps say"; it labelled the facts and left them typed, so it could
 *  and it did.
 *
 *  A PIECE ENDS AT A RECORDED REST. `rest_after_ms` is what the watch stores between lengths, so a
 *  run of consecutive lengths with no rest between them is one unbroken swim.
 *
 *  THE GUARD THAT WAS MEANT TO EXCLUDE THE PRE-2025 ERA DID NOTHING, and that was measured on
 *  2026-09-02. It read `where rest_after_ms is not null`, and its own docstring said "sessions with
 *  no rest data at all are excluded rather than counted as one enormous piece, which is the
 *  flattering reading and the one this file has been burned by before". The column is **0, never
 *  NULL**: 19,327 of 19,327 rows are non-null, including all 10,037 rows from 2018 to 2024 that
 *  `src/lib/swim/deep.ts` correctly describes as carrying no rest. So every row passed. The only
 *  reason it never printed a 2,000 m "unbroken" piece is that `limit 10` and `limit 40` both land
 *  inside 2026, where he swims often enough that the window never reaches back.
 *
 *  THE REPLACEMENT IS THE DISCRIMINATOR, NOT AN ERA TEST. A session's rest data is usable if it
 *  either records a rest, or the session clock proves there was none to record: session duration
 *  minus the sum of the lengths. That proxy tracks the recorded rest at r = 0.95 across the 185
 *  sessions carrying both, slope 1.06, and **not one of those 185 comes in under 30 seconds**. So a
 *  gap under 30 s means no rest, in any year, and it is the only test that can see the five 2,000 m
 *  swims of March and April 2023 where the two clocks agree to within 23 seconds. Those are his
 *  longest continuous swims on record, 3.3 times the 600 m this plan calls his longest piece, and
 *  the old guard is the reason nothing on /swim could see them.
 */
export interface LongestPiece {
  date: string;
  metres: number;
  seconds: number;
}

export async function getLongestPieces(limit = 10): Promise<LongestPiece[]> {
  const rows = (await sql`
    /* THE SAME l, s AND d ALIASES the rest of this file uses, because SWIM_LOCAL_DATE is written
       against them and there is exactly one definition of a swim's local date on this site. The
       first draft aliased health_swim_length as l directly and the query threw "column l.st does not
       exist": l in that expression is the SUBQUERY holding min(session_start_time) as st, not the
       length table. The lengths are ln here for that reason. Reusing the expression rather than
       writing a second date conversion is the point: four date columns describe these swims and 94
       of 475 rows are a day out.
       NO BACKTICKS IN HERE. This is inside a tagged template and a backtick ends it. Ninth instance
       of that class today, in a comment that already says so twelve lines up in this same file. */
    select ln.session_uuid,
           ${sql.unsafe(SWIM_LOCAL_DATE)}::text as date,
           ln.length_index, ln.pool_length, ln.duration_ms,
           coalesce(ln.rest_after_ms, 0) as rest
      from health_swim_length ln
      left join health_swim_session s on s.uuid = ln.session_uuid
      left join (
        select session_uuid, min(session_start_time) as st from health_swim_length group by 1
      ) l on l.session_uuid = ln.session_uuid
      left join health_session_detail d on d.uuid = ln.session_uuid and d.kind = 'swimming'
     where ln.session_uuid in (
       /* USABLE REST DATA, per the note above: the session records a rest, or the session clock
          proves there was none. The old test, rest_after_ms is not null, passed every row in the
          table, including eight years that carry no rest at all. */
       select ln2.session_uuid
         from health_swim_length ln2
         left join health_swim_session s2 on s2.uuid = ln2.session_uuid
        group by ln2.session_uuid
       having sum(coalesce(ln2.rest_after_ms, 0)) > 0
           or max(s2.duration_ms) - sum(ln2.duration_ms) <= 30000
        order by min(ln2.session_start_time) desc
        limit ${limit}
     )
     order by ln.session_start_time desc, ln.length_index asc
  `) as unknown as {
    session_uuid: string; date: string; length_index: number;
    pool_length: number | null; duration_ms: number | null; rest: number;
  }[];

  const bySession = new Map<string, { date: string; lengths: typeof rows }>();
  for (const r of rows) {
    const hit = bySession.get(r.session_uuid);
    if (hit) hit.lengths.push(r);
    else bySession.set(r.session_uuid, { date: r.date, lengths: [r] });
  }

  const out: LongestPiece[] = [];
  for (const { date, lengths } of bySession.values()) {
    let bestM = 0; let bestS = 0; let runM = 0; let runS = 0;
    for (const l of lengths) {
      runM += Number(l.pool_length) || 25;
      runS += (Number(l.duration_ms) || 0) / 1000;
      if (Number(l.rest) > 0) {
        if (runM > bestM) { bestM = runM; bestS = runS; }
        runM = 0; runS = 0;
      }
    }
    if (runM > bestM) { bestM = runM; bestS = runS; }
    if (bestM > 0) out.push({ date, metres: bestM, seconds: Math.round(bestS) });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
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
    /* SAME DERIVED DATE as getSwimHistory, and it matters more here than anywhere: the hub turns
       this into "last swim N days ago", so a date a day late makes the number a day small. Ordering
       is on the derived date too, because the newest raw date and the newest real swim are not
       always the same row once 94 of 475 are shifted. */
    sql`
      select ${sql.unsafe(SWIM_LOCAL_DATE)}::text as date, s.distance_m
      from health_swim_session s
      left join (
        select session_uuid, min(session_start_time) as st from health_swim_length group by 1
      ) l on l.session_uuid = s.uuid
      left join health_session_detail d on d.uuid = s.uuid and d.kind = 'swimming'
      order by 1 desc
      limit 1
    `,
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
