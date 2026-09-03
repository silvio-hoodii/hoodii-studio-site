import 'server-only';
import { sql } from './db';
import { LENGTH_MIN_MS, LENGTH_MAX_MS } from './deep';

/* DISTANCES THE WATCH DOES NOT KEEP, derived from the individual lengths. THIS YEAR ONLY.
 *
 * HIS ASK, 2026-09-03: "are you able to tell me my last or somehow my metrics from 1 km in the past
 * year: the average time maybe and what's the lowest? I just want to have a reference for the 1,000,
 * which the watch doesn't have as a default. It goes from 400 to 1,500."
 *
 * He is right. `health_swim_pb` holds four distances, 100, 200, 400 and 1500, and nothing between
 * 400 and 1500. The whole swim plan is built on 1,000 m and there was no 1,000 m number anywhere.
 *
 * THE WINDOW IS THE CALENDAR YEAR, ON HIS RULING the same day, correcting a first pass that used a
 * rolling twelve months: "Don't do the past year. Just do this year, 2026. Anything that we talk
 * about here, I want it to be from 2026 ... Everything that I started designing and measuring
 * starts from this year. I don't care about 2025 or 2023." Same convention /health and /health/deep
 * already use, and the year is DERIVED from today's date, never typed, so this does not need editing
 * in January. It also removes a real hazard: a swimming-time record is derivable back to 2018 and a
 * wall-clock record only from 2025, so an all-time table would have compared two different eras in
 * two adjacent columns.
 *
 * HE ALSO SETTLED THE DEFINITION HIMSELF, which is the part that made this buildable: "We either
 * filter every 1,000 that I have done, including the ones where I did more and just measured the
 * 1,000." So a 1,000 m inside a longer swim counts. This finds every contiguous run of lengths
 * summing to exactly the target distance, anywhere in any swim.
 *
 * ============================================================================================
 * TWO CLOCKS, ALWAYS BOTH, NEVER ONE. This is the whole reason this file is careful.
 * ============================================================================================
 *
 * AGENTS.md records what one clock costs: /health printed a best pace of 1:31 per 100 m off a
 * session that was 82% rest, FASTER than his official 100 m personal best, because the column was
 * computed two ways and a minimum over a mixed column always selects the flattering definition.
 *
 *   SWIMMING  the length durations added up. Rest removed.
 *   WALL      swimming plus the rests between those lengths. What the pool clock would show.
 *
 * EACH CLOCK PICKS ITS OWN BEST WINDOW. The first version of this derivation chose each swim's best
 * window by swimming time and then printed that window's wall clock, which is a mixed criterion: the
 * fastest 1,000 m of swimming is not the fastest 1,000 m on the wall, because what separates them is
 * the rest, and the rest is the thing being measured.
 *
 * ============================================================================================
 * AND THE WATCH'S OWN CLOCK IS A THIRD ONE. Measured 2026-09-03, do not assume otherwise.
 * ============================================================================================
 *
 * Samsung's stored personal bests do not agree with either clock here, and the gap is not rounding.
 * Checked against the lengths of the sessions the bests were set in:
 *
 *   100 m  PB 1:38.71  first four lengths: swimming 1:39, wall 1:39   (no rest inside, all agree)
 *   200 m  PB 3:29.80  first eight:        swimming 3:31, wall 3:31
 *   400 m  PB 7:23.62  first sixteen:      swimming 7:29, wall 7:29   (PB is 5 s FASTER, so the PB
 *                                          is the best 400 m window in a 5,000 m swim, not the first)
 *   1500 m PB 30:58.56 the whole swim:     swimming 29:42, wall 31:55 (PB sits BETWEEN the two)
 *
 * So the watch's number is neither. On the 1500 it counts about 58% of the rest. That matters for
 * exactly one reason: it explains an apparent artifact rather than leaving it to be rediscovered.
 * The stored 1500 PB is 2:04 per 100 m and the best derived 1,000 m on the wall clock is 2:05, which
 * reads as faster over the longer distance. Once the 1,000 m is put on the watch's own clock it
 * lands near 20:30, about 2:03 per 100 m, and longer is slower again. **Never print a derived time
 * in the same column as a stored personal best without saying they are different clocks.**
 */

/** One derived record for one distance, over the current calendar year. */
export interface DerivedRecord {
  distanceM: number;
  /** Contiguous windows of this distance found, counting every position in every swim. */
  windows: number;
  /** Swims that contained at least one. The honest denominator for "attempts". */
  swims: number;
  /** Swims where a wall clock could be derived, i.e. the watch stored the rests. */
  wallSwims: number;
  bestSwimmingMs: number | null;
  bestSwimmingOn: string | null;
  /** A different window from the swimming best, and often a different day. */
  bestWallMs: number | null;
  bestWallOn: string | null;
  medianSwimmingMs: number | null;
  medianWallMs: number | null;
  /** Median total rest inside the distance. The 1,000 m goal is about making this zero. */
  medianRestMs: number | null;
  /** The least-interrupted attempt of the year, which is the number the goal is really about. */
  leastRestMs: number | null;
  leastRestOn: string | null;
  leastRestWallMs: number | null;
  /** Where the pauses fell on that attempt, in metres swum. Empty means it was unbroken. */
  leastRestStops: { atM: number; restS: number }[];
}

export interface SwimRecords {
  /** Derived from today's date, never typed. */
  year: number;
  derived: DerivedRecord[];
  coverage: {
    lengthsRead: number;
    lengthsRefused: number;
    sessions: number;
    firstDay: string | null;
    lastDay: string | null;
  };
}

interface LengthRow {
  session_uuid: string;
  length_index: number;
  d: string;
  pool_length: number;
  duration_ms: number;
  stroke_type: string;
  stroke_count: number;
  rest_after_ms: number | null;
}

interface Window {
  uuid: string;
  d: string;
  swimmingMs: number;
  restMs: number | null;
  wallMs: number | null;
  stops: { atM: number; restS: number }[];
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : (((s[m - 1] as number) + (s[m] as number)) / 2);
};

/** Every contiguous run of in-band FREESTYLE lengths summing to exactly `targetM`.
 *
 *  FREESTYLE ONLY, deliberately. The goal these numbers serve is a 1,000 m freestyle, and
 *  mixed-stroke windows are both slower and not the thing being trained. It also removes a live
 *  artifact: the fastest any-stroke 1,000 m is 16:54, which is 1:41 per 100 m and a shade off his
 *  100 m personal best pace. That window contains two lengths of 14 and 16 seconds carrying four
 *  and six stroke cycles, which are push-off glides or a mis-segmented length rather than swimming.
 *  They clear the 12 s floor, so the floor does not catch them and the stroke filter does not
 *  either. Recorded because the number looks entirely plausible and is not.
 *
 *  CONTIGUITY IS BY `length_index`, not by position in the filtered array. A refused length breaks
 *  the run rather than being skipped over, because 40 lengths with a gap in the middle is not
 *  1,000 m of continuous swimming, and skipping would silently splice two efforts together. */
function windowsFor(lengths: LengthRow[], targetM: number): Window[] {
  const out: Window[] = [];
  const inBand = (r: LengthRow) =>
    Number(r.duration_ms) >= LENGTH_MIN_MS
    && Number(r.duration_ms) <= LENGTH_MAX_MS
    && Number(r.stroke_count) > 0;

  for (let i = 0; i < lengths.length; i++) {
    let metres = 0;
    let swimmingMs = 0;
    let restMs = 0;
    let restKnown = true;
    const stops: { atM: number; restS: number }[] = [];

    for (let j = i; j < lengths.length; j++) {
      const r = lengths[j] as LengthRow;
      const prev = j > i ? (lengths[j - 1] as LengthRow) : null;
      if (!inBand(r) || r.stroke_type !== 'Freestyle') break;
      if (prev && Number(r.length_index) !== Number(prev.length_index) + 1) break;
      if (prev) {
        const rest = prev.rest_after_ms;
        if (rest === null || rest === undefined) restKnown = false;
        else {
          restMs += Number(rest);
          if (Number(rest) > 0) stops.push({ atM: metres, restS: Math.round(Number(rest) / 1000) });
        }
      }
      metres += Number(r.pool_length);
      swimmingMs += Number(r.duration_ms);
      if (metres >= targetM) break;
    }

    /* Landing PAST the target is not a window for it. A 25 m pool cannot make 1,000 m out of
       anything but 40 lengths, but a 50 m pool would overshoot 1,000 at 1,050 and must not be
       counted as a slow 1,000. */
    if (metres !== targetM) continue;
    out.push({
      uuid: (lengths[i] as LengthRow).session_uuid,
      d: (lengths[i] as LengthRow).d,
      swimmingMs,
      restMs: restKnown ? restMs : null,
      wallMs: restKnown ? swimmingMs + restMs : null,
      stops: restKnown ? stops : [],
    });
  }
  return out;
}

/** Each swim's own best window on one clock, so one long swim cannot fill the whole table. */
function bestPerSwim(ws: Window[], key: 'swimmingMs' | 'wallMs'): Window[] {
  const m = new Map<string, Window>();
  for (const w of ws) {
    const v = w[key];
    if (v === null) continue;
    const cur = m.get(w.uuid);
    if (!cur || v < (cur[key] as number)) m.set(w.uuid, w);
  }
  return [...m.values()];
}

export async function getSwimRecords(distances: number[]): Promise<SwimRecords> {
  /* THE YEAR IS DERIVED IN SQL from current_date, so nothing here carries a literal 2026 and this
     file needs no edit in January.

     Dates are DERIVED through America/Edmonton and `date` is never selected, per the trap recorded
     in src/lib/swim/deep.ts: `health_swim_length.date` is UTC and is a day out on every evening
     swim, which is 94 of 475 rows. A January swim at 21:00 local is stamped the 1st of the next year
     in that column, so selecting it here would put the year boundary in the wrong place too. */
  const rows = (await sql`
    select session_uuid,
           length_index,
           ((session_start_time::timestamp at time zone 'UTC') at time zone 'America/Edmonton')::date::text as d,
           pool_length, duration_ms, stroke_type, stroke_count, rest_after_ms
    from health_swim_length
    where session_start_time is not null
      and ((session_start_time::timestamp at time zone 'UTC') at time zone 'America/Edmonton')::date
          >= date_trunc('year', current_date)::date
    order by session_uuid, length_index
  `) as unknown as LengthRow[];

  const refused = rows.filter(
    (r) => !(Number(r.duration_ms) >= LENGTH_MIN_MS && Number(r.duration_ms) <= LENGTH_MAX_MS && Number(r.stroke_count) > 0),
  ).length;
  const days = rows.map((r) => r.d).filter(Boolean).sort();

  const bySession = new Map<string, LengthRow[]>();
  for (const r of rows) {
    const list = bySession.get(r.session_uuid);
    if (list) list.push(r);
    else bySession.set(r.session_uuid, [r]);
  }
  for (const list of bySession.values()) list.sort((a, b) => Number(a.length_index) - Number(b.length_index));

  const derived: DerivedRecord[] = distances.map((distanceM) => {
    const all: Window[] = [];
    for (const list of bySession.values()) all.push(...windowsFor(list, distanceM));

    const bySwimSwimming = bestPerSwim(all, 'swimmingMs');
    const bySwimWall = bestPerSwim(all, 'wallMs');

    const bestS = bySwimSwimming.reduce<Window | null>((a, b) => (!a || b.swimmingMs < a.swimmingMs ? b : a), null);
    const bestW = bySwimWall.reduce<Window | null>((a, b) => (!a || (b.wallMs as number) < (a.wallMs as number) ? b : a), null);
    const least = bySwimWall
      .filter((w) => w.restMs !== null)
      .reduce<Window | null>((a, b) => (!a || (b.restMs as number) < (a.restMs as number) ? b : a), null);

    return {
      distanceM,
      windows: all.length,
      swims: bySwimSwimming.length,
      wallSwims: bySwimWall.length,
      bestSwimmingMs: bestS?.swimmingMs ?? null,
      bestSwimmingOn: bestS?.d ?? null,
      bestWallMs: bestW?.wallMs ?? null,
      bestWallOn: bestW?.d ?? null,
      medianSwimmingMs: median(bySwimSwimming.map((w) => w.swimmingMs)),
      medianWallMs: median(bySwimWall.map((w) => w.wallMs as number)),
      medianRestMs: median(bySwimWall.filter((w) => w.restMs !== null).map((w) => w.restMs as number)),
      leastRestMs: least?.restMs ?? null,
      leastRestOn: least?.d ?? null,
      leastRestWallMs: least?.wallMs ?? null,
      leastRestStops: least?.stops ?? [],
    };
  });

  return {
    year: new Date().getFullYear(),
    derived,
    coverage: {
      lengthsRead: rows.length,
      lengthsRefused: refused,
      sessions: bySession.size,
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,
    },
  };
}
