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

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : (((s[m - 1] as number) + (s[m] as number)) / 2);
}

/** Weight/body-fat series for the trend chart, one point per day, Watch preferred over Scale. */
export async function getBodyCompSeries(days = 120): Promise<BodyCompPoint[]> {
  const cutoff = isoDaysAgo(days);
  const rows = await sql`
    select distinct on (date) date, kg, bf_pct, fat_kg, lean_kg
    from health_body_comp
    where kg is not null and date >= ${cutoff}
    order by date asc, (source = 'Watch') desc
  `;
  return rows as unknown as BodyCompPoint[];
}

/** Latest reading + smoothed trend, same method as HealthOS/server/publish-current.mjs: a median
 *  of the last 5 Watch readings so one dry morning cannot bend the reported rate. */
export async function getBodyCompSummary(): Promise<BodyCompSummary> {
  const latestRows = await sql`
    select date, kg, bf_pct, fat_kg, lean_kg from health_body_comp
    where kg is not null
    order by date desc, (source = 'Watch') desc limit 1
  `;
  const latest = (latestRows[0] as BodyCompPoint | undefined) ?? null;
  if (!latest) {
    return { latest: null, smoothedKg: null, trend30: null, trend90: null, daysSinceLatest: null, stale: false };
  }

  /* How old the newest reading is. This store was filled by a one-shot migration with no recurring
   * sync behind it, so "as of 2026-08-09" would have rendered as current weight indefinitely. */
  const daysSinceLatest = Math.max(0, daysBetween(latest.date, today()));
  const stale = daysSinceLatest > STALE_AFTER_DAYS;

  const recentRows = await sql`
    select kg from health_body_comp
    where kg is not null and source = 'Watch' and date <= ${latest.date}
    order by date desc limit 5
  `;
  const recentKg = (recentRows as unknown as { kg: number }[]).map((r) => r.kg);
  const smoothedKg = recentKg.length ? median(recentKg) : latest.kg;

  const trendAt = async (days: number): Promise<TrendDelta | null> => {
    // latest.date may not be today (measurement lag): the lookback is relative to latest.date, not now.
    const target = new Date(Date.parse(latest.date) - days * 86400000).toISOString().slice(0, 10);
    const priorRows = await sql`
      select date, kg from health_body_comp
      where kg is not null and date <= ${target}
      order by date desc, (source = 'Watch') desc limit 1
    `;
    const prior = priorRows[0] as { date: string; kg: number } | undefined;
    if (!prior) return null;
    const spanDays = daysBetween(prior.date, latest.date);
    if (spanDays < 7 || smoothedKg == null) return null;
    const kgDelta = +(smoothedKg - prior.kg).toFixed(1);
    return { fromDate: prior.date, spanDays, kg: kgDelta, perWeek: +((kgDelta / spanDays) * 7).toFixed(2) };
  };

  const [trend30, trend90] = await Promise.all([trendAt(30), trendAt(90)]);
  return { latest, smoothedKg, trend30, trend90, daysSinceLatest, stale };
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
 * 36 hours, the same threshold /music uses for its collector: a daily job that has not run in a day
 * and a half has missed one, and one is enough to say so. */
const SYNC_STALE_AFTER_HOURS = 36;

export async function getSyncLiveness(): Promise<SyncLiveness> {
  const rows = await sql`
    select ran_at, ok, error from health_sync order by ran_at desc limit 20
  `;
  const all = rows as unknown as { ran_at: string; ok: boolean; error: string | null }[];
  const lastOk = all.find((r) => r.ok) ?? null;
  const lastErr = all.find((r) => !r.ok && r.error)?.error ?? null;
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

/** Per-day lifting attendance for the last N days: watch-detected ("trained") vs logged in the gym
 *  app ("logged"). Reads gym_set directly (same Postgres database, gym_ tables) rather than
 *  duplicating that state: the "trained but unlogged" gap is exactly what CURRENT.md already
 *  surfaces, computed the same way: attendance from the watch, load from the app. */
export async function getLiftingAdherence(days = 30): Promise<{ days: AdherenceDay[]; horizon: string | null }> {
  const cutoff = isoDaysAgo(days);
  const [trainedRows, loggedRows, horizonRows] = await Promise.all([
    sql`select distinct date from health_watch_session where kind = 'strength' and date >= ${cutoff}`,
    sql`select distinct date from gym_set where done = true and reps is not null and reps > 0 and date >= ${cutoff}`,
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
      trained: trained.has(date),
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
