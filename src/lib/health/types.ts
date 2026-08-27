export interface BodyCompPoint {
  date: string;
  kg: number | null;
  bf_pct: number | null;
  fat_kg: number | null;
  lean_kg: number | null;
}

export interface BodyCompSummary {
  latest: BodyCompPoint | null;
  smoothedKg: number | null;
  trend30: TrendDelta | null;
  trend90: TrendDelta | null;
  /* Days between the newest reading and today. The store was filled once, by a migration script
   * that has no recurring counterpart, so without this the page would render "as of 2026-08-09"
   * forever and every reader would take it for a current weight. */
  daysSinceLatest: number | null;
  /* 14 days, the same threshold HealthOS/CURRENT.md applies to itself. */
  stale: boolean;
}

export interface TrendDelta {
  fromDate: string;
  spanDays: number;
  kg: number;
  perWeek: number;
}

/* SwimPoint and SwimSummary left this file on 2026-08-26. They are SwimSessionRow and SwimHistory
 * in src/lib/swim/db.ts, declared next to the query that fills them, because swim became its own
 * route and nothing under /health reads a swim number any more. Their field-level notes went with
 * them: which pace is wall clock, which excludes rest, and why the second is never a fallback for
 * the first. */

export interface AdherenceDay {
  date: string;
  trained: boolean;
  logged: boolean;
  /* Whether the watch export has reached this day at all. Days past the last synced session used to
   * render identically to days he genuinely rested, so a stalled sync looked like a month off. */
  known: boolean;
}
