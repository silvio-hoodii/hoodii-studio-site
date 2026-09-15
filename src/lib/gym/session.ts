import 'server-only';
import { sql } from '../health/db';

/* THE LAST SESSION, per activity, from what the watch recorded INSIDE it.
 *
 * "I liked how we did the analysis of each session for the swimming part... I want that for
 * everything. I don't know if there's more information on weightlifting. Maybe there is, maybe
 * there's not, but just look into each activity and exploit all the information that we have."
 *
 * The four activities are NOT equal, and the honest answer to his question is that lifting has
 * almost nothing. Audited before anything was built:
 *
 *   swimming   heart rate per second, and per LENGTH: duration, stroke count, stroke, rest.
 *   treadmill  heart rate, cadence, speed, distance per second. Cadence IS measured indoors.
 *   strength   heart rate. Nothing else. No reps, no load, no rest detection.
 *   cycling    heart rate. Nothing else at all.
 *
 * So each kind gets the panel its data can support, and the two that have only a heart rate say so
 * rather than being padded out to look equally analysed. */

export type SessionKind =
  | 'swimming' | 'treadmill' | 'running' | 'strength' | 'cycling'
  /** He started a workout on the watch and picked "Other workout" instead of a named sport. */
  | 'other'
  /** The watch's own detection fired, could not name the movement, and backfilled a session he
   *  never started. Ten minutes of the heart-rate trace are missing from the front of every one,
   *  because that is how long the watch took to decide. See HealthOS/server/import-watch-sessions.mjs. */
  | 'other-auto';

export interface LengthRow {
  /** Seconds for the length. */
  s: number;
  /** Stroke CYCLES, both arms. Samsung's counter reports cycles: his median is 9 per 25 m, which
   *  would be 2.78 m per single arm stroke and is not physically possible. */
  c: number;
  /** Seconds of rest recorded after this length. */
  rest: number;
  stroke: string | null;
}

export interface SessionDetail {
  uuid: string;
  date: string;
  kind: SessionKind;
  startTime: string;
  minutes: number | null;
  /** Exact seconds for a swim, off health_swim_session. `minutes` is an INTEGER column, so a 7:04
   *  swim reads 7 and any pace worked out from it comes out fast. Null for anything but a swim. */
  durationSec: number | null;
  distanceM: number | null;
  calories: number | null;
  avgHr: number | null;
  maxHr: number | null;
  minHr: number | null;
  /** Percent of the session under 110 bpm. */
  pctEasy: number | null;
  poolLength: number | null;
  lengths: number | null;
  avgSwolf: number | null;
  avgCycles: number | null;
  strokeRate: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  series: { hr: number[]; cadence?: number[]; speed?: number[]; lengths?: LengthRow[] };
}

const map = (r: Record<string, unknown>): SessionDetail => ({
  uuid: String(r.uuid),
  date: String(r.date),
  kind: String(r.kind) as SessionKind,
  startTime: String(r.start_time),
  minutes: r.minutes == null ? null : Number(r.minutes),
  durationSec: r.swim_duration_ms == null ? null : Number(r.swim_duration_ms) / 1000,
  distanceM: r.distance_m == null ? null : Number(r.distance_m),
  calories: r.calories == null ? null : Number(r.calories),
  avgHr: r.avg_hr == null ? null : Number(r.avg_hr),
  maxHr: r.max_hr == null ? null : Number(r.max_hr),
  minHr: r.min_hr == null ? null : Number(r.min_hr),
  pctEasy: r.pct_easy == null ? null : Number(r.pct_easy),
  poolLength: r.pool_length == null ? null : Number(r.pool_length),
  lengths: r.lengths == null ? null : Number(r.lengths),
  avgSwolf: r.avg_swolf == null ? null : Number(r.avg_swolf),
  avgCycles: r.avg_cycles == null ? null : Number(r.avg_cycles),
  strokeRate: r.stroke_rate == null ? null : Number(r.stroke_rate),
  avgCadence: r.avg_cadence == null ? null : Number(r.avg_cadence),
  maxCadence: r.max_cadence == null ? null : Number(r.max_cadence),
  series: (r.detail as SessionDetail['series']) ?? { hr: [] },
});

/** The most recent session of a kind. `treadmill` also accepts an outdoor run. */
export async function getLastSession(kind: SessionKind): Promise<SessionDetail | null> {
  const kinds = kind === 'treadmill' ? ['treadmill', 'running'] : [kind];
  const rows = await sql`
    select d.*, s.duration_ms as swim_duration_ms
    from health_session_detail d
    left join health_swim_session s on s.uuid = d.uuid
    where d.kind = any(${kinds})
    order by d.start_time desc
    limit 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  return r ? map(r) : null;
}

/** Recent sessions of a kind, newest first, for a trend beside the single session. */
export async function getRecentSessions(kind: SessionKind, limit = 10): Promise<SessionDetail[]> {
  const kinds = kind === 'treadmill' ? ['treadmill', 'running'] : [kind];
  const rows = await sql`
    select d.*, s.duration_ms as swim_duration_ms
    from health_session_detail d
    left join health_swim_session s on s.uuid = d.uuid
    where d.kind = any(${kinds})
    order by d.start_time desc
    limit ${limit}
  `;
  return (rows as unknown as Record<string, unknown>[]).map(map);
}

/** mm:ss for a duration in seconds. */
export function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Pace per 100 m, as mm:ss, from a distance and a duration. */
export function pacePer100(distanceM: number | null, minutes: number | null): string | null {
  if (!distanceM || !minutes) return null;
  return mmss((minutes * 60) / (distanceM / 100));
}

/* WHAT THE SESSION SAYS, in one sentence, and only where the data can carry one.
 *
 * Deliberately narrow. A heart-rate trace over a lifting session cannot tell him whether the lifting
 * was any good, and a page that dressed it up as insight would be exactly the "slop sitting there
 * without any real reason" he complained about. It CAN say how much of the hour was spent under
 * 110 bpm, which is a fact about the shape of his session and the one that found a 28-minute hole. */
export function sessionVerdict(s: SessionDetail): string | null {
  /* ONE SENTENCE SURVIVES, since 2026-09-15. The strength sentence restated the "Under 110 bpm" tile
     beside it and added that a wrist heart rate cannot judge a lift; the bike one said the watch
     records nothing but heart rate; "Other workout" explained which button he pressed; the cadence
     ones restated the cadence tile and pointed at 170, which contradicts the run cue (raise your
     own number by 5 percent). None changed what he does. The auto-detected one stays, because it
     is the only thing that says a session on the page was not one he started. */
  if (s.kind === 'other-auto') {
    return 'The watch started this one by itself and could not tell what it was.';
  }
  return null;
}

/* THE HIGHEST HEART RATE HIS WATCH HAS EVER RECORDED, derived, because it was typed and it was wrong.
 *
 * `content/gym/conditioning.json` asserted in five rendered strings that his highest recorded heart
 * rate is 175. Live: `select max(max_hr) from health_session_detail` returns 201, and 23 of his 60
 * swims with a reading exceed 175. Six swims tie at exactly 175, which is almost certainly where the
 * number came from: 175 is a MODE, not a maximum. Found by the 2026-08-28 /run and /bike audit
 * (12-run-bike B1) and verified independently by the orchestrator before anything was changed.
 *
 * THE COST WAS NOT CREDIBILITY, IT WAS A STOP RULE THAT FIRES ROUTINELY. Cue 7 on /bike?s=how is the
 * only stop rule anywhere in the week, and it read "HEART RATE ABOVE 175, higher than anything you
 * have ever recorded". He has beaten it on 23 of his last 60 swims. A stop rule that goes off on a
 * normal day is a stop rule he learns to ignore, which is worse than not having one.
 *
 * SO IT IS DERIVED AND CAN NEVER AGAIN NAME A NUMBER HE HAS PASSED. The page interpolates this rather
 * than carrying a figure, and the same query that produces the number produces the count above it, so
 * a page can assert "nothing above this" and be checkable.
 *
 * WHICH ANCHOR THE PRESCRIPTION SHOULD USE IS HIS CALL, NOT THIS FUNCTION'S. `kind` is returned
 * because it matters: the single highest reading is a wrist sensor in a swimming pool, which is the
 * least trustworthy case there is, and 85 to 95 percent of 201 is a real intensity increase for a
 * beginner. `excludeSwimming` exists so the option can be priced rather than argued about. The
 * question is parked as an `open` row on the bike block in conditioning.json.
 */
export interface PeakHr {
  /** The highest single reading, whatever produced it. */
  bpm: number;
  /** When, so a page can date the claim instead of asserting it. */
  date: string;
  /** What activity it came from, because that decides how much to trust it. */
  kind: string;
  /** How many sessions have exceeded `bpm`. Always 0 by construction: the point is that a page can
   *  print it and a verification step can check it, rather than the reader taking the word "highest"
   *  on trust. That is the whole defect this replaces. */
  sessionsAbove: number;
}

export async function getPeakHr(opts: { excludeSwimming?: boolean } = {}): Promise<PeakHr | null> {
  const exclude = opts.excludeSwimming ? ['swimming'] : [];
  const rows = await sql`
    select date, kind, max_hr from health_session_detail
    where max_hr is not null and not (kind = any(${exclude}))
    order by max_hr desc, start_time desc
    limit 1
  `;
  const top = rows[0] as { date: unknown; kind: string; max_hr: number } | undefined;
  if (!top) return null;
  const aboveRows = await sql`
    select count(*)::int n from health_session_detail
    where max_hr is not null and not (kind = any(${exclude})) and max_hr > ${top.max_hr}
  `;
  return {
    bpm: top.max_hr,
    date: top.date instanceof Date ? top.date.toISOString().slice(0, 10) : String(top.date).slice(0, 10),
    kind: top.kind,
    sessionsAbove: (aboveRows[0] as { n: number }).n,
  };
}
