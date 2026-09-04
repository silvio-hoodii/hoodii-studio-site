import 'server-only';
import { getLastTrainingRow, getSessionDay } from './db';
import { sql } from '../health/db';
import { DAY_ORDER } from './program-shared';
import type { DayKey } from './types';

function dateDiffDays(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
}

export interface NextUp {
  today: string;
  lastDay: DayKey | null;
  lastDate: string | null;
  daysSince: number | null;
  nextDay: DayKey;
  /* NO STREAK HERE, and that absence is the point. Removed 2026-08-26.
   *
   * This module used to return one, counted off the app's own log, and it was rendered on /gym and
   * on the hub while a SECOND, watch-based count was rendered on /gym/conditioning. Two numbers of
   * the same shape and name, computed from different evidence, shown as though interchangeable.
   *
   * There is now exactly one, `getTrainingStreak` in ./week.ts, and it counts a day the app logged
   * as well as a day the watch saw, so it is more complete than this one was. Do not reintroduce a
   * streak field here: the reason the old pair could disagree for weeks without anyone noticing is
   * that nothing structural stopped them existing side by side. */
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
  /** Lifting sessions the WATCH recorded after the last logged one, on dates the app has nothing
   *  for. Each advances the rotation by one. The page prints the count and the dates, because a
   *  guess he cannot see is a guess he cannot correct. */
  assumedFromWatch: number;
  assumedDates: string[];
}

/** Rolling "what's next": two sessions, alternated. Train any day, rest = days you didn't.
 *
 * READS THE APP'S LOG AND THE WATCH, since 2026-09-03. Until then it read the app only, on the
 * argument that only the app knows WHICH session was performed. True, and it made the answer wrong
 * more often than right: between 2026-05-25 and 2026-08-25 the watch recorded 72 lifting sessions
 * and the app 37, so most weeks the rotation was computed over a minority of his training and
 * reset to Session A after any seven-day gap in LOGGING. His words on 2026-09-03: "I don't even
 * know if the session that I'm doing is the right one."
 *
 * With two sessions the inference is honest: a lifting session the watch saw and the app did not is
 * one step of the rotation, whichever it was. The count and dates are returned so the card can say
 * what was assumed, and the tabs let him override it in one tap.
 *
 * THE LAYOFF RESET IS GONE with the four-session week. It sent him to Session A after seven days
 * without a LOGGED session, which is the bug above wearing a different name. Two sessions have no
 * "start of the cycle" to reset to: after any gap the next session is simply the other one. */
export async function computeNextUp(today: string): Promise<NextUp> {
  const lastRow = await getLastTrainingRow();

  let lastDay: DayKey | null = null;
  let lastDate: string | null = null;
  let daysSince: number | null = null;
  let cutShort = false;
  let base = 0; // index into DAY_ORDER of the session the rotation would offer from the app log alone

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
    /* A key the rotation no longer knows (c and d from the four-session week, weekday names before
       that) means the last logged session predates this week's shape. Start from A. */
    base = idx === -1 ? 0 : cutShort ? idx : (idx + 1) % DAY_ORDER.length;
  }

  /* Watch sessions after the last logged date, on dates the app has no session for. `date` on both
     tables is the local Calgary date. Today is excluded: a session in progress right now is
     `todayDay`'s business, and the watch export is manual so it never has today's data anyway. */
  const watchRows = (await sql`
    select distinct w.date::text as date
    from health_watch_session w
    where w.kind = 'strength'
      and w.date > ${lastDate ?? '1970-01-01'}
      and w.date < ${today}
      and not exists (select 1 from gym_session g where g.date = w.date)
    order by w.date
  `) as unknown as { date: string }[];
  const assumedDates = watchRows.map((r) => r.date);
  const assumedFromWatch = assumedDates.length;

  const nextDay: DayKey = DAY_ORDER[(base + assumedFromWatch) % DAY_ORDER.length]!;
  const todayDay = (await getSessionDay(today)) as DayKey | null;

  return { today, lastDay, lastDate, daysSince, nextDay, todayDay, cutShort, assumedFromWatch, assumedDates };
}
