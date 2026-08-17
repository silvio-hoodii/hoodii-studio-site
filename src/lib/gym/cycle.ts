import 'server-only';
import { getLastTrainingRow, getSessionDay, getTrainingDates } from './db';
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
  /** The day already recorded against today, if there is one.
   *
   * `nextDay` is the answer to "what should I train next", and the hub asks exactly that. It is the
   * wrong answer to "what am I looking at", because the moment the first set of a session lands,
   * `getLastTrainingRow` returns TODAY and the cycle advances past it: reloading /gym mid-workout
   * opened the FOLLOWING day, with different exercises and every box empty, and the session he was
   * halfway through looked like it had never happened. Reported as the app "behaving a little bit
   * weird" on 2026-08-14 after a real session. Two questions, two fields. */
  todayDay: DayKey | null;
  /** The last session was ended as CUT SHORT, so `nextDay` is a repeat rather than the next in the
   *  rotation. The page says so, because silently re-offering the same day reads as a bug. */
  cutShort: boolean;
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
  let cutShort = false;

  if (lastRow?.date) {
    lastDay = lastRow.day as DayKey | null;
    lastDate = lastRow.date;
    daysSince = dateDiffDays(today, lastDate);
    const idx = lastDay ? DAY_ORDER.indexOf(lastDay) : -1;
    /* A DAY HE CUT SHORT IS NOT A DAY HE DID, so the rotation does not step past it.
     *
     * 2026-08-16, in the note box: "Didn't have that much time so can we just restart from here next
     * session whats the best approach". He had logged two sets of back squat out of a Lower A day
     * holding eight exercises, and because this is a rotation rather than a calendar, the next line
     * of code moved him to Upper A and Lower A was simply gone. Answering that in prose would have
     * been telling him to remember something; the fix is that there is nothing to remember. */
    cutShort = lastRow.status === 'cutshort';
    nextDay = idx === -1 || daysSince > LAYOFF_RESET_DAYS
      ? DAY_ORDER[0]!
      : cutShort
        ? DAY_ORDER[idx]!
        : DAY_ORDER[(idx + 1) % DAY_ORDER.length]!;
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

  const todayDay = (await getSessionDay(today)) as DayKey | null;

  return { today, lastDay, lastDate, daysSince, nextDay, streak, restNudge: streak >= 5, todayDay, cutShort };
}
