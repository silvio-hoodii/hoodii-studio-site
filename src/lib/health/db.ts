import 'server-only';
import { neon } from '@neondatabase/serverless';
import type { AdherenceDay, BodyCompPoint, BodyCompSummary, SwimSummary, TrendDelta } from './types';

// Same underlying Neon database as Kitchen/Gym (health_ prefix keeps the tables apart), see
// content/health/schema.sql. Falls back through the same chain gym/db.ts uses in case
// HEALTH_DATABASE_URL isn't set on Vercel yet — there is no actual separate database.
const DATABASE_URL =
  process.env.HEALTH_DATABASE_URL || process.env.GYM_DATABASE_URL || process.env.KITCHEN_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('HEALTH_DATABASE_URL (or GYM_DATABASE_URL / KITCHEN_DATABASE_URL as fallback) is not set');
}

export const sql = neon(DATABASE_URL);

const isoDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

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
  if (!latest) return { latest: null, smoothedKg: null, trend30: null, trend90: null };

  const recentRows = await sql`
    select kg from health_body_comp
    where kg is not null and source = 'Watch' and date <= ${latest.date}
    order by date desc limit 5
  `;
  const recentKg = (recentRows as unknown as { kg: number }[]).map((r) => r.kg);
  const smoothedKg = recentKg.length ? median(recentKg) : latest.kg;

  const trendAt = async (days: number): Promise<TrendDelta | null> => {
    // latest.date may not be today (measurement lag) — the lookback is relative to latest.date, not now.
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
  return { latest, smoothedKg, trend30, trend90 };
}

/** Session-level swim history for the last N days, plus all-time PRs. */
export async function getSwimSummary(days = 90): Promise<SwimSummary> {
  const cutoff = isoDaysAgo(days);
  const [sessionRows, prRows] = await Promise.all([
    sql`
      select date, distance_m, pace_per_100m_ms from health_swim_session
      where date >= ${cutoff}
      order by date asc
    `,
    sql`
      select
        max(distance_m) filter (where distance_m > 0) as longest,
        min(pace_per_100m_ms) filter (where pace_per_100m_ms > 0) as best_pace,
        count(*) as total
      from health_swim_session
    `,
  ]);
  const pr = prRows[0] as { longest: number | null; best_pace: number | null; total: string };
  return {
    sessions: (sessionRows as unknown as { date: string; distance_m: number | null; pace_per_100m_ms: number | null }[]).map(
      (r) => ({ date: r.date, distanceM: r.distance_m, pacePer100mMs: r.pace_per_100m_ms }),
    ),
    longestDistanceM: pr.longest,
    bestPacePer100mMs: pr.best_pace,
    totalSessions: Number(pr.total),
  };
}

/** Per-day lifting attendance for the last N days: watch-detected ("trained") vs logged in the gym
 *  app ("logged"). Reads gym_set directly (same Postgres database, gym_ tables) rather than
 *  duplicating that state — the "trained but unlogged" gap is exactly what CURRENT.md already
 *  surfaces, computed the same way: attendance from the watch, load from the app. */
export async function getLiftingAdherence(days = 30): Promise<AdherenceDay[]> {
  const cutoff = isoDaysAgo(days);
  const [trainedRows, loggedRows] = await Promise.all([
    sql`select distinct date from health_watch_session where kind = 'strength' and date >= ${cutoff}`,
    sql`select distinct date from gym_set where done = true and reps is not null and reps > 0 and date >= ${cutoff}`,
  ]);
  const trained = new Set((trainedRows as unknown as { date: string }[]).map((r) => r.date));
  const logged = new Set((loggedRows as unknown as { date: string }[]).map((r) => r.date));

  const out: AdherenceDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ date, trained: trained.has(date), logged: logged.has(date) });
  }
  return out;
}
