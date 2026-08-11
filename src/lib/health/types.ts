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
  bestPacePer100mMs: number | null;
  totalSessions: number;
}

export interface AdherenceDay {
  date: string;
  trained: boolean;
  logged: boolean;
}
