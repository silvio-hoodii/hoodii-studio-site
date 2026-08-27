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

export interface SwimPoint {
  date: string;
  distanceM: number | null;
  pacePer100mMs: number | null;
}

export interface SwimSummary {
  sessions: SwimPoint[];
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
}

export interface AdherenceDay {
  date: string;
  trained: boolean;
  logged: boolean;
  /* Whether the watch export has reached this day at all. Days past the last synced session used to
   * render identically to days he genuinely rested, so a stalled sync looked like a month off. */
  known: boolean;
}
