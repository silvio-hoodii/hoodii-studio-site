import 'server-only';
import { getLastTrainingRow, getTrainingDates } from './db';
import { DAY_ORDER } from './program-shared';
import type { DayKey } from './types';

// A gap longer than this (days) is a layoff, not a normal weekend rest: restart the cycle at
// Lower A instead of continuing from the stale last day. Ported from HealthOS server.mjs.
const LAYOFF_RESET_DAYS = 7;

function dateDiffDays(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
}

export interface NextUp {
  today: string;
  lastDay: DayKey | null;
  lastDate: string | null;
  daysSince: number | null;
  nextDay: DayKey;
  streak: number;
  restNudge: boolean;
}

/** Rolling "what's next": dropped weekday-locking, train any day, rest = days you didn't.
 *
 * Deliberately NOT porting the watch-augmented layoff detection from HealthOS server.mjs (it reads
 * a `watch_sessions` table fed by a separate Samsung Health import pipeline that isn't part of this
 * migration). This reads the app's own log only, same as the app did before that addition: the gap
 * it closed was "trained but didn't open the app to log it", which stays a real but smaller
 * inaccuracy until/unless the watch import gets ported too. */
export async function computeNextUp(today: string): Promise<NextUp> {
  const lastRow = await getLastTrainingRow();

  let lastDay: DayKey | null = null;
  let lastDate: string | null = null;
  let daysSince: number | null = null;
  let nextDay: DayKey = DAY_ORDER[0]!;

  if (lastRow?.date) {
    lastDay = lastRow.day as DayKey | null;
    lastDate = lastRow.date;
    daysSince = dateDiffDays(today, lastDate);
    const idx = lastDay ? DAY_ORDER.indexOf(lastDay) : -1;
    nextDay = idx === -1 || daysSince > LAYOFF_RESET_DAYS ? DAY_ORDER[0]! : DAY_ORDER[(idx + 1) % DAY_ORDER.length]!;
  }

  const dates = await getTrainingDates();
  let streak = 0;
  if (dates.length) {
    streak = 1;
    for (let i = 1; i < dates.length; i++) {
      if (dateDiffDays(dates[i - 1]!, dates[i]!) === 1) streak++;
      else break;
    }
    if (daysSince != null && daysSince > 1) streak = 0; // currently resting
  }

  return { today, lastDay, lastDate, daysSince, nextDay, streak, restNudge: streak >= 5 };
}
