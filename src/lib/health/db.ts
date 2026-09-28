import 'server-only';
import { neon } from '@neondatabase/serverless';
import type { AdherenceDay, BodyCompPoint, BodyCompSummary, TrendDelta } from './types';
import { today, daysAgo } from '../day';

// Same underlying Neon database as Kitchen/Gym (health_ prefix keeps the tables apart), see
// content/health/schema.sql. Falls back through the same chain gym/db.ts uses in case
// HEALTH_DATABASE_URL isn't set on Vercel yet: there is no actual separate database.
const DATABASE_URL =
  process.env.HEALTH_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('HEALTH_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL as fallback) is not set');
}

export const sql = neon(DATABASE_URL);

// Calgary dates, not UTC ones: every row in these tables was stamped in local time. See lib/day.ts.
const isoDaysAgo = (days: number): string => daysAgo(days);

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/* The same 14 days HealthOS/CURRENT.md uses to flag itself. One threshold, one meaning, whichever
 * surface you read it on. */
export const STALE_AFTER_DAYS = 14;

/** How far back the Weight tile's delta reaches, in days. */
const TREND_DAYS = 30;

/** Weight/body-fat series for the trend chart, one point per day, Watch preferred over Scale. */
export async function getBodyCompSeries(days = 120): Promise<BodyCompPoint[]> {
  const cutoff = isoDaysAgo(days);
  /* `source` is SELECTED, since 2026-08-28. This query has always PREFERRED Watch per date and
     silently accepted a Scale row on a date with no Watch reading, which is right for the weight
     line and wrong for anything that subtracts one reading from another: see BodyCompPoint's note
     and `sameSourcePair` in ./split.ts. It was the one column the caller needed to tell the two
     apart and the only one not returned. */
  const rows = await sql`
    select distinct on (date) date, source, kg, bf_pct, fat_kg, lean_kg
    from health_body_comp
    where kg is not null and date >= ${cutoff}
    order by date asc, (source = 'Watch') desc
  `;
  return rows as unknown as BodyCompPoint[];
}

/* getWatchComposition, the Watch-only read of skeletal muscle, water and BMR, lived here until
 * 2026-09-27. The Weight tab takes the same rows from getWeightTabBody in ./year.ts, with the same
 * Watch-only filter, so it had no caller left. */

/** The newest reading, and the change over the last 30 days measured the way HealthOS measures it.
 *
 *  HEALTHOS OWNS EVERY BODY NUMBER (HOODII/CLAUDE.md), and its rate of loss is computed from a
 *  SMOOTHED endpoint: the median of up to five Watch readings in the 30 days before the newest one,
 *  against the newest same-source reading at least 30 days earlier. For a morning on 2026-09-27
 *  this rewrite measured latest-minus-prior instead and printed +0.5 kg under a CURRENT.md that said
 *  +0.9 kg, the flattering direction. The tile still prints the latest reading; the trend line
 *  names its basis ("median of 4, 104.6 kg") so the two numbers are visibly different facts.
 *  One round trip: the latest row, its smoothing window and its prior come back from one statement. */
export async function getBodyCompSummary(): Promise<BodyCompSummary> {
  const rows = (await sql`
    with l as (
      select date, source, kg, bf_pct, fat_kg, lean_kg from health_body_comp
      where kg is not null
      order by date desc, (source = 'Watch') desc limit 1
    )
    select 'latest' as role, l.date, l.source, l.kg, l.bf_pct, l.fat_kg, l.lean_kg from l
    union all
    select 'prior' as role, p.date, p.source, p.kg, null, null, null
      from l cross join lateral (
        select h.date, h.source, h.kg from health_body_comp h
        where h.kg is not null and h.source = 'Watch'
          and h.date <= to_char(l.date::date - ${TREND_DAYS}::int, 'YYYY-MM-DD')
        order by h.date desc limit 1
      ) p
    union all
    select 'recent' as role, r.date, r.source, r.kg, null, null, null
      from l cross join lateral (
        select h.date, h.source, h.kg from health_body_comp h
        where h.kg is not null and h.source = 'Watch'
          and h.date >= to_char(l.date::date - ${TREND_DAYS}::int, 'YYYY-MM-DD') and h.date <= l.date
        order by h.date desc limit 5
      ) r
  `) as unknown as (BodyCompPoint & { role: string })[];
  const pick = (role: string): BodyCompPoint | null => {
    const r = rows.find((x) => x.role === role);
    if (!r) return null;
    const { role: _role, ...point } = r;
    void _role;
    return point;
  };
  const latest = pick('latest');
  if (!latest || latest.kg == null) {
    return { latest: null, trend30: null, daysSinceLatest: null, stale: false };
  }

  /* How old the newest reading is, so a weight months old never renders as current. */
  const daysSinceLatest = Math.max(0, daysBetween(latest.date, today()));
  const stale = daysSinceLatest > STALE_AFTER_DAYS;

  const prior = pick('prior');
  const recent = rows.filter((x) => x.role === 'recent' && x.kg != null).map((x) => Number(x.kg)).sort((a, b) => a - b);
  const mid = recent.length >> 1;
  const smoothed = recent.length >= 2
    ? { kg: recent.length % 2 ? recent[mid]! : (recent[mid - 1]! + recent[mid]!) / 2, n: recent.length }
    : { kg: latest.kg, n: 1 };
  let trend30: TrendDelta | null = null;
  if (prior?.kg != null) {
    const spanDays = daysBetween(prior.date, latest.date);
    if (spanDays >= 7) {
      const kgDelta = +(smoothed.kg - prior.kg).toFixed(1);
      trend30 = {
        fromDate: prior.date, spanDays, kg: kgDelta, perWeek: +((kgDelta / spanDays) * 7).toFixed(2),
        basisKg: +smoothed.kg.toFixed(1), basisN: smoothed.n,
      };
    }
  }
  return { latest, trend30, daysSinceLatest, stale };
}

export interface SyncLiveness {
  lastOkAt: string | null;
  hoursSince: number | null;
  stale: boolean;
  lastError: string | null;
}

/* Whether the MIRROR is being written, which is a different question from whether he has weighed
 * himself lately and the page was answering both with one sentence. A store filled once and never
 * again looks exactly like a person who stopped stepping on the scale.
 *
 * EIGHT DAYS, since 2026-09-15. It was 36 hours, the threshold /music uses, from when a scheduled
 * task ran this sync every morning. That task was retired on 2026-09-04 and he now exports on
 * Sundays, so 36 hours made /health and the front door say "the sync has stopped" from every Tuesday
 * to every Sunday. A week plus a day means a missed Sunday is what trips it. */
const SYNC_STALE_AFTER_HOURS = 8 * 24;

export async function getSyncLiveness(): Promise<SyncLiveness> {
  const rows = await sql`
    select ran_at, ok, error from health_sync order by ran_at desc limit 20
  `;
  const all = rows as unknown as { ran_at: string; ok: boolean; error: string | null }[];
  const lastOk = all.find((r) => r.ok) ?? null;
  /* Only a failure NEWER than the last success. This took the newest failure anywhere in twenty rows,
     so /health printed "database is not open" from a run on Sep 9 under two good runs on Sep 11. */
  const lastOkIdx = all.findIndex((r) => r.ok);
  const lastErr = (lastOkIdx === -1 ? all : all.slice(0, lastOkIdx)).find((r) => !r.ok && r.error)?.error ?? null;
  if (!lastOk) {
    // No successful run on record at all, including the case where the table is empty.
    return { lastOkAt: null, hoursSince: null, stale: true, lastError: lastErr };
  }
  const hoursSince = (Date.now() - Date.parse(lastOk.ran_at)) / 3_600_000;
  return {
    lastOkAt: lastOk.ran_at,
    hoursSince: Math.floor(hoursSince),
    stale: hoursSince > SYNC_STALE_AFTER_HOURS,
    lastError: lastErr,
  };
}

/* getSwimSummary LEFT THIS FILE on 2026-08-26 and is getSwimHistory in src/lib/swim/db.ts. Swim
 * became its own route and /health no longer renders any swim number: it links there instead. Same
 * tables, same two-pace split, same reasoning about why a single minimum over a mixed column read
 * faster than his own personal best. It reads health_swim_session across a database boundary that
 * does not exist: this is one Neon database and the table prefixes are what keep the surfaces
 * apart, so the read moved to the page that needs it rather than the table moving anywhere. */

/** Per-day training attendance for the last N days: trained (a watch session or a logged lift) vs
 *  logged in the gym app ("logged"). Reads gym_set directly (same Postgres database, gym_ tables) rather than
 *  duplicating that state: the "trained but unlogged" gap is exactly what CURRENT.md already
 *  surfaces, computed the same way: attendance from the watch, load from the app.
 *
 *  `trained` IS ANY DISCIPLINE, and was `kind = 'strength'` until 2026-08-28.
 *
 *  The strip renders under a caption reading "Read from the watch, which records every session" and a
 *  lede naming lifting, swimming, running and riding in one count. It was drawing lifting only, so a
 *  day he swam was an empty cell with `aria-label` "rest". Measured over the live 30-day window: 17
 *  strength days against 20 any-kind days, and the three it called rest were a 40-minute run on
 *  2026-08-24, 59 minutes of swimming across three sessions on 2026-08-21, and a 43-minute swim on
 *  2026-08-07 (09-health P1-3).
 *
 *  WHAT MAKES IT A LIE RATHER THAN A LIMITATION: "What actually happened", on the SAME TAB, shows
 *  those days as trained. Two blocks one scroll apart disagreeing about whether he trained on a
 *  Friday, one of them in a shape that reads as a verdict on his adherence.
 *
 *  `logged` deliberately stays LIFTING ONLY, because that is the useful gap: the watch sees
 *  attendance and only the gym app sees load, so "trained but unlogged" means a session whose weights
 *  are missing. The caption has to say which half is which, and the page says so.
 *
 *  The function keeps its name for one release rather than being renamed in the same commit as a
 *  behaviour change: two things to review at once is how a rename gets read as a no-op. */
export async function getLiftingAdherence(days = 30, kind?: 'strength'): Promise<{ days: AdherenceDay[]; horizon: string | null }> {
  const cutoff = isoDaysAgo(days);
  const [trainedRows, loggedRows, horizonRows] = await Promise.all([
    /* Any discipline for /health (his ruling, 09-health P1-3); lifting only for the gym row on the
       index, which says "Last lifted" above it and drew swim days as lifting days until 2026-09-27. */
    kind
      ? sql`select distinct date from health_watch_session where date >= ${cutoff} and kind = ${kind}`
      : sql`select distinct date from health_watch_session where date >= ${cutoff}`,
    /* A performed set is done OR typed, the rule src/lib/gym/log.ts applies (ON_PLAN_PERFORMED). */
    sql`select distinct date from gym_set where (done = true or (reps is not null and reps > 0)) and reps is not null and reps > 0 and date >= ${cutoff}`,
    /* How far the watch export has actually reached, across every kind of session and not just
     * strength: a swim on the 9th is proof the sync ran that day, an absence of strength rows is
     * not. Past this date the strip knows nothing, and it now says so instead of drawing a rest
     * day. The migration was one-shot, so this horizon has been frozen since 2026-08-09. */
    sql`select max(date) as last from health_watch_session`,
  ]);
  const trained = new Set((trainedRows as unknown as { date: string }[]).map((r) => r.date));
  const logged = new Set((loggedRows as unknown as { date: string }[]).map((r) => r.date));
  const horizon = (horizonRows[0] as { last: string | null } | undefined)?.last ?? null;

  const out: AdherenceDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgo(i);
    /* A day the app logged is known regardless of the watch: the gym log is its own evidence. */
    const isLogged = logged.has(date);
    out.push({
      date,
      /* A LOGGED LIFT IS A TRAINED DAY, the rule `actualBlock` in src/lib/gym/week.ts uses for
         "Days in a row" and "What actually happened" on the same tab. Until 2026-09-27 this strip
         was watch-only, so a lift the watch missed was a rest cell under a count that called it
         trained. `logged` still marks the hole-punch. */
      trained: trained.has(date) || isLogged,
      logged: isLogged,
      known: isLogged || (horizon != null && date <= horizon),
    });
  }
  /* The horizon comes back with the days. Deriving "where does the export stop" from the `known`
   * flags instead reads the wrong answer the moment he logs a session past the horizon: that day
   * is known because the APP saw it, and the page would then announce the export reaches a date it
   * has never reached. Found by an adversarial pass on 2026-08-14. */
  return { days: out, horizon };
}

/** Every day since `from` on which he lifted: a strength session on the watch, or sets logged in the
 *  app, which is its own evidence (the watch is sometimes not worn). For the year chart's tick row.
 *  Added 2026-09-27. */
export async function getLiftDays(from: string): Promise<string[]> {
  const rows = (await sql`
    select date::text as d from health_watch_session where kind = 'strength' and date >= ${from}
    union
    select date::text from gym_set where done = true and reps > 0 and date >= ${from}
    order by 1`) as unknown as { d: string }[];
  return rows.map((r) => r.d.slice(0, 10));
}
